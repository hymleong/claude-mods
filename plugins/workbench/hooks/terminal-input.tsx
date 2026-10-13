import type { ClientModule } from 'claude-code'

import { bufferOf, edit, keepSpaces, textOf, typed } from './edit-buffer'
import type { Buffer } from './edit-buffer'

// A terminal's input line: a surface module, so each key reaches it as it is
// pressed. It keeps the line being typed and walks the history itself; what
// needs the shell (running the line, stopping a command, completing a word)
// it posts to the hooks module, which holds the PowerShell.

export type Completion = { seq: number; start: number; length: number; items: string[] }

export type InputProps = {
  termId: string
  /** What the session has printed, as coloured rows, drawn above the prompt. */
  screen: { text: string; color: string; isItalic?: boolean; isBold?: boolean; isDim?: boolean; isUnderline?: boolean }[][]
  /**
   * Rows the module fills at the least, blank ones under the prompt included: its region
   * is only as tall as what it draws, and a click there is what gives it the keys.
   */
  minRows: number
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
  /** The whole line selected with ctrl+a: the next key acts on all of it. */
  isAllSelected?: boolean
}

const EMPTY = bufferOf('')
/** A terminal's cursor blink: half a second on, half off. */
const BLINK_MS = 530

/** The line with one completion put in for the word Tab was pressed on. */
function complete(base: string, cycle: Pick<Cycle, 'start' | 'length'>, item: string): Buffer {
  const text = base.slice(0, cycle.start) + item + base.slice(cycle.start + cycle.length)

  return { lines: [text], row: 0, col: cycle.start + item.length }
}

/** Block characters a terminal draws pictures with: a QR code, a progress bar. */
const BLOCKS = /^[ ▀▄█]+$/

/** Whether a row is a picture drawn in block characters, as Expo's QR code is. */
export function isBlockArt(row: readonly { text: string }[]): boolean {
  const text = row.map(span => span.text).join('')

  return /[▀▄█]/.test(text) && BLOCKS.test(text)
}

/**
 * What would finish `line`: the rest of the latest command in `history` (latest last) that
 * starts with it, ignoring case, as PSReadLine's history prediction; `''` for none.
 */
