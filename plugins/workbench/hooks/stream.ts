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

export type StreamEvent =
  | { kind: 'ready'; port: number; pid: number }
  | { kind: 'start'; id: string }
  | { kind: 'end'; id: string; state: Ended; exit: number | null; cwd: string }
  | { kind: 'info'; text: string }
  | { kind: 'line'; text: string; tone: 'out' | 'err' }

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
  if (at < 0) return [{ kind: 'line', text: clean(raw), tone: pipe === 'stdout' ? 'out' : 'err' }]
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
export function partial(state: StreamState): { text: string; tone: 'out' | 'err' }[] {
  const shown: { text: string; tone: 'out' | 'err' }[] = []
  if (state.stdout !== '' && !state.stdout.includes(MARK) && clean(state.stdout) !== '') {
    shown.push({ text: clean(state.stdout), tone: 'out' })
  }
  if (state.stderr !== '' && clean(state.stderr) !== '') shown.push({ text: clean(state.stderr), tone: 'err' })

  return shown
}
