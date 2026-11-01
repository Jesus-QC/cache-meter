import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CacheReading } from '../types'

const PANE = 'cache-meter'
const TITLE = 'Cache'

const reading = atom({ plugin: 'cache-meter', key: 'reading' } as const, null as CacheReading | null, {
  shape: 'reading-1',
})
// Ticks every minute so the countdown moves between turns.
const now = atom({ plugin: 'cache-meter', key: 'now' } as const, 0, {
  shape: 'now-1',
})

// The bar and the crab are the usage meter's own, so the two panes look alike.
function barSvg(left: number, even: number | undefined, reset: string | undefined) {
  const W = 600
  const H = 32
  const fill = Math.round(W * left)
  const marker =
    even === undefined
      ? ''
      : `<rect x="${Math.round(W * even) - 2}" y="0" width="4" height="${H}" fill="#ffffff" stroke="#000" stroke-width="1"/>`
  const pill = reset
    ? `<g><rect x="${W - 86}" y="5" width="80" height="22" rx="4" fill="#1a1a1a" fill-opacity="0.9"/>` +
      `<text x="${W - 46}" y="20.5" font-family="-apple-system,system-ui,sans-serif" font-size="12" fill="#eee" text-anchor="middle">↻ ${reset}</text></g>`
    : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs><pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<line x1="0" y1="0" x2="0" y2="8" stroke="#c96442" stroke-opacity="0.35" stroke-width="2"/></pattern>` +
    `<clipPath id="r"><rect width="${W}" height="${H}" rx="6"/></clipPath></defs>` +
    `<g clip-path="url(#r)">` +
    `<rect width="${W}" height="${H}" fill="#c96442" fill-opacity="0.08"/>` +
    `<rect width="${W}" height="${H}" fill="url(#hatch)"/>` +
    `<rect width="${fill}" height="${H}" fill="#7a3a2a"/>` +
    `</g>${marker}${pill}</svg>`
  )
}

function textBar(left: number, even: number | undefined, cells: number) {
  const width = Math.max(10, cells)
  const filled = Math.round(width * left)
  const mark = even === undefined ? -1 : Math.min(width - 1, Math.round(width * even))
  let bar = ''
  for (let i = 0; i < width; i++) bar += i === mark ? '│' : i < filled ? '█' : '░'
  return bar
}

type Mood = 'happy' | 'worried' | 'tired'

const CRAB = [' ▐▛███▜▌', '▝▜█████▛▘', '  ▘▘ ▝▝']

// The crab from Claude Code's welcome screen, one rect per pixel of its sprite:
// body x3..14 over rows 0-3, eyes at (5,1) and (12,1), claws on row 2, legs on row 4.
// Hot: red-orange, dancing, flames rising off its back. Cooling: fading from orange to
// blue and shivering. Cold: frozen blue, eyes shut, frost on top, icicles, snow falling.
const SPRITE_W = 100
const SPRITE_H = 84

function crabSvg(mood: Mood) {
  const ink = '#1f1410'
  const body = { happy: '#e8643c', worried: '#c98a74', tired: '#8fbde6' }[mood]
  // Terminal quadrant pixels are twice as tall as they are wide.
  const U = 5
  const H = 10
  const OX = 8
  const OY = 24
  const px = (x: number, y: number, fill = body, h = H, dy = 0) =>
    `<rect x="${OX + x * U}" y="${OY + y * H + dy}" width="${U}" height="${h}" fill="${fill}"/>`
  const span = (y: number, from: number, to: number, skip: number[] = []) => {
    let out = ''
    for (let x = from; x <= to; x++) if (!skip.includes(x)) out += px(x, y)
    return out
  }
  // Cooling: the whole body drifts from warm to icy and back while it shivers.
  const fade =
    mood === 'worried'
      ? `<animate attributeName="fill" values="#e8643c;#8fbde6;#e8643c" dur="4s" repeatCount="indefinite"/>`
      : ''
  const torso = `<g fill="${body}">${fade}` +
    [span(0, 3, 14), span(1, 3, 14, [5, 12]), span(2, 3, 14), span(3, 3, 14)].join('').replaceAll(` fill="${body}"`, '') +
    `</g>`

  const blink = `<animate attributeName="fill" values="${ink};${ink};${body};${ink}" keyTimes="0;0.9;0.95;1" dur="3.6s" repeatCount="indefinite"/>`
  const eye = (x: number) =>
    mood === 'tired'
      ? px(x, 1) + px(x, 1, ink, 2.5, H / 2)
      : `<rect x="${OX + x * U}" y="${OY + H}" width="${U}" height="${H}" fill="${ink}">${blink}</rect>`

  const step = (dur: string, begin: string) =>
    `<animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0" dur="${dur}" begin="${begin}" calcMode="discrete" repeatCount="indefinite"/>`
  const legDur = { happy: '0.4s', worried: '0.24s', tired: '0s' }[mood]
  const legs = (xs: number[], begin: string) =>
    `<g>${xs.map(x => px(x, 4)).join('')}${legDur === '0s' ? '' : step(legDur, begin)}</g>`

  const wave = (begin: string) =>
    mood === 'happy'
      ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -${H / 2};0 0" dur="0.7s" begin="${begin}" calcMode="discrete" repeatCount="indefinite"/>`
      : ''
  const claws = `<g>${px(1, 2)}${px(2, 2)}${wave('0s')}</g><g>${px(15, 2)}${px(16, 2)}${wave('0.35s')}</g>`

  const move = {
    happy: `<animateTransform attributeName="transform" type="translate" values="0 0;3 -2;6 0;3 -2;0 0;-3 -2;-6 0;-3 -2;0 0" dur="2.4s" repeatCount="indefinite"/>`,
    worried: `<animateTransform attributeName="transform" type="translate" values="0 0;1.5 0;-1.5 0;0 0" dur="0.25s" repeatCount="indefinite"/>`,
    tired: `<animateTransform attributeName="transform" type="translate" values="0 0;0.8 0;-0.8 0;0 0" dur="0.12s" repeatCount="indefinite"/>`,
  }[mood]

  // A flame: an orange tongue with a yellow core, rising and fading off the crab's back.
  const flame = (x: number, begin: string) =>
    `<g opacity="0"><rect x="${x}" y="14" width="6" height="8" fill="#ff7a1a"/><rect x="${x + 1}" y="9" width="4" height="6" fill="#ff7a1a"/>` +
    `<rect x="${x + 2}" y="5" width="2" height="5" fill="#ffb02e"/><rect x="${x + 2}" y="15" width="2" height="5" fill="#ffe066"/>` +
    `<animateTransform attributeName="transform" type="translate" values="0 6;0 0;0 -6" dur="0.9s" begin="${begin}" repeatCount="indefinite"/>` +
    `<animate attributeName="opacity" values="0;1;0" dur="0.9s" begin="${begin}" repeatCount="indefinite"/></g>`
  // A snowflake: a plus of white pixels drifting down past the crab.
  const flake = (x: number, begin: string, dur: string) =>
    `<g fill="#eef6ff" opacity="0"><rect x="${x}" y="-2" width="2" height="6"/><rect x="${x - 2}" y="0" width="6" height="2"/>` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;-3 ${SPRITE_H / 2};2 ${SPRITE_H}" dur="${dur}" begin="${begin}" repeatCount="indefinite"/>` +
    `<animate attributeName="opacity" values="0;1;1;0" dur="${dur}" begin="${begin}" repeatCount="indefinite"/></g>`
  // Icicles hang from the body's underside, between the legs.
  const icicle = (x: number, len: number) =>
    `<polygon points="${OX + x * U},${OY + 4 * H} ${OX + (x + 1) * U},${OY + 4 * H} ${OX + x * U + U / 2},${OY + 4 * H + len}" fill="#d8ecff"/>`

  const over = {
    happy: '',
    worried: '',
    // Frost along the top row.
    tired: `<rect x="${OX + 3 * U}" y="${OY}" width="${12 * U}" height="3" fill="#eef6ff"/>` + icicle(5, 9) + icicle(8, 6) + icicle(10, 10),
  }[mood]

  const extra = {
    happy:
      `<rect x="${OX + 2 * U}" y="${OY - 4}" width="${14 * U}" height="${4 * H + 8}" rx="10" fill="#ff7a1a" opacity="0.12"><animate attributeName="opacity" values="0.08;0.2;0.08" dur="1.2s" repeatCount="indefinite"/></rect>` +
      flame(OX + 4 * U, '0s') + flame(OX + 8 * U, '0.3s') + flame(OX + 12 * U, '0.6s'),
    worried:
      // Steam thinning out as it cools, and the first flake.
      `<g fill="#cfd8e3" opacity="0"><rect x="${OX + 7 * U}" y="12" width="4" height="4"/><rect x="${OX + 8 * U}" y="6" width="3" height="3"/>` +
      `<animateTransform attributeName="transform" type="translate" values="0 4;2 -6" dur="2s" repeatCount="indefinite"/>` +
      `<animate attributeName="opacity" values="0;0.8;0" dur="2s" repeatCount="indefinite"/></g>` +
      flake(84, '0.5s', '3.2s'),
    tired: flake(10, '0s', '3s') + flake(36, '1.1s', '3.6s') + flake(62, '0.5s', '2.8s') + flake(90, '1.7s', '3.3s'),
  }[mood]

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SPRITE_W}" height="${SPRITE_H}" viewBox="0 0 ${SPRITE_W} ${SPRITE_H}" shape-rendering="crispEdges">` +
    `${mood === 'happy' ? extra : ''}` +
    `<g>${move}${torso}${eye(5)}${eye(12)}${claws}${legs([4, 11], '0s')}${legs([6, 13], legDur === '0s' ? '0s' : `${parseFloat(legDur) / 2}s`)}${over}</g>` +
    `${mood === 'happy' ? '' : extra}</svg>`
  )
}

