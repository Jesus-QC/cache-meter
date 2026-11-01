import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'cache-meter',
  component: 'Pane',
  requestId: 'cache-meter',
  props: {
    title: 'Cache',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const RUN = {
  command: 'cache-meter',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
} as const

const USAGE = {
  model: 'claude-opus-5-5',
  input_tokens: 500,
  output_tokens: 200,
  cache_read_input_tokens: 9_000,
  cache_creation_input_tokens: 500,
}

function engine(on: On) {
  on('command.register', () => ({ value: { command: 'cache-meter' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: '' }))
  on('session.id', () => ({ value: 'abc' }))
  on('session.cwd', () => ({ value: '/work/my app' }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/me' : undefined }))
  return mock.clock(on)
}

// One transcript line: a main-thread reply at `at`, its cache written with the given lifetime.
function reply(at: number, lifetime: '1h' | '5m') {
  return JSON.stringify({
    type: 'assistant',
    isSidechain: false,
    timestamp: new Date(at).toISOString(),
    message: {
      model: 'claude-opus-5-5',
      usage: {
        input_tokens: 10,
        cache_read_input_tokens: 9_000,
        cache_creation_input_tokens: 500,
        cache_creation: { ephemeral_1h_input_tokens: lifetime === '1h' ? 500 : 0, ephemeral_5m_input_tokens: lifetime === '5m' ? 500 : 0 },
      },
    },
  })
}

const TURN = { answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer', usage: USAGE } as const

test('a finished turn reads hot, on every surface', async ($, on) => {
  engine(on)
  await $.turn.complete(TURN)
  const out = await $.command.run(RUN)
  expect(JSON.stringify(out)).toContain('Cache is hot')
  expect(JSON.stringify(out)).toContain('cold in 1h 0m')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /^Hot$/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /of input from cache/ })).toBeFalsy()
    await ui.unmount()
  }
})

test('a subagent turn leaves the main reading alone', async ($, on) => {
  engine(on)
  await $.turn.complete({ ...TURN, agentId: 'a1' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /No reply in this conversation yet/ })).toBeTruthy()
  await ui.unmount()
})

test('a 5m lifetime cools near the end and goes cold after 5 minutes', { options: { cacheTtl: '5m' } }, async ($, on) => {
  const clock = engine(on)
  await $.turn.complete(TURN)

  await clock.advance(4.5 * 60_000)
  expect(JSON.stringify(await $.command.run(RUN))).toContain('Cache is cooling')
  await clock.advance(60_000)
  expect(JSON.stringify(await $.command.run(RUN))).toContain('Cache is cold')
})

test('a compaction marks the cache cold', async ($, on) => {
  engine(on)
  const kept = [{ role: 'user' as const, text: 'summary', toolUses: [] }]
  on('session.compact', () => ({ messages: [...kept] }) as never)
  await $.turn.complete(TURN)
  await $.session.compact({ trigger: 'manual', messages: [...kept] })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /cold: conversation compacted/ })).toBeTruthy()
  await ui.unmount()
})

test('an old conversation reads its last reply from the transcript', async ($, on) => {
  const clock = engine(on)
  let path = ''
  const fiftyFiveMinutesAgo = clock.now() - 55 * 60_000
  on('fs.read', (_, e) => {
    path = e.path
    return { value: [JSON.stringify({ type: 'user' }), reply(fiftyFiveMinutesAgo, '1h'), JSON.stringify({ type: 'last-prompt' }), ''].join('\n') }
  })

  const out = JSON.stringify(await $.command.run(RUN))
  expect(path).toBe('/home/me/.claude/projects/-work-my-app/abc.jsonl')
  expect(out).toContain('Cache is cooling')
  expect(out).toContain('cold in 5m')
})

test('the transcript shows a 5m cache went cold, whatever the setting', async ($, on) => {
  const clock = engine(on)
  const tenMinutesAgo = clock.now() - 10 * 60_000
  on('fs.read', () => ({ value: reply(tenMinutesAgo, '5m') }))

  expect(JSON.stringify(await $.command.run(RUN))).toContain('Cache is cold')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /5m lifetime/ })).toBeTruthy()
  await ui.unmount()
})

test('a compaction after the last reply reads as cold', async ($, on) => {
  const clock = engine(on)
  const compact = JSON.stringify({ type: 'system', subtype: 'compact_boundary' })
  on('fs.read', () => ({ value: [reply(clock.now() - 60_000, '1h'), compact].join('\n') }))

  expect(JSON.stringify(await $.command.run(RUN))).toContain('cold: conversation compacted')
})

test('a conversation the mod saw before comes back from the store', async ($, on) => {
  const clock = engine(on)
  // What an earlier session saved for this conversation, 20 minutes before this restart.
  const saved = { at: clock.now() - 20 * 60_000, read: 9_000, write: 500, input: 500 }
  on('store.get', (_, e) => ({ value: e.key === 'reading:abc' ? saved : undefined }))
  on('fs.read', () => {
    throw new Error('the store answers before the transcript')
  })

  expect(JSON.stringify(await $.command.run(RUN))).toContain('cold in 40m')
})

test('a finished turn is saved under the conversation', async ($, on) => {
  engine(on)
  const store = new Map<string, unknown>()
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  await $.turn.complete(TURN)

  expect(store.has('reading:abc')).toBe(true)
})
