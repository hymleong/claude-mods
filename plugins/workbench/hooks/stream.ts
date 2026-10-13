// What a terminal's PowerShell host writes, read back: plain output lines,
// and the host's own marks (`\x1e[[wb:...]]`) that say it is up, that a
// command started, and how it ended. Output comes in pieces cut wherever the
// child's writes were, so a line can span two pieces: the unfinished end of
// each pipe is carried until its newline arrives.

export const MARK = '\u001e[[wb:'

export type Pipe = 'stdout' | 'stderr'

export type StreamState = { stdout: string; stderr: string }

export const FRESH: StreamState = { stdout: '', stderr: '' }

export type Ended = 'ok' | 'fail' | 'stopped'

/** A run of a line in one style, as the program's colour codes set it. */
export type Styled = { text: string; color?: string; isBold?: boolean; isDim?: boolean; isUnderline?: boolean }

export type StreamEvent =
  | { kind: 'ready'; port: number; pid: number }
  | { kind: 'start'; id: string }
  | { kind: 'end'; id: string; state: Ended; exit: number | null; cwd: string }
  | { kind: 'info'; text: string }
  | { kind: 'line'; text: string; tone: 'out' | 'err'; runs?: Styled[] }

/** Windows Terminal's "Campbell" colours for the 16 a program names: 30–37, then bright 90–97. */
export const ANSI_COLORS = [
  '#0C0C0C', '#C50F1F', '#13A10E', '#C19C00', '#0037DA', '#881798', '#3A96DD', '#CCCCCC',
  '#767676', '#E74856', '#16C60C', '#F9F1A5', '#3B78FF', '#B4009E', '#61D6D6', '#F2F2F2',
] as const

const hex = (n: number): string => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')

/** One of the 256 colours `38;5;n` names. */
function color256(n: number): string | undefined {
  if (!Number.isInteger(n) || n < 0 || n > 255) return undefined
  if (n < 16) return ANSI_COLORS[n]
  if (n >= 232) return `#${hex(8 + (n - 232) * 10).repeat(3)}`
  const at = n - 16
  const level = (v: number): number => (v === 0 ? 0 : 55 + v * 40)

  return `#${hex(level(Math.floor(at / 36)))}${hex(level(Math.floor(at / 6) % 6))}${hex(level(at % 6))}`
}

type Style = Omit<Styled, 'text'>

/** A style after one SGR sequence's parameters (`1;33`, `38;5;214`, `0`). */
function applySgr(style: Style, params: string): Style {
  const codes = params === '' ? [0] : params.split(';').map(Number)
  let next: Style = { ...style }
  for (let at = 0; at < codes.length; at += 1) {
    const code = codes[at]!
    if (code === 0) next = {}
    else if (code === 1) next.isBold = true
    else if (code === 2) next.isDim = true
    else if (code === 22) {
      delete next.isBold
      delete next.isDim
    } else if (code === 4) next.isUnderline = true
    else if (code === 24) delete next.isUnderline
    else if (code >= 30 && code <= 37) next.color = ANSI_COLORS[code - 30]
    else if (code >= 90 && code <= 97) next.color = ANSI_COLORS[code - 90 + 8]
    else if (code === 39) delete next.color
    else if (code === 38 && codes[at + 1] === 5) {
      const picked = color256(codes[at + 2] ?? -1)
      if (picked !== undefined) next.color = picked
      at += 2
    } else if (code === 38 && codes[at + 1] === 2) {
      next.color = `#${hex(codes[at + 2] ?? 0)}${hex(codes[at + 3] ?? 0)}${hex(codes[at + 4] ?? 0)}`
      at += 4
    } else if (code === 48 && (codes[at + 1] === 5 || codes[at + 1] === 2)) at += codes[at + 1] === 5 ? 2 : 4
  }

  return next
}

