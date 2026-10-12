import type { ClientModule } from 'claude-code'

import { bufferOf, edit, keepSpaces, scrolled, textOf } from './edit-buffer'
import type { Buffer } from './edit-buffer'

// The file editor: a surface module, so keys reach it as they are pressed.
// Plain keys, as in any editor: type, move with the arrows, ctrl+s to save,
// ctrl+z to undo. Saving posts the text to the hooks module, which writes
// the file only if nobody else changed it since it was opened.

export type EditorProps = {
  path: string
  text: string
  /** When the file was last written as the hooks module read it: a new one is new text on disk. */
  rev: number
  /** Rows the editor may take; 0 when unknown. */
  rows: number
  isProportional: boolean
  accent: string
}

type State = {
  rev: number
  buffer: Buffer
  top: number
  isDirty: boolean
  undo: Buffer[]
  hasKeys: boolean
}

const MAX_UNDO = 200
const MIN_ROWS = 8
const DEFAULT_ROWS = 24

// What each instance last set, kept here as well: keys can arrive faster than frames,
// and each must edit what the one before it left, not what was last drawn.
const latest = new WeakMap<object, State>()

const Editor: ClientModule<EditorProps, State> = (props, surface) => {
  const put = (next: State): void => {
    latest.set(surface, next)
    surface.setState(next)
  }
  const { Box, Text, Button } = surface.elements
  const held = latest.get(surface) ?? surface.state
  // New text on disk replaces the buffer unless there are unsaved changes; text equal
  // to the buffer is this editor's own save coming back.
  const isFresh = held === undefined || (held.rev !== props.rev && (!held.isDirty || textOf(held.buffer) === props.text))
  const state: State = isFresh
    ? {
        rev: props.rev,
        buffer: bufferOf(props.text, held?.buffer.row ?? 0, held?.buffer.col ?? 0),
        top: held?.top ?? 0,
        isDirty: false,
        undo: [],
        hasKeys: held?.hasKeys ?? false,
      }
    : held
  if (isFresh) put(state)

  const page = Math.max(MIN_ROWS, (props.rows > 0 ? props.rows : surface.rows > 0 ? surface.rows : DEFAULT_ROWS) - 2)
  const { buffer } = state
  const digits = String(buffer.lines.length).length

  // Keys can come faster than frames: each one edits what the last one left, not what was last drawn.
  const now = (): State => latest.get(surface) ?? state
  const save = (): void => {
    const held = now()
    surface.post({ type: 'save', path: props.path, text: textOf(held.buffer), rev: held.rev })
  }
  const undo = (): void => {
    const held = now()
    const before = held.undo[held.undo.length - 1]
    if (before !== undefined) {
      put({ ...held, buffer: before, undo: held.undo.slice(0, -1), isDirty: true, top: scrolled(held.top, before.row, page) })
    }
  }

  surface.onKey(key => {
    if (key.ctrl === true && key.key === 's') return save()
    if (key.ctrl === true && key.key === 'z') return undo()
    const held = now()
    const next = edit(held.buffer, key, true, page)
    if (next === undefined) return
    const changed = next.lines !== held.buffer.lines
    put({
      ...held,
      hasKeys: true,
      buffer: next,
      top: scrolled(held.top, next.row, page),
      isDirty: held.isDirty || changed,
      undo: changed ? [...held.undo, held.buffer].slice(-MAX_UNDO) : held.undo,
    })
  })
  surface.onPointer(event => {
    if (event.type !== 'down') return
    const held = now()
    const row = Math.max(0, Math.min(held.buffer.lines.length - 1, held.top + Math.floor(event.y)))
    const col = Math.max(0, Math.min((held.buffer.lines[row] ?? '').length, Math.floor(event.x) - digits - 1))
    put({ ...held, hasKeys: true, buffer: { lines: held.buffer.lines, row, col } })
  })

  const show = (text: string): string => (props.isProportional ? keepSpaces(text) : text)

  return (
    <Box flexDirection="column">
      {buffer.lines.slice(state.top, state.top + page).map((line, at) => {
        const row = state.top + at
        const isHere = row === buffer.row && state.hasKeys

        return (
          <Box key={`l${row}`} flexDirection="row">
            <Text dimColor={row !== buffer.row} color={row === buffer.row ? props.accent : undefined}>
              {`${String(row + 1).padStart(digits)} `}
            </Text>
            {isHere && <Text>{show(line.slice(0, buffer.col))}</Text>}
            {isHere && <Text inverse>{show(line[buffer.col] ?? ' ')}</Text>}
            {isHere && <Text>{show(line.slice(buffer.col + 1))}</Text>}
            {!isHere && <Text>{show(line === '' ? ' ' : line)}</Text>}
          </Box>
        )
      })}
      <Box flexDirection="row" marginTop={1} columnGap={2}>
        <Text color={state.isDirty ? props.accent : undefined} dimColor={!state.isDirty}>
          {state.isDirty ? '● unsaved' : 'saved'}
        </Text>
        <Text dimColor>{`Ln ${buffer.row + 1}, Col ${buffer.col + 1}`}</Text>
        <Box flexGrow={1} />
        {!state.hasKeys && <Text dimColor>click in the text to type</Text>}
        {state.undo.length > 0 && <Button key="undo" plain dimColor label="undo" onPress={() => undo()} />}
        {state.isDirty && <Button key="save" plain label="save · ctrl+s" onPress={() => save()} />}
      </Box>
    </Box>
  )
}

export default Editor
