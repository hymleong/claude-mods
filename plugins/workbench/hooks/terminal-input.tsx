import type { ClientModule } from 'claude-code'

import { bufferOf, edit, keepSpaces, textOf } from './edit-buffer'
import type { Buffer } from './edit-buffer'

// A terminal's input line: a surface module, so each key reaches it as it is
// pressed. It keeps the line being typed and walks the history itself; what
// needs the shell (running the line, stopping a command, completing a word)
// it posts to the hooks module, which holds the PowerShell.

export type Completion = { seq: number; start: number; length: number; items: string[] }

export type InputProps = {
  termId: string
  /** The prompt's text, `PS C:\repo>`. */
  prompt: string
  isBusy: boolean
  isEnded: boolean
  /** Commands run here before, the latest last. */
  history: string[]
  /** The shell's answer to the last Tab, matched to its request by `seq`. */
  completion: Completion | null
  /** Text the pane asks to put on the line (a command to edit and run again), matched by `seq`. */
  fill: { seq: number; text: string } | null
  /** Whether the surface sets type proportionally: spaces must then be kept by hand. */
  isProportional: boolean
  accent: string
  bad: string
}

type Cycle = { items: string[]; index: number; start: number; length: number; base: string }

type State = {
  buffer: Buffer
  /** Where in the history ↑ has walked to: `-1` is the line being typed. */
  back: number
  /** The line being typed, kept while ↑ shows older ones. */
  draft: string
  cycle: Cycle | null
  askedSeq: number
  fillSeq: number
  hasKeys: boolean
  note: string
}

const EMPTY = bufferOf('')

/** The line with one completion put in for the word Tab was pressed on. */
function complete(base: string, cycle: Pick<Cycle, 'start' | 'length'>, item: string): Buffer {
  const text = base.slice(0, cycle.start) + item + base.slice(cycle.start + cycle.length)

  return { lines: [text], row: 0, col: cycle.start + item.length }
}

// What each instance last set, kept here as well: keys can arrive faster than frames,
// and each must edit what the one before it left, not what was last drawn.
const latest = new WeakMap<object, State>()