const SGR = /\u001b\[([0-9;]*)m/g

/**
 * A line's styled runs as its colour codes paint it, after a carriage return keeps only
 * the last rewrite; `undefined` for a line with no colour codes, read as plain text.
 */
export function ansiRuns(raw: string): Styled[] | undefined {
  let line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
  const back = line.lastIndexOf('\r')
  if (back >= 0) line = line.slice(back + 1)
  if (!line.includes('\u001b[')) return undefined
  const runs: Styled[] = []
  let style: Style = {}
  let from = 0
  const push = (piece: string): void => {
    const text = piece.replace(ANSI, '').replace(CONTROL, '')
    if (text === '') return
    const last = runs[runs.length - 1]
    const same = last !== undefined && last.color === style.color && last.isBold === style.isBold && last.isDim === style.isDim && last.isUnderline === style.isUnderline
    if (same) last.text += text
    else runs.push({ text, ...style })
  }
  for (const match of line.matchAll(SGR)) {
    push(line.slice(from, match.index))
    style = applySgr(style, match[1] ?? '')
    from = (match.index ?? 0) + match[0].length
  }
  push(line.slice(from))

  return runs.some(run => run.color !== undefined || run.isBold === true || run.isDim === true || run.isUnderline === true) ? runs : undefined
}

// CSI sequences, OSC strings (ended by BEL or ST), and lone two-byte escapes.
const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g
// Every control character but the tab: a drawing refuses them.
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g

/**
 * One line as a terminal would leave it on screen: colour codes gone, and of
 * a line a progress bar rewrote with carriage returns, only its last state.
 */
export function clean(raw: string): string {
  let line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
  const back = line.lastIndexOf('\r')
  if (back >= 0) line = line.slice(back + 1)

  return line.replace(ANSI, '').replace(CONTROL, '')
}

function decode64(text: string): string {
  try {
    const bytes = atob(text)
    const array = new Uint8Array(bytes.length)
    for (let at = 0; at < bytes.length; at += 1) array[at] = bytes.charCodeAt(at)

    return new TextDecoder().decode(array)
  } catch {
    return ''
  }
}

/** A mark's body (what follows `\x1e[[wb:`, up to `]]`), read; `undefined` for one this build does not know. */
export function readMark(body: string): StreamEvent | undefined {
  const parts = body.split(':')
  const [kind] = parts
  if (kind === 'ready') {
    const port = Number(parts[1])
    const pid = Number(parts[2])

    return Number.isInteger(port) && port > 0 ? { kind, port, pid: Number.isInteger(pid) ? pid : 0 } : undefined
  }
  if (kind === 'start' && parts[1] !== undefined && parts[1] !== '') return { kind, id: parts[1] }
  if (kind === 'end' && parts[1] !== undefined && parts[1] !== '') {
    const said = parts[2]
    const state: Ended = said === 'ok' || said === 'stopped' ? said : 'fail'
    const exit = parts[3] === undefined || parts[3] === '' ? null : Number(parts[3])

    return {
      kind,
      id: parts[1],
      state,
      exit: exit === null || Number.isFinite(exit) ? exit : null,
      cwd: decode64(parts[4] ?? ''),
    }
  }
  if (kind === 'info') return { kind, text: clean(decode64(parts[1] ?? '')) }

  return undefined
}

/** One whole line of a pipe: an output line, a mark, or output followed by a mark. */
function lineEvents(raw: string, pipe: Pipe): StreamEvent[] {
  // Windows PowerShell 5.1 speaks CLIXML on a redirected stderr: its header and records are no output.
  if (pipe === 'stderr' && /^(#< CLIXML|<Objs Version=)/.test(raw.trim())) return []
  const events: StreamEvent[] = []
  const at = pipe === 'stdout' ? raw.indexOf(MARK) : -1
  if (at < 0) {
    const runs = ansiRuns(raw)
    const line: StreamEvent = { kind: 'line', text: clean(raw), tone: pipe === 'stdout' ? 'out' : 'err' }

    return [runs === undefined ? line : { ...line, runs }]
  }
  // A command that wrote no newline at its end leaves its text before the mark.
  const before = raw.slice(0, at)
  if (clean(before) !== '') events.push({ kind: 'line', text: clean(before), tone: 'out' })
  const close = raw.indexOf(']]', at)
  const mark = close < 0 ? undefined : readMark(raw.slice(at + MARK.length, close))
  if (mark !== undefined) events.push(mark)

  return events
}

/** Takes one piece of a pipe; answers the state to carry and what the piece completed. */
export function feed(state: StreamState, pipe: Pipe, text: string): { state: StreamState; events: StreamEvent[] } {
  const held = state[pipe] + text
  const cut = held.lastIndexOf('\n')
  if (cut < 0) return { state: { ...state, [pipe]: held }, events: [] }
  const events = held
    .slice(0, cut)
    .split('\n')
    .flatMap(raw => lineEvents(raw, pipe))

  return { state: { ...state, [pipe]: held.slice(cut + 1) }, events }
}

/** What each pipe has written of its current line so far: a live progress line, shown before its newline. */
export function partial(state: StreamState): { text: string; tone: 'out' | 'err'; runs?: Styled[] }[] {
  const shown: { text: string; tone: 'out' | 'err'; runs?: Styled[] }[] = []
  const one = (raw: string, tone: 'out' | 'err'): { text: string; tone: 'out' | 'err'; runs?: Styled[] } => {
    const runs = ansiRuns(raw)

    return runs === undefined ? { text: clean(raw), tone } : { text: clean(raw), tone, runs }
  }
  if (state.stdout !== '' && !state.stdout.includes(MARK) && clean(state.stdout) !== '') shown.push(one(state.stdout, 'out'))
  if (state.stderr !== '' && clean(state.stderr) !== '') shown.push(one(state.stderr, 'err'))

  return shown
}
