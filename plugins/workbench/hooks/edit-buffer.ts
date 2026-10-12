// Text being typed: lines and a cursor, and what each key does to them.
// The terminal's input line and the file editor both edit through this, the
// line keeping to one row, the editor to as many as the file has.

export type Buffer = { lines: string[]; row: number; col: number }

export type Key = { key: string; ctrl?: true; shift?: true; meta?: true }

const SPECIAL = new Set([
  'up', 'down', 'left', 'right', 'return', 'enter', 'tab', 'backspace', 'delete', 'home', 'end', 'pageup',
  'pagedown', 'escape', 'insert', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12',
])

export function bufferOf(text: string, row = 0, col = 0): Buffer {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const r = Math.max(0, Math.min(lines.length - 1, row))

  return { lines, row: r, col: Math.max(0, Math.min((lines[r] ?? '').length, col)) }
}

export const textOf = (buffer: Buffer): string => buffer.lines.join('\n')

/** Text a key stands for: a character, or several at once (a paste); `undefined` for a named key. */
export function typed(key: Key): string | undefined {
  if (key.ctrl === true || key.meta === true) return undefined
  if (key.key === 'space') return ' '
  if (key.key.length === 1) return key.key
  if (SPECIAL.has(key.key)) return undefined

  return key.key.length > 1 ? key.key : undefined
}

function insert(buffer: Buffer, text: string, multiline: boolean): Buffer {
  const line = buffer.lines[buffer.row] ?? ''
  const before = line.slice(0, buffer.col)
  const after = line.slice(buffer.col)
  const pieces = (multiline ? text.replace(/\r\n/g, '\n') : text.replace(/\r?\n/g, ' ')).split('\n')
  if (pieces.length === 1) {
    const lines = [...buffer.lines]
    lines[buffer.row] = before + text.replace(/\r?\n/g, ' ') + after

    return { lines, row: buffer.row, col: buffer.col + (pieces[0] ?? '').length }
  }
  const last = pieces[pieces.length - 1] ?? ''
  const added = [before + (pieces[0] ?? ''), ...pieces.slice(1, -1), last + after]
  const lines = [...buffer.lines.slice(0, buffer.row), ...added, ...buffer.lines.slice(buffer.row + 1)]

  return { lines, row: buffer.row + pieces.length - 1, col: last.length }
}

const isWordChar = (c: string): boolean => /[\w]/.test(c)

/** Where ctrl+left / ctrl+right land: the start of the word before, the end of the word after. */
function wordStep(line: string, col: number, back: boolean): number {
  let at = col
  if (back) {
    while (at > 0 && !isWordChar(line[at - 1] ?? '')) at -= 1
    while (at > 0 && isWordChar(line[at - 1] ?? '')) at -= 1
  } else {
    while (at < line.length && !isWordChar(line[at] ?? '')) at += 1
    while (at < line.length && isWordChar(line[at] ?? '')) at += 1
  }

  return at
}

/**
 * What a key does to the text: the buffer after it, or `undefined` for a key
 * that neither moves nor edits (the caller's own keys: Enter on the input
 * line, ctrl+s in the editor, ...). `page` is how far page up and down go.
 */
export function edit(buffer: Buffer, key: Key, multiline: boolean, page = 20): Buffer | undefined {
  const text = typed(key)
  if (text !== undefined) return insert(buffer, text, multiline)
  const { lines, row, col } = buffer
  const line = lines[row] ?? ''
  const at = (r: number, c: number): Buffer => {
    const rr = Math.max(0, Math.min(lines.length - 1, r))

    return { lines, row: rr, col: Math.max(0, Math.min((lines[rr] ?? '').length, c)) }
  }
  switch (key.key) {
    case 'left':
      if (key.ctrl === true) return at(row, wordStep(line, col, true))
      return col > 0 ? at(row, col - 1) : multiline && row > 0 ? at(row - 1, (lines[row - 1] ?? '').length) : buffer
    case 'right':
      if (key.ctrl === true) return at(row, wordStep(line, col, false))
      return col < line.length ? at(row, col + 1) : multiline && row < lines.length - 1 ? at(row + 1, 0) : buffer
    case 'up':
      return multiline ? at(row - 1, col) : undefined
    case 'down':
      return multiline ? at(row + 1, col) : undefined
    case 'home':
      return at(row, 0)
    case 'end':
      return at(row, line.length)
    case 'pageup':
      return multiline ? at(row - page, col) : undefined
    case 'pagedown':
      return multiline ? at(row + page, col) : undefined
    case 'backspace': {
      if (key.ctrl === true || key.meta === true) {
        const from = wordStep(line, col, true)
        const next = [...lines]
        next[row] = line.slice(0, from) + line.slice(col)

        return { lines: next, row, col: from }
      }
      if (col > 0) {
        const next = [...lines]
        next[row] = line.slice(0, col - 1) + line.slice(col)

        return { lines: next, row, col: col - 1 }
      }
      if (!multiline || row === 0) return buffer
      const above = lines[row - 1] ?? ''
      const next = [...lines.slice(0, row - 1), above + line, ...lines.slice(row + 1)]

      return { lines: next, row: row - 1, col: above.length }
    }
    case 'delete': {
      if (col < line.length) {
        const next = [...lines]
        next[row] = line.slice(0, col) + line.slice(col + 1)

        return { lines: next, row, col }
      }
      if (!multiline || row === lines.length - 1) return buffer
      const next = [...lines.slice(0, row), line + (lines[row + 1] ?? ''), ...lines.slice(row + 2)]

      return { lines: next, row, col }
    }
    case 'return':
    case 'enter':
      return multiline ? insert(buffer, '\n', true) : undefined
    case 'tab':
      return multiline ? insert(buffer, '  ', true) : undefined
    default:
      break
  }
  if (key.ctrl === true && key.key === 'a') return at(row, 0)
  if (key.ctrl === true && key.key === 'e') return at(row, line.length)
  if (key.ctrl === true && key.key === 'u' && !multiline) return { lines: [line.slice(col)], row: 0, col: 0 }
  if (key.ctrl === true && key.key === 'k' && !multiline) return { lines: [line.slice(0, col)], row: 0, col }

  return undefined
}

/** The first row to show so the cursor stays in a window of `page` rows. */
export function scrolled(top: number, row: number, page: number): number {
  if (row < top) return row
  if (row >= top + page) return row - page + 1

  return top
}

/** Text as a surface that sets type proportionally keeps it: runs of spaces stay, as no-break spaces. */
export const keepSpaces = (text: string): string => text.replace(/ /g, ' ')
