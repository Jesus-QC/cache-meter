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
  return mock.clock(on)
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
  expect(await ui.find({ type: 'Text', text: /No cache reading yet/ })).toBeTruthy()
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