// The terminal's crab and what rises or falls above it.
const CRAB_COLOR: Record<Mood, 'error' | 'warning' | 'suggestion'> = {
  happy: 'error',
  worried: 'warning',
  tired: 'suggestion',
}
const CRAB_ALT: Record<Mood, string> = {
  happy: 'on fire and dancing',
  worried: 'cooling down and shivering',
  tired: 'frozen solid in the snow',
}
const CRAB_TOP: Record<Mood, string> = {
  happy: '  ▲ ▲ ▲',
  worried: '   ░ ✻',
  tired: ' ✻  ✻  ✻',
}

const MINUTE = 60_000

// The share of the lifetime left when the crab starts to worry and the toast warns.
const COOLING = 0.15

type Heat = { mood: Mood; left: number; msLeft: number }

function heatOf(r: CacheReading, setting: number, at: number): Heat {
  // The lifetime the transcript showed the cache was written with wins over the setting.
  const ttl = r.ttl ?? setting
  const msLeft = r.broken ? 0 : Math.max(0, r.at + ttl - at)
  const left = msLeft / ttl
  return { mood: msLeft === 0 ? 'tired' : left <= COOLING ? 'worried' : 'happy', left, msLeft }
}

const MOOD_LINE: Record<Mood, string> = {
  happy: 'Cache is hot. Fire away!',
  worried: 'Cache is cooling. Send something soon…',
  tired: 'Cache is cold. The next turn rebuilds it.',
}