const Input: ClientModule<InputProps, State> = (props, surface) => {
  const put = (next: State): void => {
    latest.set(surface, next)
    surface.setState(next)
  }
  const { Box, Text } = surface.elements
  const held = latest.get(surface) ?? surface.state
  let state: State = held ?? {
    buffer: EMPTY,
    back: -1,
    draft: '',
    cycle: null,
    askedSeq: 0,
    fillSeq: props.fill?.seq ?? 0,
    hasKeys: false,
    note: '',
  }
  // A fill from the pane replaces the line once.
  if (props.fill !== null && props.fill.seq !== state.fillSeq) {
    state = { ...state, buffer: bufferOf(props.fill.text, 0, props.fill.text.length), fillSeq: props.fill.seq, back: -1, cycle: null }
    put(state)
  }
  // The shell answered a Tab: the first match goes in, and Tab again walks the rest.
  const answer = props.completion
  if (answer !== null && answer.seq === state.askedSeq && state.cycle === null && answer.items.length > 0) {
    const base = textOf(state.buffer)
    const cycle: Cycle = { items: answer.items, index: 0, start: answer.start, length: answer.length, base }
    state = { ...state, cycle, buffer: complete(base, cycle, answer.items[0] ?? ''), askedSeq: -1 }
    put(state)
  } else if (answer !== null && answer.seq === state.askedSeq && answer.items.length === 0) {
    state = { ...state, askedSeq: -1, note: 'no completions' }
    put(state)
  }
  if (held === undefined) put(state)

  // Keys can come faster than frames: each one edits what the last one left, not what was last drawn.
  const now = (): State => latest.get(surface) ?? state
  const set = (next: Partial<State>): void => put({ ...now(), hasKeys: true, note: '', ...next })

  surface.onKey(key => {
    const state = now()
    if (key.ctrl === true && key.key === 'c') {
      if (props.isBusy) surface.post({ type: 'stop', termId: props.termId })
      set({ buffer: EMPTY, back: -1, cycle: null })

      return
    }
    if (key.ctrl === true && key.key === 'l') {
      surface.post({ type: 'clear', termId: props.termId })
      set({})

      return
    }
    if (key.key === 'return' || key.key === 'enter') {
      const line = textOf(state.buffer)
      if (props.isEnded) {
        surface.post({ type: 'restart', termId: props.termId })
        set({})

        return
      }
      if (props.isBusy) {
        set({ note: 'still running: ctrl+c stops it' })

        return
      }
      surface.post({ type: 'run', termId: props.termId, text: line })
      set({ buffer: EMPTY, back: -1, draft: '', cycle: null })

      return
    }
    if (key.key === 'tab') {
      const cycle = state.cycle
      if (cycle !== null && cycle.items.length > 1) {
        const step = key.shift === true ? -1 : 1
        const index = (cycle.index + step + cycle.items.length) % cycle.items.length
        set({ cycle: { ...cycle, index }, buffer: complete(cycle.base, cycle, cycle.items[index] ?? '') })

        return
      }
      if (props.isBusy || cycle !== null) return
      const seq = Date.now() % 1_000_000_000
      surface.post({ type: 'complete', termId: props.termId, text: textOf(state.buffer), cursor: state.buffer.col, seq })
      set({ askedSeq: seq })

      return
    }
    if (key.key === 'up' || key.key === 'down') {
      const list = props.history
      if (list.length === 0) return
      const back = key.key === 'up' ? Math.min(list.length - 1, state.back + 1) : state.back - 1
      if (back < 0) {
        set({ back: -1, buffer: bufferOf(state.draft, 0, state.draft.length), cycle: null })

        return
      }
      const shown = list[list.length - 1 - back] ?? ''
      set({
        back,
        draft: state.back === -1 ? textOf(state.buffer) : state.draft,
        buffer: bufferOf(shown, 0, shown.length),
        cycle: null,
      })

      return
    }
    const next = edit(state.buffer, key, false)
    if (next !== undefined) set({ buffer: next, cycle: null, back: -1 })
  })

  const line = state.buffer.lines[0] ?? ''
  const col = state.buffer.col
  // A line wider than its room scrolls with the cursor.
  const room = Math.max(10, (surface.columns > 0 ? surface.columns : 60) - 4)
  const left = col >= room ? col - room + 1 : 0
  const show = (text: string): string => (props.isProportional ? keepSpaces(text) : text)
  const before = show(line.slice(left, col))
  const under = line[col] ?? ' '
  const after = show(line.slice(col + 1, left + room))
  const cycle = state.cycle
  const hint = props.isEnded
    ? 'session ended: Enter restarts it'
    : state.note !== ''
      ? state.note
      : props.isBusy
        ? 'running · ctrl+c stops'
        : !state.hasKeys
          ? 'click here, then type a command'
          : ''

  return (
    <Box flexDirection="column">
      {cycle !== null && cycle.items.length > 1 && (
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          {cycle.items.slice(0, 12).map((item, at) => (
            <Text key={`c${at}`} inverse={at === cycle.index} dimColor={at !== cycle.index}>
              {show(item)}
            </Text>
          ))}
          {cycle.items.length > 12 && <Text dimColor>+{cycle.items.length - 12}</Text>}
        </Box>
      )}
      <Box flexDirection="row">
        <Text color={props.isEnded ? props.bad : props.accent} bold>
          {'❯ '}
        </Text>
        <Text>{before}</Text>
        {state.hasKeys ? <Text inverse>{show(under)}</Text> : <Text>{show(under)}</Text>}
        <Text>{after}</Text>
      </Box>
      {hint !== '' && <Text dimColor>{hint}</Text>}
    </Box>
  )
}

export default Input
