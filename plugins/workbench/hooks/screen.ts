import type { Block, Line } from '../types'

// A terminal's screen drawn as one picture: monospaced, black, in the colours
// Windows Terminal and PSReadLine use, each command after its `PS C:\…>` prompt
// and its output under it, the way the shell itself would have printed them.

/** Windows Terminal's "Campbell" scheme. */
export const TERM = {
  background: '#0C0C0C',
  chrome: '#1F1F1F',
  edge: '#333333',
  foreground: '#CCCCCC',
  dim: '#767676',
  red: '#E74856',
  yellow: '#F9F1A5',
  green: '#16C60C',
  cyan: '#61D6D6',
  blue: '#3B78FF',
  string: '#3A96DD',
  white: '#F2F2F2',
} as const

/** One run of text in one colour. */
type Span = { text: string; color: string; isItalic?: boolean }
type Row = Span[]

const FONT = "'Cascadia Mono','Cascadia Code',Consolas,'SF Mono',Menlo,ui-monospace,monospace"
const FONT_PX = 12.5
/** The advance of one character of the font at FONT_PX: 0.6 em for these faces. */
const CHAR_PX = FONT_PX * 0.6
const LINE_PX = 17
const PAD_X = 2
const PAD_Y = 2
/** The markup's bound is 131072 characters; leave room for the frame around the rows. */
const MAX_MARKUP = 120_000

/** A command line in PSReadLine's colours: the command yellow, parameters grey, strings and variables tinted. */
export function tokens(cmd: string): Span[] {
  const out: Span[] = []
  const parts = cmd.match(/("[^"]*"?|'[^']*'?|\s+|[|;]|[^\s|;"']+)/g) ?? []
  let isCommand = true
  for (const part of parts) {
    if (/^\s+$/.test(part)) {
      out.push({ text: part, color: TERM.foreground })
      continue
    }
    if (part === '|' || part === ';') {
      out.push({ text: part, color: TERM.dim })
      isCommand = true
      continue
    }
    const color = /^["']/.test(part)
      ? TERM.string
      : part.startsWith('$')
        ? TERM.green
        : isCommand
          ? TERM.yellow
          : /^--?[A-Za-z]/.test(part)
            ? TERM.dim
            : /^\d+(\.\d+)?$/.test(part)
              ? TERM.white
              : TERM.foreground
    out.push({ text: part, color })
    isCommand = false
  }

  return out
}

/** The prompt PowerShell prints before a command: `PS C:\repo> `. */
export function promptText(cwd: string): string {
  return `PS ${cwd}> `
}

/** Rows cut to `cols` characters each, a long one carrying on below. */
export function wrapRow(row: Row, cols: number): Row[] {
  const out: Row[] = []
  let current: Row = []
  let used = 0
  for (const span of row) {
    let rest = span.text
    while (rest.length > 0) {
      const room = cols - used
      if (room <= 0) {
        out.push(current)
        current = []
        used = 0
        continue
      }
      const piece = rest.slice(0, room)
      current.push({ ...span, text: piece })
      used += piece.length
      rest = rest.slice(piece.length)
    }
  }
  out.push(current)

  return out
}

const toneColor = (tone: Line['tone']): string => (tone === 'err' ? TERM.red : tone === 'info' ? TERM.dim : TERM.foreground)

/** A block's lines without the blank ones PowerShell pads tables with at either end. */
function trimmed(lines: readonly Line[]): Line[] {
  let start = 0
  let end = lines.length
  while (start < end && lines[start]!.text.trim() === '') start += 1
  while (end > start && lines[end - 1]!.text.trim() === '') end -= 1

  return lines.slice(start, end)
}

/** Every row the screen holds, in order: each command's prompt and what it printed. */
export function screenRows(blocks: readonly Block[], toNative: (path: string) => string, cols: number): Row[] {
  const rows: Row[] = []
  for (const block of blocks) {
    if (block.cmd !== '') {
      const prompt: Row = [{ text: promptText(toNative(block.cwd)), color: TERM.foreground }, ...tokens(block.cmd)]
      rows.push(...wrapRow(prompt, cols))
    }
    if (block.dropped > 0) rows.push([{ text: `… ${block.dropped} earlier lines not kept`, color: TERM.dim, isItalic: true }])
    for (const line of trimmed(block.lines)) {
      rows.push(...wrapRow([{ text: line.text.replace(/\t/g, '    '), color: toneColor(line.tone), isItalic: line.tone === 'info' }], cols))
    }
    // As a terminal echoes it when a command is interrupted.
    if (block.state === 'stopped') rows.push([{ text: '^C', color: TERM.foreground }])
    // A blank line between commands, as PowerShell leaves after most output.
    if (block.cmd !== '' && block.lines.length > 0) rows.push([])
  }

  return rows
}

// Spaces go in as no-break spaces: a picture's text collapses runs of plain ones, and
// in a monospaced face both are one column wide, so tables keep their columns.
const escapeXml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '\u00a0')

function rowMarkup(row: Row, at: number): string {
  if (row.length === 0 || row.every(span => span.text === '')) return ''
  const y = PAD_Y + at * LINE_PX + LINE_PX * 0.76
  const spans = row
    .filter(span => span.text !== '')
    .map(span => `<tspan fill="${span.color}"${span.isItalic === true ? ' font-style="italic"' : ''}>${escapeXml(span.text)}</tspan>`)
    .join('')

  return `<text x="${PAD_X}" y="${y.toFixed(1)}">${spans}</text>`
}

export type Screen = { svg: string; width: number; height: number; rows: number; hidden: number }

/** The screen as SVG: the last rows that fit the markup's bound, `cols` characters wide. */
export function screenSvg(rows: readonly Row[], cols: number, maxRows: number): Screen {
  let shown = rows.slice(-maxRows)
  let parts = shown.map(rowMarkup)
  let size = parts.reduce((sum, part) => sum + part.length, 0)
  while (size > MAX_MARKUP && shown.length > 1) {
    size -= parts[0]!.length
    shown = shown.slice(1)
    parts = parts.slice(1)
  }
  // Rows are laid out again from the top once the oldest are cut.
  parts = shown.map(rowMarkup)
  const width = Math.ceil(PAD_X * 2 + cols * CHAR_PX)
  const height = Math.ceil(PAD_Y * 2 + Math.max(1, shown.length) * LINE_PX)
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<g font-family="${FONT}" font-size="${FONT_PX}" xml:space="preserve" style="white-space:pre">`,
    parts.join(''),
    '</g></svg>',
  ].join('')

  return { svg, width, height, rows: shown.length, hidden: rows.length - shown.length }
}

/** How many characters fit across `px` pixels of screen. */
export const colsFor = (px: number): number => Math.max(20, Math.floor((px - PAD_X * 2) / CHAR_PX))