function minutes(ms: number) {
  const m = Math.ceil(ms / MINUTE)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}

// "cold in 42m", or why it went cold.
function whenLine(r: CacheReading, heat: Heat) {
  if (r.broken) return `cold: ${r.broken}`
  return heat.msLeft > 0 ? `cold in ${minutes(heat.msLeft)}` : 'cold'
}

function ttlOf(options: Record<string, unknown>) {
  return options.cacheTtl === '5m' ? 5 * MINUTE : 60 * MINUTE
}

// The cache's lifetime, from the plugin's setting; set as the module registers.
let ttl = 60 * MINUTE
// The reading the cooling toast already fired for, so it fires once per turn.
let warnedFor = 0

async function tick($: EngineInterface) {
  const at = await $.clock.now()
  await update($, now, () => at)
  const r = await read($, reading)
  if (!r) return
  const heat = heatOf(r, ttl, at)
  if (heat.mood === 'worried' && warnedFor !== r.at) {
    warnedFor = r.at
    await $.ui.toast(`Prompt cache goes cold in ${minutes(heat.msLeft)}`)
  }
}

// Each conversation's last reading, kept in $.store under its session id, so a resumed
// conversation or a restart picks it up again.
async function storeKey($: EngineInterface) {
  return `reading:${await $.session.id()}`
}

