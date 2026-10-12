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
  /** The clipboard's text, read for a paste, to go in at the cursor; matched by `seq`. */
  paste: { seq: number; text: string } | null
  /** Whether the surface sets type proportionally: spaces must then be kept by hand. */
  isProportional: boolean
  /** The prompt's colour. */
  accent: string
  /** The typed text's colour. */
  ink: string
  bad: string
  /** The colour of the quiet line under the prompt. */
  hint: string
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
  pasteSeq: number
  /** Whether the blinking cursor is in its off half. */
  isBlinkOff: boolean
  hasKeys: boolean
  note: string
}

const EMPTY = bufferOf('')
/** A terminal's cursor blink: half a second on, half off. */
const BLINK_MS = 530

/** The line with one completion put in for the word Tab was pressed on. */
function complete(base: string, cycle: Pick<Cycle, 'start' | 'length'>, item: string): Buffer {
  const text = base.slice(0, cycle.start) + item + base.slice(cycle.start + cycle.length)

  return { lines: [text], row: 0, col: cycle.start + item.length }
}

// What each instance last set, kept here as well: keys can arrive faster than frames,
// and each must edit what the one before it left, not what was last drawn.
const latest = new WeakMap<object, State>()
// The instances whose blink is going: started once each.
const blinking = new WeakSet<object>()

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
    pasteSeq: props.paste?.seq ?? 0,
    isBlinkOff: false,
    hasKeys: false,
    note: '',
  }
  // A fill from the pane replaces the line once.
  if (props.fill !== null && props.fill.seq !== state.fillSeq) {
    state = { ...state, buffer: bufferOf(props.fill.text, 0, props.fill.text.length), fillSeq: props.fill.seq, back: -1, cycle: null }
    put(state)
  }
  // The clipboard's text, read for a paste, goes in at the cursor once.
  if (props.paste !== null && props.paste.seq !== state.pasteSeq) {
    const pasted = edit(state.buffer, { key: props.paste.text }, false) ?? state.buffer
    state = { ...state, buffer: props.paste.text === '' ? state.buffer : pasted, pasteSeq: props.paste.seq, back: -1, cycle: null, isBlinkOff: false }
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
  // Any key shows the cursor again, as a terminal does, before it goes on blinking.
  const set = (next: Partial<State>): void => put({ ...now(), hasKeys: true, note: '', isBlinkOff: false, ...next })
  if (!blinking.has(surface)) {
    blinking.add(surface)
    surface.every(BLINK_MS, () => {
      const held = now()
      if (held.hasKeys) put({ ...held, isBlinkOff: !held.isBlinkOff })
    })
  }

  surface.onKey(key => {
    const state = now()
    if (key.ctrl === true && key.key === 'c') {
      if (props.isBusy) surface.post({ type: 'stop', termId: props.termId })
      set({ buffer: EMPTY, back: -1, cycle: null })

      return
    }
    // Paste: the clipboard is the hooks module's to read; it answers with the text in `paste`.
    const isPaste = ((key.ctrl === true || key.meta === true) && key.key.toLowerCase() === 'v') || (key.shift === true && key.key === 'insert')
    if (isPaste) {
      surface.post({ type: 'paste', termId: props.termId, seq: Date.now() % 1_000_000_000 })
      set({})

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
  // On a cell grid a line wider than its room scrolls with the cursor; set in proportional
  // type, where a cell count says little, it wraps under the prompt as a terminal's does.
  const room = props.isProportional ? Infinity : Math.max(10, (surface.columns > 0 ? surface.columns : 60) - props.prompt.length - 2)
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
      <Box flexDirection="row" flexWrap="wrap">
        <Text color={props.isEnded ? props.bad : props.accent}>{show(props.prompt)}</Text>
        <Text color={props.ink}>{before}</Text>
        {state.hasKeys && !props.isBusy && !state.isBlinkOff ? (
          <Text inverse color={props.ink}>
            {show(under)}
          </Text>
        ) : (
          <Text color={props.ink}>{show(under)}</Text>
        )}
        <Text color={props.ink}>{after}</Text>
      </Box>
      {hint !== '' && <Text color={props.hint}>{hint}</Text>}
    </Box>
  )
}

export default Input
