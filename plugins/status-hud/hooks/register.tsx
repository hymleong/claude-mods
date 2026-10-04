import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Blocked, Call, Limit, Notice, Phase, Usage } from '../types'

const usage = atom({ plugin: 'status-hud', key: 'usage' } as const, {} as Usage)
const tick = atom({ plugin: 'status-hud', key: 'tick' } as const, 0)
const calls = atom({ plugin: 'status-hud', key: 'calls' } as const, [] as Call[])
const blocked = atom({ plugin: 'status-hud', key: 'blocked' } as const, [] as Blocked[])
const phase = atom({ plugin: 'status-hud', key: 'phase' } as const, 'idle' as Phase)
const isCompacting = atom({ plugin: 'status-hud', key: 'isCompacting' } as const, false)
const notice = atom({ plugin: 'status-hud', key: 'notice' } as const, null)

// ---------- helpers ----------
const countdown = (iso: string | undefined, now: number) => {
  if (!iso) return ''
  const m = Math.max(0, Math.round((Date.parse(iso) - now) / 60000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  return d ? `${d}d${h}h` : h ? `${h}h${m % 60}m` : `${m}m`
}

const tokens = (n?: number) =>
  n === undefined ? '' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n)

const fromMeasure = (e: any): Usage => {
  const five = e.rateLimits.find((r: any) => r.kind === 'five_hour')
  const seven = e.rateLimits.find((r: any) => r.kind === 'seven_day')
  return {
    ctxPct: e.context.percent,
    ctxTokens: e.context.tokens,
    ctxWindow: e.context.window,
    five: five && { pct: five.percentUsed, resetsAt: five.resetsAt },
    seven: seven && { pct: seven.percentUsed, resetsAt: seven.resetsAt },
  }
}

const PLANNING = new Set(['TodoWrite', 'ExitPlanMode', 'EnterPlanMode', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet'])

const describeCall = (tool: string, input: Record<string, unknown>): { verb: string; target: string } => {
  const path = String(input.file_path ?? input.path ?? input.notebook_path ?? '')
  const short = path.split(/[\\/]/).slice(-2).join('/')
  const cmd = String(input.command ?? '').replace(/\s+/g, ' ').trim()
  if (PLANNING.has(tool)) return { verb: 'Planning', target: '' }
  switch (tool) {
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return { verb: 'Editing', target: short }
    case 'Read':
      return { verb: 'Reading', target: short }
    case 'Grep':
    case 'Glob':
      return { verb: 'Searching', target: String(input.pattern ?? '') }
    case 'Bash':
    case 'PowerShell':
      return { verb: 'Running', target: cmd }
    case 'Agent':
    case 'Task':
      return { verb: 'Delegating', target: String(input.description ?? '') }
    case 'WebFetch':
    case 'WebSearch':
      return { verb: 'Browsing', target: String(input.url ?? input.query ?? '') }
    default:
      return { verb: 'Working', target: tool.replace(/^mcp__/, '').replace(/__/g, ' · ') }
  }
}

// What the chat is doing right now, most urgent first: waiting on you, compacting, tools, writing, thinking,
// then (for a few seconds after a turn) how the last one ended, else idle.
type Shown = { state: string; detail: string }
const deriveActivity = (s: { calls: Call[]; blocked: Blocked[]; isCompacting: boolean; phase: Phase; notice: Notice | null; isWorking: boolean }): Shown => {
  if (s.blocked.length) return { state: 'Needs You', detail: s.blocked[s.blocked.length - 1].label }
  if (s.isCompacting) return { state: 'Compacting', detail: 'context' }
  if (s.calls.length) {
    const latest = s.calls[s.calls.length - 1]
    return { state: s.calls.length > 1 ? `${latest.verb} ×${s.calls.length}` : latest.verb, detail: latest.target }
  }
  if (s.phase === 'writing') return { state: 'Writing', detail: '' }
  if (s.isWorking || s.phase === 'thinking') return { state: 'Thinking', detail: '' }
  if (s.notice) {
    return s.notice.kind === 'error'
      ? { state: 'Error', detail: 'turn failed' }
      : s.notice.kind === 'refused'
        ? { state: 'Declined', detail: 'request refused' }
        : { state: 'Interrupted', detail: '' }
  }
  return { state: 'Idle', detail: '' }
}

// ---------- drawing: four iOS-style items that share the full width ----------
const FONT = "-apple-system, 'SF Pro Text', 'SF Pro Display', 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif"
const GREEN = '#30d158'
const AMBER = '#ff9f0a'
const RED = '#ff453a'
const BLUE = '#0a84ff'
const PURPLE = '#bf5af2'
const INDIGO = '#5e5ce6'
const TEAL = '#64d2ff'
const PINK = '#ff375f'
const YELLOW = '#ffd60a'
const GRAY = '#8e8e93'

const M = 8
const GAP = 24
const SVG_H = 44
const ICON = 28
const CY = SVG_H / 2

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const clip = (s: string, n: number) => (n <= 1 ? '' : s.length > n ? `${s.slice(0, n - 1)}…` : s)
const tone = (pct: number | undefined, base: string) => ((pct ?? 0) >= 90 ? RED : base)

const stroke = (color: string, w = 1.5) => `fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`

type Glyph = 'idle' | 'thinking' | 'write' | 'edit' | 'plan' | 'run' | 'read' | 'search' | 'agent' | 'web' | 'alert' | 'compact' | 'stop' | 'clock' | 'calendar' | 'window'

const glyph = (kind: Glyph, cx: number, cy: number, color: string) => {
  switch (kind) {
    case 'idle':
      return `<path d="M${cx - 2.6} ${cy - 4} V${cy + 4} M${cx + 2.6} ${cy - 4} V${cy + 4}" ${stroke(color, 1.8)}/>`
    case 'thinking':
      return `<circle cx="${cx - 4.2}" cy="${cy}" r="1.4" fill="${color}"/><circle cx="${cx}" cy="${cy}" r="1.4" fill="${color}"/><circle cx="${cx + 4.2}" cy="${cy}" r="1.4" fill="${color}"/>`
    case 'write':
      return `<path d="M${cx - 4.5} ${cy - 3.5} H${cx + 4.5} M${cx - 4.5} ${cy} H${cx + 4.5} M${cx - 4.5} ${cy + 3.5} H${cx + 1.5}" ${stroke(color)}/>`
    case 'edit':
      return `<path d="M${cx - 4} ${cy + 4.2} L${cx - 3.2} ${cy + 1} L${cx + 2.4} ${cy - 4.6} L${cx + 4.6} ${cy - 2.4} L${cx - 1} ${cy + 3.2} Z" ${stroke(color)}/>`
    case 'plan':
      return `<path d="M${cx - 0.5} ${cy - 3.6} H${cx + 4.6} M${cx - 0.5} ${cy} H${cx + 4.6} M${cx - 0.5} ${cy + 3.6} H${cx + 4.6}" ${stroke(color)}/><circle cx="${cx - 4}" cy="${cy - 3.6}" r="0.9" fill="${color}"/><circle cx="${cx - 4}" cy="${cy}" r="0.9" fill="${color}"/><circle cx="${cx - 4}" cy="${cy + 3.6}" r="0.9" fill="${color}"/>`
    case 'run':
      return `<path d="M${cx - 4.6} ${cy - 3} L${cx - 1.2} ${cy} L${cx - 4.6} ${cy + 3} M${cx + 0.8} ${cy + 3.6} H${cx + 4.6}" ${stroke(color)}/>`
    case 'read':
      return `<rect x="${cx - 3.8}" y="${cy - 4.8}" width="7.6" height="9.6" rx="1.6" ${stroke(color)}/><path d="M${cx - 1.6} ${cy - 1.4} H${cx + 1.6} M${cx - 1.6} ${cy + 1.4} H${cx + 1.6}" ${stroke(color, 1.2)}/>`
    case 'search':
      return `<circle cx="${cx - 1.2}" cy="${cy - 1.2}" r="3.4" ${stroke(color)}/><path d="M${cx + 1.4} ${cy + 1.4} L${cx + 4.6} ${cy + 4.6}" ${stroke(color)}/>`
    case 'agent':
      return `<circle cx="${cx}" cy="${cy - 3.6}" r="1.7" ${stroke(color, 1.3)}/><circle cx="${cx - 3.8}" cy="${cy + 3.2}" r="1.7" ${stroke(color, 1.3)}/><circle cx="${cx + 3.8}" cy="${cy + 3.2}" r="1.7" ${stroke(color, 1.3)}/>`
    case 'web':
      return `<circle cx="${cx}" cy="${cy}" r="4.6" ${stroke(color, 1.3)}/><path d="M${cx - 4.6} ${cy} H${cx + 4.6} M${cx} ${cy - 4.6} C${cx - 3} ${cy - 2} ${cx - 3} ${cy + 2} ${cx} ${cy + 4.6} M${cx} ${cy - 4.6} C${cx + 3} ${cy - 2} ${cx + 3} ${cy + 2} ${cx} ${cy + 4.6}" ${stroke(color, 1.1)}/>`
    case 'alert':
      return `<path d="M${cx} ${cy - 4.6} V${cy + 0.6}" ${stroke(color, 2)}/><circle cx="${cx}" cy="${cy + 3.8}" r="1.2" fill="${color}"/>`
    case 'compact':
      return `<path d="M${cx - 4} ${cy - 4.5} L${cx} ${cy - 1} L${cx + 4} ${cy - 4.5} M${cx - 4} ${cy + 4.5} L${cx} ${cy + 1} L${cx + 4} ${cy + 4.5}" ${stroke(color)}/>`
    case 'stop':
      return `<rect x="${cx - 3.4}" y="${cy - 3.4}" width="6.8" height="6.8" rx="1.4" fill="${color}"/>`
    case 'clock':
      return `<path d="M${cx} ${cy - 4.5} V${cy} L${cx + 3.4} ${cy + 2.3}" ${stroke(color, 1.3)}/>`
    case 'calendar':
      return `<rect x="${cx - 4.5}" y="${cy - 3.8}" width="9" height="8.2" rx="2" ${stroke(color, 1.3)}/><path d="M${cx - 4.5} ${cy - 0.8} H${cx + 4.5} M${cx - 1.9} ${cy - 5.3} V${cy - 2.6} M${cx + 1.9} ${cy - 5.3} V${cy - 2.6}" ${stroke(color, 1.3)}/>`
    default:
      return `<rect x="${cx - 4.9}" y="${cy - 4.1}" width="9.8" height="8.2" rx="2" ${stroke(color, 1.3)}/><path d="M${cx - 4.9} ${cy - 1.1} H${cx + 4.9}" ${stroke(color, 1.3)}/>`
  }
}

type Look = { glyph: Glyph; color: string }
const LOOK: Record<string, Look> = {
  Idle: { glyph: 'idle', color: GRAY },
  Thinking: { glyph: 'thinking', color: BLUE },
  Writing: { glyph: 'write', color: YELLOW },
  Editing: { glyph: 'edit', color: PURPLE },
  Planning: { glyph: 'plan', color: INDIGO },
  Running: { glyph: 'run', color: GREEN },
  Reading: { glyph: 'read', color: TEAL },
  Searching: { glyph: 'search', color: TEAL },
  Delegating: { glyph: 'agent', color: PINK },
  Browsing: { glyph: 'web', color: BLUE },
  Working: { glyph: 'thinking', color: BLUE },
  Compacting: { glyph: 'compact', color: AMBER },
  Interrupted: { glyph: 'stop', color: GRAY },
  Error: { glyph: 'alert', color: RED },
  Declined: { glyph: 'alert', color: AMBER },
  'Needs You': { glyph: 'alert', color: RED },
}
const lookOf = (state: string): Look => LOOK[state.replace(/ ×\d+$/, '')] ?? LOOK.Working

const tint = (x: number, w: number, color: string) =>
  `<rect x="${x - 8}" y="2" width="${w + 16}" height="${SVG_H - 4}" rx="14" fill="${color}" fill-opacity="0.14"/>`

// The activity item: a tinted icon square, the item's name, the state in bold and the detail in grey.
const activityTile = (x: number, w: number, shown: Shown) => {
  const look = lookOf(shown.state)
  const loud = shown.state === 'Needs You'
  const textX = x + ICON + 12
  const room = Math.floor((w - ICON - 12 - shown.state.length * 8.2 - 8) / 6.1)
  return (
    (loud ? tint(x, w, RED) : '') +
    `<rect x="${x}" y="${CY - ICON / 2}" width="${ICON}" height="${ICON}" rx="9" fill="${look.color}" fill-opacity="0.2"/>` +
    glyph(look.glyph, x + ICON / 2, CY, look.color) +
    `<text x="${textX}" y="${CY - 5}" font-family="${FONT}" font-size="10" font-weight="600" fill="${loud ? RED : GRAY}">Current Activity</text>` +
    `<text x="${textX}" y="${CY + 12}" font-family="${FONT}"><tspan font-size="15" font-weight="700" fill="${loud ? RED : '#fff'}">${esc(shown.state)}</tspan>${shown.detail && room > 3 ? `<tspan dx="8" font-size="11.5" fill="${loud ? RED : GRAY}" fill-opacity="${loud ? 0.85 : 1}">${esc(clip(shown.detail, room))}</tspan>` : ''}</text>`
  )
}

// A usage item: a ring with a glyph, the name, then a bold percentage with its caption right-aligned.
const usageTile = (x: number, w: number, kind: Glyph, name: string, pct: number | undefined, color: string, caption: string) => {
  const r = 12
  const sw = 3
  const cx = x + ICON / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(100, pct ?? 0)) / 100
  const arc =
    p > 0
      ? `<circle cx="${cx}" cy="${CY}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${(p * c).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${cx} ${CY})"/>`
      : ''
  return (
    `<circle cx="${cx}" cy="${CY}" r="${r}" fill="none" stroke="${color}" stroke-opacity="0.22" stroke-width="${sw}"/>` +
    arc +
    glyph(kind, cx, CY, color) +
    `<text x="${x + ICON + 12}" y="${CY - 5}" font-family="${FONT}" font-size="10" font-weight="600" fill="${GRAY}">${esc(name)}</text>` +
    `<text x="${x + ICON + 12}" y="${CY + 12}" font-family="${FONT}" font-size="15" font-weight="700" fill="#fff">${pct === undefined ? '–' : `${Math.round(pct)}%`}</text>` +
    `<text x="${x + w}" y="${CY + 12}" text-anchor="end" font-family="${FONT}" font-size="11.5" fill="${GRAY}">${esc(caption)}</text>`
  )
}

const hudSvg = (u: Usage, shown: Shown, now: number, width: number) => {
  // Four items share the whole width inside the margin; the activity item gets a little more room for its detail.
  const weights = [1.35, 1, 1, 1]
  const total = weights.reduce((p, q) => p + q, 0)
  const usable = width - 2 * M - 3 * GAP
  let x = M
  const place = (i: number) => {
    const w = (usable * weights[i]) / total
    const at = x
    x += w + GAP
    return { x: at, w }
  }
  const a = place(0)
  const b = place(1)
  const c = place(2)
  const d = place(3)
  // A hairline between neighbouring items, centred in the gap.
  const divider = (t: { x: number; w: number }) => {
    const dx = (t.x + t.w + GAP / 2).toFixed(1)
    return `<line x1="${dx}" y1="${M}" x2="${dx}" y2="${SVG_H - M}" stroke="#fff" stroke-opacity="0.14"/>`
  }
  // A window whose reset time has passed is empty again; show that until the next real reading arrives.
  const view = (l?: Limit) =>
    l?.resetsAt && Date.parse(l.resetsAt) <= now
      ? { pct: 0, caption: 'reset' }
      : { pct: l?.pct, caption: l?.resetsAt ? `resets ${countdown(l.resetsAt, now)}` : '' }
  const five = view(u.five)
  const seven = view(u.seven)
  const body =
    activityTile(a.x, a.w, shown) +
    divider(a) +
    usageTile(b.x, b.w, 'clock', '5 Hour Limit', five.pct, tone(five.pct, GREEN), five.caption) +
    divider(b) +
    usageTile(c.x, c.w, 'calendar', 'Weekly Limit', seven.pct, tone(seven.pct, AMBER), seven.caption) +
    divider(c) +
    usageTile(d.x, d.w, 'window', 'Context Window', u.ctxPct, tone(u.ctxPct, GREEN), u.ctxWindow ? `${tokens(u.ctxTokens)} / ${tokens(u.ctxWindow)}` : '')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${SVG_H}" width="${width}" height="${SVG_H}">${body}</svg>`
}

// ---------- hooks ----------
let seq = 0
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      const u: any = await $.session.usage()
      await update($, usage, () => fromMeasure(u))
    } catch {}
    // Redraw every 30s so the reset countdowns keep moving.
    $.clock.every(30000, () => void update($, tick, n => n + 1))
    // Clear the pinned cache line an earlier version of this plugin left under the prompt.
    $.ui.status(undefined)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, () => fromMeasure(e))
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await update($, notice, () => null)
    return next(e)
  })

  // The model's own stream tells thinking from writing. Only the main conversation counts, not subagents.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId) return yield* next(e)
    let current: Phase = 'thinking'
    await update($, phase, () => 'thinking')
    for await (const chunk of next(e)) {
      const wanted: Phase | null = chunk.kind === 'text' ? 'writing' : chunk.kind === 'thinking' || chunk.kind === 'tool' ? 'thinking' : null
      if (wanted && wanted !== current) {
        current = wanted
        await update($, phase, () => wanted)
      }
      yield chunk
    }
  })

  // Tools: every call in flight is tracked by id, so parallel calls neither overwrite nor clear each other.
  on('tool.call', async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    const tool = String(input.tool)
    const id = String(input.tool_use_id ?? `c${++seq}`)
    const isMain = !input.agentId

    if (isMain) {
      const { verb, target } = describeCall(tool, input)
      await update($, calls, list => [...list, { id, verb, target }])
    }

    // Will the engine stop and wait for the person? Questions and plan approvals always do;
    // for any other tool, ask the engine's own permission check. Subagent calls count too.
    let isBlocked = tool === 'AskUserQuestion' || tool === 'ExitPlanMode'
    const label = tool === 'AskUserQuestion' ? 'Question' : tool === 'ExitPlanMode' ? 'Approve plan' : 'Permission'
    if (!isBlocked) {
      try {
        const { tool: _tool, tool_use_id: _id, ...rest } = input as any
        const check: any = await $.tool.check({ tool, input: rest })
        isBlocked = check?.decision === 'ask'
      } catch {}
    }
    if (isBlocked) await update($, blocked, list => [...list, { id, label }])

    const result = await next(e)

    await update($, blocked, list => list.filter(b => b.id !== id))
    await update($, calls, list => list.filter(c => c.id !== id))
    return result
  })

  on('session.compact', async ($, e, next) => {
    if (e.trigger === 'precompute' || e.agentId) return next(e)
    await update($, isCompacting, () => true)
    try {
      return await next(e)
    } finally {
      await update($, isCompacting, () => false)
    }
  })

  on('turn.complete', async ($, e, next) => {
    await update($, phase, () => 'idle')
    if (!e.agentId) {
      await update($, calls, () => [])
      await update($, blocked, () => [])
      const kind = e.reason === 'error' ? 'error' : e.reason === 'refusal' ? 'refused' : e.reason === 'aborted' ? 'interrupted' : null
      if (kind) {
        await update($, notice, () => ({ kind }))
        // Show how the turn ended for a few seconds, then go back to Idle.
        $.clock.after(8000, () => void update($, notice, () => null))
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const Svg = ($.ui.resolve(e) as any).Svg
    const [u, callList, blockedList, ph, compacting, note] = await Promise.all([
      read($, usage),
      read($, calls),
      read($, blocked),
      read($, phase),
      read($, isCompacting),
      read($, notice),
    ])
    await read($, tick)
    const now = await $.clock.now()
    const shown = deriveActivity({ calls: callList, blocked: blockedList, isCompacting: compacting, phase: ph, notice: note, isWorking: e.props.isWorking })

    if (Svg) {
      // Fill the band: the drawing is laid out at the width of the chat column, so the items leave no gaps.
      const width = Math.max(480, Math.min(1600, e.props.bodyColumns * 8))
      return (
        <Box>
          <Svg source={hudSvg(u, shown, now, width)} width={width} height={SVG_H} alt="Current activity, 5 hour limit, weekly limit and context window" />
        </Box>
      )
    }

    // Terminal: one text line.
    const pct = (n?: number) => (n === undefined ? '–' : `${Math.round(n)}%`)
    const loud = shown.state === 'Needs You'
    return (
      <Box gap={3} paddingX={1}>
        <Text color={loud ? 'red' : shown.state === 'Idle' ? undefined : 'cyan'} bold={loud}>{shown.detail ? `${shown.state} ${shown.detail}` : shown.state}</Text>
        <Text>5H {u.five?.resetsAt && Date.parse(u.five.resetsAt) <= now ? '0% reset' : `${pct(u.five?.pct)} ${countdown(u.five?.resetsAt, now)}`}</Text>
        <Text>7D {u.seven?.resetsAt && Date.parse(u.seven.resetsAt) <= now ? '0% reset' : `${pct(u.seven?.pct)} ${countdown(u.seven?.resetsAt, now)}`}</Text>
        <Text>CTX {pct(u.ctxPct)} {u.ctxWindow ? `${tokens(u.ctxTokens)}/${tokens(u.ctxWindow)}` : ''}</Text>
      </Box>
    )
  })
}