async function remember($: EngineInterface, r: CacheReading) {
  await update($, reading, () => r)
  await $.store.set(await storeKey($), r).catch(() => undefined)
}

// The session's transcript: ~/.claude/projects/<cwd, every other character a dash>/<id>.jsonl.
async function transcriptPath($: EngineInterface) {
  const config = (await $.env.get('CLAUDE_CONFIG_DIR')) || `${await $.env.get('HOME')}/.claude`
  const cwd = await $.session.cwd()
  return `${config}/projects/${cwd.replace(/[^a-zA-Z0-9]/g, '-')}/${await $.session.id()}.jsonl`
}

// The transcript's text, or its last 2 MB where it is over the 4 MiB a read takes.
async function transcriptTail($: EngineInterface, path: string) {
  const whole = await $.fs.read(path).catch(() => undefined)
  if (typeof whole === 'string') return whole
  const tail = await $.process.run(['tail', '-c', '2000000', path]).catch(() => undefined)
  return tail?.exitCode === 0 ? tail.stdout : undefined
}

// A conversation from before the mod saw it: its last main-thread reply's time and cache
// figures, from the transcript, and whether a compaction came after it.
async function readingFromTranscript($: EngineInterface): Promise<CacheReading | null> {
  const text = await transcriptTail($, await transcriptPath($)).catch(() => undefined)
  if (!text) return null
  let isCompactedSince = false
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry: {
      type?: string
      subtype?: string
      isSidechain?: boolean
      timestamp?: string
      message?: {
        model?: string
        usage?: Record<string, number | undefined> & {
          cache_creation?: { ephemeral_1h_input_tokens?: number; ephemeral_5m_input_tokens?: number }
        }
      }
    }
    try {
      entry = JSON.parse(lines[i] ?? '')
    } catch {
      continue
    }
    if (entry.type === 'system' && entry.subtype === 'compact_boundary') isCompactedSince = true
    if (entry.type !== 'assistant' || entry.isSidechain || !entry.timestamp) continue
    const at = Date.parse(entry.timestamp)
    if (!Number.isFinite(at)) continue
    const usage = entry.message?.usage ?? {}
    const written = usage.cache_creation
    const lifetime =
      (written?.ephemeral_1h_input_tokens ?? 0) > 0 ? 60 * MINUTE : (written?.ephemeral_5m_input_tokens ?? 0) > 0 ? 5 * MINUTE : undefined
    return {
      at,
      read: usage.cache_read_input_tokens ?? 0,
      write: usage.cache_creation_input_tokens ?? 0,
      input: usage.input_tokens ?? 0,
      model: entry.message?.model,
      ...(lifetime ? { ttl: lifetime } : {}),
      ...(isCompactedSince ? { broken: 'conversation compacted' } : {}),
    }
  }
  return null
}

// What this conversation's cache was left at: the reading saved for it, else its transcript.
async function seed($: EngineInterface) {
  if (await read($, reading)) return
  const saved = (await $.store.get(await storeKey($)).catch(() => undefined)) as CacheReading | undefined
  const r = saved && typeof saved.at === 'number' ? saved : await readingFromTranscript($)
  if (r) await update($, reading, () => r)
}

async function openPane($: EngineInterface) {
  await seed($).catch(() => undefined)
  await $.ui.open({ id: PANE, title: TITLE })
  const r = await read($, reading)
  if (!r) return { text: 'Cache pane opened. No reply in this conversation yet.' }
  const heat = heatOf(r, ttl, await $.clock.now())
  // The row's text is the mood line, then when it goes cold; the CommandOutput hook draws the crab beside it.
  return { text: `${MOOD_LINE[heat.mood]} · ${whenLine(r, heat)}` }
}