export function suggest(line: string, history: readonly string[]): string {
  if (line.trim() === '') return ''
  const typed = line.toLowerCase()
  for (let at = history.length - 1; at >= 0; at -= 1) {
    const one = history[at] ?? ''
    if (one.length > line.length && one.toLowerCase().startsWith(typed)) return one.slice(line.length)
  }

  return ''
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
  // Any key but ctrl+a lets a selection go, as it does in a PowerShell window.
  const set = (next: Partial<State>): void => put({ ...now(), hasKeys: true, note: '', isBlinkOff: false, isAllSelected: false, ...next })
  if (!blinking.has(surface)) {
    blinking.add(surface)
    surface.every(BLINK_MS, () => {
      const held = now()
      if (held.hasKeys) put({ ...held, isBlinkOff: !held.isBlinkOff })
    })
  }

  surface.onKey(raw => {
    // Arrow and other named keys as a browser names them (ArrowRight, End) are read as the engine names them.
    const named = /^Arrow(Up|Down|Left|Right)$/.exec(raw.key)?.[1]
    const key = named !== undefined ? { ...raw, key: named.toLowerCase() } : /^(End|Home|Enter|Tab|Backspace|Delete)$/.test(raw.key) ? { ...raw, key: raw.key.toLowerCase() } : raw
    const state = now()
    // Ctrl+C as a surface may hand it: the letter in either case, or the control character it types.
    const isInterrupt = (key.ctrl === true && key.key.toLowerCase() === 'c') || key.key === '\u0003' || (key.ctrl === true && key.key === 'break')
    // Ctrl+A selects the whole line, as PSReadLine does in a Windows PowerShell window.
    if ((key.ctrl === true && key.key.toLowerCase() === 'a') || key.key === '\u0001') {
      if (textOf(state.buffer) !== '') set({ isAllSelected: true, cycle: null })

      return
    }
    if (state.isAllSelected === true) {
      const whole = textOf(state.buffer)
      // With a selection, ctrl+c copies it rather than interrupting.
      if (isInterrupt) {
        surface.post({ type: 'copy', termId: props.termId, text: whole })
        set({})

        return
      }
      if (key.key === 'backspace' || key.key === 'delete') {
        set({ buffer: EMPTY, back: -1, cycle: null })

        return
      }
      const text = typed(key)
      if (text !== undefined) {
        set({ buffer: bufferOf(text, 0, text.length), back: -1, cycle: null })

        return
      }
      if (key.key === 'left' || key.key === 'home') {
        set({ buffer: bufferOf(whole, 0, 0) })

        return
      }
      if (key.key === 'right' || key.key === 'end') {
        set({ buffer: bufferOf(whole, 0, whole.length) })

        return
      }
      // A paste replaces the selection: the line empties now, and the clipboard's text goes in when it comes.
      const isPasteKey = ((key.ctrl === true || key.meta === true) && key.key.toLowerCase() === 'v') || (key.shift === true && key.key === 'insert')
      if (isPasteKey) put({ ...state, buffer: EMPTY, isAllSelected: false })
    }
    if (isInterrupt) {
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
    if ((key.ctrl === true && key.key.toLowerCase() === 'l') || key.key === '\u000c') {
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
    // A suggestion is taken as PSReadLine takes one: → or End at the end of the line takes
    // it all, ctrl+→ the next word of it.
    const typedLine = textOf(state.buffer)
    const offered = state.buffer.col === typedLine.length && state.back === -1 && state.cycle === null ? suggest(typedLine, props.history) : ''
    if (offered !== '' && key.ctrl !== true && (key.key === 'right' || key.key === 'end')) {
      set({ buffer: bufferOf(typedLine + offered, 0, typedLine.length + offered.length) })

      return
    }
    if (offered !== '' && key.ctrl === true && key.key === 'right') {
      const word = /^\s*\S+/.exec(offered)?.[0] ?? offered
      set({ buffer: bufferOf(typedLine + word, 0, typedLine.length + word.length) })

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
  // The rest of the latest command run here that starts as this line does, in grey after
  // the cursor, as PowerShell 7's prediction shows it; the cursor sits on its first letter.
  const ghost =
    col === line.length && state.back === -1 && cycle === null && state.isAllSelected !== true && !props.isBusy && !props.isEnded ? suggest(line, props.history) : ''
  const ghostShown = ghost.slice(0, Math.max(0, left + room - col))
  const hint = props.isEnded
    ? 'session ended: Enter restarts it'
    : state.note !== ''
      ? state.note
      : props.isBusy
        ? 'ctrl+c stops'
        : ''

  // The region is the whole screen, so a click anywhere on it takes the keys: what the
  // session printed, the prompt after it as PowerShell prints it (and after that, quietly,
  // the completions to pick from or a note), then the empty black below.
  return (
    <Box flexDirection="column" width="100%" flexGrow={1}>
      {props.screen.map(row =>
        // Set in proportional type, block characters would not line up and a QR code would not
        // scan: each is drawn as one cell instead, its top and bottom halves filled as the glyph is.
        props.isProportional && isBlockArt(row) ? (
          <Box flexDirection="row">
            {row.flatMap(span =>
              [...span.text].map(glyph => (
                <Box flexDirection="column" width={1} height={1} flexShrink={0}>
                  <Box height={0.5} {...(glyph === '▀' || glyph === '█' ? { backgroundColor: span.color } : {})} />
                  <Box height={0.5} {...(glyph === '▄' || glyph === '█' ? { backgroundColor: span.color } : {})} />
                </Box>
              )),
            )}
          </Box>
        ) : (
          <Box flexDirection="row">
            {row.length === 0 ? (
              <Text> </Text>
            ) : (
              row.map(span => (
                <Text color={span.color} italic={span.isItalic === true} bold={span.isBold === true} dimColor={span.isDim === true} underline={span.isUnderline === true}>
                  {show(span.text)}
                </Text>
              ))
            )}
          </Box>
        ),
      )}
      <Box flexDirection="row" flexWrap="wrap">
        <Text color={props.isEnded ? props.bad : props.accent}>{show(props.prompt)}</Text>
        {/* Selected with ctrl+a: the whole line highlighted, as a selection in a PowerShell window. */}
        {state.isAllSelected === true && (
          <Text inverse color={props.ink}>
            {show(line.slice(left, left + room))}
          </Text>
        )}
        {state.isAllSelected !== true && <Text color={props.ink}>{before}</Text>}
        {/* Each piece a child of this row itself, so the suggestion stays on the prompt's line. */}
        {ghostShown !== '' && (
          <Text inverse={!state.isBlinkOff} color={props.hint}>
            {show(ghostShown.slice(0, 1))}
          </Text>
        )}
        {ghostShown !== '' && ghostShown.length > 1 && <Text color={props.hint}>{show(ghostShown.slice(1))}</Text>}
        {ghostShown === '' && state.isAllSelected !== true && (
          <Text inverse={!props.isBusy && !state.isBlinkOff} color={props.ink}>
            {show(under)}
          </Text>
        )}
        {ghostShown === '' && state.isAllSelected !== true && after !== '' && <Text color={props.ink}>{after}</Text>}
        {cycle !== null && cycle.items.length > 1 ? (
          <Box flexDirection="row" columnGap={2} marginLeft={2}>
            {cycle.items.slice(0, 12).map((item, at) => (
              <Text key={`c${at}`} inverse={at === cycle.index} color={props.hint}>
                {show(item)}
              </Text>
            ))}
            {cycle.items.length > 12 && <Text color={props.hint}>+{cycle.items.length - 12}</Text>}
          </Box>
        ) : (
          hint !== '' && (
            <Box marginLeft={2}>
              <Text color={props.hint}>{hint}</Text>
            </Box>
          )
        )}
      </Box>
      {Array.from({ length: Math.max(2, props.minRows - props.screen.length - 1) }, (_, at) => (
        <Text key={`pad${at}`}> </Text>
      ))}
    </Box>
  )
}

export default Input