export const register: Register = (on, options) => {
  ttl = ttlOf(options)

  on('session.start', async ($, e, next) => {
    await $.command
      .register({ name: 'cache-meter', description: 'Show whether the prompt cache is hot or cold in a pane' })
      .catch(() => undefined)
    await seed($).catch(() => undefined)
    await tick($)
    $.clock.every(MINUTE, () => void tick($).catch(() => undefined))

    return next(e)
  })

  on('command.run', { command: 'cache-meter' }, $ => openPane($))

  // The main conversation's turns alone: a subagent's requests have a cache of their own.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const usage = e.usage
    if (e.agentId === undefined && usage) {
      // A fresh request restarts the lifetime; a model switch or missed cache shows in the read share.
      const at = await $.clock.now()
      const prev = await read($, reading)
      await remember($, {
        ...(prev?.ttl ? { ttl: prev.ttl } : {}),
        at,
        read: usage.cache_read_input_tokens,
        write: usage.cache_creation_input_tokens,
        input: usage.input_tokens,
        model: usage.model,
      })
      await tick($)
    }

    return done
  })

  // A compaction rewrites the conversation, so the next request starts the cache over.
  on('session.compact', async ($, e, next) => {
    const done = await next(e)
    if ('skip' in done && done.skip) return done
    const r = await read($, reading)
    if (r) await remember($, { ...r, broken: 'conversation compacted' })
    await tick($)

    return done
  })

  on('ui.render', { component: 'CommandOutput', props: { command: 'cache-meter' } }, async ($, e, next) => {
    // The row's text arrives under the plugin's name ("cache-meter: …"), then the mood line and when it goes cold.
    const text = e.props.text.trim()
    const mood = (Object.keys(MOOD_LINE) as Mood[]).find(m => text.includes(MOOD_LINE[m]))
    if (!mood) return next(e)
    const when = text.slice(text.indexOf(MOOD_LINE[mood]) + MOOD_LINE[mood].length).replace(/^ · /, '')
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui

    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        {'Svg' in ui ? (
          <ui.Svg source={crabSvg(mood)} alt={`Claude crab, ${CRAB_ALT[mood]}`} width={30} height={25} isInteractive />
        ) : (
          <Text color={CRAB_COLOR[mood]}>{CRAB[0]}</Text>
        )}
        <Text>{MOOD_LINE[mood]}</Text>
        {when && <Text dimColor>· {when}</Text>}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const r = await read($, reading)
    const at = (await read($, now)) || (await $.clock.now())

    if (!r) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text dimColor>No reply in this conversation yet,</Text>
          <Text dimColor>so there is no cache to keep warm.</Text>
        </Box>
      )
    }

    const heat = heatOf(r, ttl, at)
    const leftPct = Math.round(heat.left * 100)
    const when = whenLine(r, heat)
    const card = (
      <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold>Prompt cache</Text>
          <Text dimColor>{when}</Text>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text bold color={heat.mood === 'happy' ? undefined : 'warning'}>
            {heat.msLeft > 0 ? (heat.mood === 'happy' ? 'Hot' : 'Cooling') : 'Cold'}
          </Text>
          <Text dimColor>· {(r.ttl ?? ttl) === 5 * MINUTE ? '5m' : '1h'} lifetime</Text>
        </Box>
        {'Svg' in ui ? (
          <ui.Svg
            source={barSvg(heat.left, undefined, heat.msLeft > 0 ? minutes(heat.msLeft) : undefined)}
            alt={`Prompt cache: ${leftPct}% of its lifetime left, ${when}`}
          />
        ) : (
          <Text color="claude">{textBar(heat.left, undefined, (e.props.bodyColumns ?? 40) - 6)}</Text>
        )}
      </Box>
    )
    // Desktop: the card on top, then the crab centred in the room left, its line beneath.
    if ('Svg' in ui) {
      const rows = e.props.scroll.bodyRows
      return (
        <Box flexDirection="column" gap={1} padding={1} minHeight={rows > 0 ? rows : '100%'}>
          {card}
          <Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center" gap={1}>
            <ui.Svg source={crabSvg(heat.mood)} alt={`Claude crab, ${CRAB_ALT[heat.mood]}`} width={150} height={126} isInteractive />
            <Text dimColor>{MOOD_LINE[heat.mood]}</Text>
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1} padding={1}>
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Box flexDirection="column">
            <Text color={CRAB_COLOR[heat.mood]} dimColor>
              {CRAB_TOP[heat.mood]}
            </Text>
            {CRAB.map(line => (
              <Text color={CRAB_COLOR[heat.mood]}>{line}</Text>
            ))}
          </Box>
          <Text dimColor>{MOOD_LINE[heat.mood]}</Text>
        </Box>
        {card}
      </Box>
    )
  })
}
