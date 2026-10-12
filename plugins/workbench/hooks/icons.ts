// The pane's pictures, drawn as SVG in the manner of Apple's SF Symbols: a
// 24-unit grid, round strokes, one weight. Three forms: a bare symbol in a
// colour, a tile (a white symbol on a rounded square of colour, as in iOS
// Settings) and a pill (a capsule of tinted colour with a short text).
// Where a surface draws no pictures (a terminal), `GLYPH` stands in.

export type Scheme = 'light' | 'dark'

/** Apple's system colours, each in its light and dark appearance. */
const SYSTEM = {
  blue: ['#007AFF', '#0A84FF'],
  green: ['#34C759', '#30D158'],
  red: ['#FF3B30', '#FF453A'],
  orange: ['#FF9500', '#FF9F0A'],
  yellow: ['#FFCC00', '#FFD60A'],
  purple: ['#AF52DE', '#BF5AF2'],
  pink: ['#FF2D55', '#FF375F'],
  teal: ['#30B0C7', '#40C8E0'],
  indigo: ['#5856D6', '#5E5CE6'],
  mint: ['#00C7BE', '#63E6E2'],
  brown: ['#A2845E', '#AC8E68'],
  gray: ['#8E8E93', '#8E8E93'],
  gray2: ['#AEAEB2', '#636366'],
  label: ['#1D1D1F', '#F5F5F7'],
} as const

export type Hue = keyof typeof SYSTEM

export const hex = (hue: Hue, scheme: Scheme): string => SYSTEM[hue][scheme === 'light' ? 0 : 1]

/** Each symbol's strokes (and fills, marked `F:`), on a 24-unit square. */
const PATHS = {
  branch: ['M6 7.2v9.6', 'M18 9.2c0 4.8-12 3.6-12 7.6', 'C6 5 2.2', 'C6 19 2.2', 'C18 7 2.2'],
  terminal: ['R3 4.5 18 15 3.2', 'M7.5 9.5l3 2.5-3 2.5', 'M12.8 15h3.8'],
  ports: ['F:C12 12 2', 'M8.6 8.6a4.8 4.8 0 0 0 0 6.8', 'M15.4 8.6a4.8 4.8 0 0 1 0 6.8', 'M5.7 5.7a8.9 8.9 0 0 0 0 12.6', 'M18.3 5.7a8.9 8.9 0 0 1 0 12.6'],
  folder: ['M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7V17a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17z'],
  doc: ['M7 3h6.5L19 8.5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M13 3.2V9h5.8'],
  search: ['C10.5 10.5 6', 'M15 15l5 5'],
  clock: ['C12 12 9', 'M12 7.5V12l3.2 2'],
  pull: ['C6 6 2.2', 'C6 18 2.2', 'C18 18 2.2', 'M6 8.2v7.6', 'M18 15.8V10a3 3 0 0 0-3-3h-4.5', 'M13 4.3L10.3 7 13 9.7'],
  play: ['F:M8 5.2v13.6l11-6.8z'],
  playCircle: ['C12 12 9', 'F:M10 8.3v7.4l6-3.7z'],
  stop: ['F:R6.5 6.5 11 11 2.2'],
  restart: ['M19.5 12a7.5 7.5 0 1 1-2.4-5.5', 'M19.5 4.2v4.6h-4.6'],
  close: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
  trash: ['M4 7h16', 'M9 7V4.5h6V7', 'M6.5 7l1 12.2A1.8 1.8 0 0 0 9.3 21h5.4a1.8 1.8 0 0 0 1.8-1.8l1-12.2', 'M10 11v6', 'M14 11v6'],
  copy: ['R8 8 12 12 2.5', 'M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2'],
  pencil: ['M4 20l1.2-4.4L16.4 4.4a2 2 0 0 1 2.9 0l.3.3a2 2 0 0 1 0 2.9L8.4 18.8z', 'M14.6 6.2l3.2 3.2'],
  globe: ['C12 12 9', 'M3 12h18', 'M12 3c2.4 2.6 3.7 5.6 3.7 9s-1.3 6.4-3.7 9c-2.4-2.6-3.7-5.6-3.7-9S9.6 5.6 12 3z'],
  bolt: ['F:M13.2 2.5L5 13.6h6.2L10.4 21.5 19 10.2h-6.3z'],
  server: ['R4 4 16 7 2', 'R4 13 16 7 2', 'F:C8 7.5 1.1', 'F:C8 16.5 1.1'],
  database: ['M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z', 'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  lock: ['R5 10.5 14 10.5 2.5', 'M8 10.5V7.5a4 4 0 0 1 8 0v3'],
  warning: ['M10.3 4.3a2 2 0 0 1 3.4 0l7.5 13A2 2 0 0 1 19.5 20.3h-15a2 2 0 0 1-1.7-3z', 'M12 9.5v4.5', 'F:C12 17 1.1'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  checkCircle: ['C12 12 9', 'M8 12.3l2.8 2.8L16.2 9.5'],
  xCircle: ['C12 12 9', 'M9 9l6 6', 'M15 9l-6 6'],
  up: ['M12 19V5.5', 'M6.5 11L12 5.5l5.5 5.5'],
  down: ['M12 5v13.5', 'M6.5 13l5.5 5.5 5.5-5.5'],
  chevron: ['M9.5 5.5l6.5 6.5-6.5 6.5'],
  chevronDown: ['M5.5 9.5l6.5 6.5 6.5-6.5'],
  back: ['M14.5 5.5L8 12l6.5 6.5'],
  plus: ['M12 5v14', 'M5 12h14'],
  fetch: ['M7 17.5a4.5 4.5 0 0 1-.7-8.9A6 6 0 0 1 17.8 9a4 4 0 0 1-.8 8.5', 'M12 11.5V20', 'M9 17l3 3 3-3'],
  sparkle: ['F:M12 2.8l1.9 5.6 5.6 1.9-5.6 1.9L12 17.8l-1.9-5.6-5.6-1.9 5.6-1.9z', 'F:M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z'],
  at: ['C12 12 3.6', 'M15.6 12v1.5a2.6 2.6 0 0 0 5.2 0V12a8.8 8.8 0 1 0-3.4 7'],
  cube: ['M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z', 'M4.2 7.5L12 12l7.8-4.5', 'M12 12v9'],
  hammer: ['M14.5 4.5l5 5-2.5 2.5-5-5z', 'M12 7l-8.3 8.3a1.8 1.8 0 0 0 0 2.5l2.5 2.5a1.8 1.8 0 0 0 2.5 0L17 12', 'M14.5 4.5L17 2'],
  link: ['M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2', 'M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4'],
  gear: ['C12 12 3', 'M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1'],
  list: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'F:C4.5 6 1.2', 'F:C4.5 12 1.2', 'F:C4.5 18 1.2'],
  dot: ['F:C12 12 5'],
} as const satisfies Record<string, readonly string[]>

export type IconName = keyof typeof PATHS

/** One part of a symbol as SVG: a path, a circle (`C x y r`) or a rounded rectangle (`R x y w h r`); `F:` fills it. */
function part(spec: string, color: string, weight: number): string {
  const isFill = spec.startsWith('F:')
  const body = isFill ? spec.slice(2) : spec
  const paint = isFill ? `fill="${color}"` : `fill="none" stroke="${color}" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round"`
  if (body.startsWith('C')) {
    const [x, y, r] = body.slice(1).trim().split(/\s+/)

    return `<circle cx="${x}" cy="${y}" r="${r}" ${paint}/>`
  }
  if (body.startsWith('R')) {
    const [x, y, w, h, r] = body.slice(1).trim().split(/\s+/)

    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ${paint}/>`
  }

  return `<path d="${body}" ${paint}/>`
}

const symbol = (name: IconName, color: string, weight: number): string => PATHS[name].map(spec => part(spec, color, weight)).join('')

/** A bare symbol in one colour. */
export function glyphSvg(name: IconName, color: string, size = 16): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${symbol(name, color, 2)}</svg>`
}

/** A white symbol on a rounded square of colour, the way iOS Settings marks each row. */
export function tileSvg(name: IconName, color: string, size = 22): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">`,
    `<rect width="24" height="24" rx="6" fill="${color}"/>`,
    `<g transform="translate(4.2 4.2) scale(0.65)">${symbol(name, '#FFFFFF', 2.6)}</g>`,
    '</svg>',
  ].join('')
}

/** The workbench's mascot, an otter holding a wrench, drawn in its own 930 x 880 box. */
export function mascotSvg(size = 30): string {
  const fur = '#E27A52'
  const cream = '#F7E9DC'
  const ink = '#2B1B17'
  const steel = '#3D4A5C'

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="190 190 950 900">`,
    `<path fill="${steel}" d="M830 620L920 715L640 1030C600 1070 520 1060 505 990C500 960 520 935 545 930L700 790Z"/>`,
    `<path fill="${steel}" d="M840 540C850 480 930 440 1000 460C1030 465 1040 480 1030 490L945 570L965 610L1000 615L1085 535C1110 540 1120 590 1110 620C1100 690 1030 725 950 718L920 715L830 620Z"/>`,
    `<circle cx="578" cy="992" r="27" fill="#FFFFFF"/>`,
    `<path fill="${fur}" d="M418 255C430 225 520 230 630 255C740 275 840 340 885 440C890 465 880 480 860 490L840 520C830 580 800 610 760 620C800 640 810 680 790 720L700 800L720 900C600 950 520 930 480 985C400 990 330 960 270 900C215 840 205 760 235 690C250 650 275 655 285 680C300 720 330 770 365 790C385 740 410 690 440 640C400 590 385 540 400 470C360 490 340 480 335 470C345 430 390 385 430 365C380 365 350 370 352 355C360 320 430 295 480 288C440 280 415 275 418 255Z"/>`,
    `<path fill="${cream}" d="M640 430C700 400 790 395 860 460C870 480 850 490 830 495C820 560 790 600 720 620C650 635 560 625 535 590C520 560 540 530 570 510C600 490 620 450 640 430Z"/>`,
    `<ellipse cx="558" cy="468" rx="20" ry="28" fill="${ink}"/>`,
    `<ellipse cx="796" cy="395" rx="20" ry="26" fill="${ink}"/>`,
    `<path fill="${ink}" d="M668 450C690 425 735 425 745 445C740 470 720 485 710 485C690 480 672 465 668 450Z"/>`,
    `<path fill="none" stroke="${ink}" stroke-width="9" stroke-linecap="round" d="M628 522C650 540 690 550 715 520C740 530 775 515 790 480"/>`,
    `<ellipse cx="865" cy="800" rx="62" ry="78" fill="${fur}" transform="rotate(12 865 800)"/>`,
    `<path fill="none" stroke="${ink}" stroke-width="9" stroke-linecap="round" d="M578 770C640 790 720 790 735 850C740 890 720 915 705 925"/>`,
    '</svg>',
  ].join('')
}

/** A rounded square of colour with a letter on it: a changed file's status. */
export function letterTileSvg(letter: string, color: string, size = 18): string {
  const shown = letter.replace(/[^A-Za-z0-9!?]/g, '').slice(0, 1) || '?'

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">`,
    `<rect width="24" height="24" rx="6" fill="${color}"/>`,
    `<text x="12" y="16.6" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',system-ui,sans-serif" font-size="13.5" font-weight="700" fill="#FFFFFF">${shown}</text>`,
    '</svg>',
  ].join('')
}

const escapeXml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** How wide a pill's text runs, near enough, at 11px in the system font. */
const textWidth = (text: string): number =>
  [...text].reduce((sum, c) => sum + (/[ ilIjft.,:;'|!·()]/.test(c) ? 3.3 : /[mwMW@]/.test(c) ? 9.2 : /[A-Z]/.test(c) ? 7.3 : /[0-9]/.test(c) ? 6.5 : 6.1), 0)

/** The size a pill is drawn at, so the element can be given it. */
export function pillSize(text: string, withDot = false): { width: number; height: number } {
  return { width: Math.ceil(textWidth(text) + 16 + (withDot ? 10 : 0)), height: 18 }
}

/** A capsule of tinted colour holding a short text, with a dot of the colour before it when asked. */
export function pillSvg(text: string, color: string, withDot = false): string {
  const { width, height } = pillSize(text, withDot)
  const textX = withDot ? 18 : 8

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" rx="${height / 2}" fill="${color}" fill-opacity="0.16"/>`,
    withDot ? `<circle cx="10" cy="9" r="3" fill="${color}"/>` : '',
    `<text x="${textX}" y="12.6" font-family="-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',system-ui,sans-serif" font-size="11" font-weight="600" fill="${color}">${escapeXml(text)}</text>`,
    '</svg>',
  ].join('')
}

/** Recent values as a smooth line with a soft fill under it. */
export function sparklineSvg(values: readonly number[], color: string, width = 160, height = 26): string {
  const max = Math.max(...values, 1)
  const step = values.length > 1 ? width / (values.length - 1) : width
  const points = values.map((v, at) => [at * step, height - 2 - (v / max) * (height - 5)] as const)
  const line = points.map(([x, y], at) => `${at === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width} ${height} L0 ${height} Z`

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<path d="${area}" fill="${color}" fill-opacity="0.12"/>`,
    `<path d="${line}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`,
    '</svg>',
  ].join('')
}

/** One row of the commit graph: as tall as a line of text, so the rows join into one drawing. */
export const GRAPH_ROW = 19
const GRAPH_LANE = 12
const LANES: readonly Hue[] = ['blue', 'purple', 'green', 'orange', 'pink', 'teal', 'yellow', 'indigo']

export const graphWidth = (lanes: number): number => Math.ceil(lanes * GRAPH_LANE + 4)

/** What one row of the laid-out graph needs drawn (see `layoutGraph` in git.ts). */
export type GraphCell = {
  lane: number
  colour: number
  isFromAbove: boolean
  isToBelow: boolean
  through: readonly { lane: number; colour: number }[]
  joins: readonly { lane: number; colour: number }[]
  forks: readonly { lane: number; colour: number }[]
}

/**
 * One commit's strip of the graph: the lanes passing by as straight lines,
 * other children's lanes curving in to the commit, its other parents'
 * lanes curving out below it, and the commit itself as a dot on its lane.
 */
export function graphRowSvg(cell: GraphCell, lanes: number, scheme: Scheme, isMerge = false): string {
  const h = GRAPH_ROW
  const mid = h / 2
  const width = graphWidth(lanes)
  const x = (lane: number): number => 2 + lane * GRAPH_LANE + GRAPH_LANE / 2
  const colour = (index: number): string => hex(LANES[index % LANES.length] ?? 'blue', scheme)
  const line = (d: string, index: number): string =>
    `<path d="${d}" stroke="${colour(index)}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
  const parts: string[] = []
  for (const one of cell.through) parts.push(line(`M${x(one.lane)} 0V${h}`, one.colour))
  if (cell.isFromAbove) parts.push(line(`M${x(cell.lane)} 0V${mid}`, cell.colour))
  if (cell.isToBelow) parts.push(line(`M${x(cell.lane)} ${mid}V${h}`, cell.colour))
  for (const one of cell.joins) parts.push(line(`M${x(one.lane)} 0C${x(one.lane)} ${mid * 0.9} ${x(cell.lane)} ${mid * 0.3} ${x(cell.lane)} ${mid}`, one.colour))
  for (const one of cell.forks) parts.push(line(`M${x(cell.lane)} ${mid}C${x(cell.lane)} ${mid + mid * 0.7} ${x(one.lane)} ${mid + mid * 0.1} ${x(one.lane)} ${h}`, one.colour))
  const dot = isMerge
    ? `<circle cx="${x(cell.lane)}" cy="${mid}" r="3.6" fill="${scheme === 'dark' ? '#2D2D2C' : '#FFFFFF'}" stroke="${colour(cell.colour)}" stroke-width="2"/>`
    : `<circle cx="${x(cell.lane)}" cy="${mid}" r="4" fill="${colour(cell.colour)}"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}">${parts.join('')}${dot}</svg>`
}

/** What a cell grid draws where a desktop would draw a symbol. */
export const GLYPH: Record<IconName, string> = {
  branch: '⎇',
  terminal: '❯',
  ports: '◉',
  folder: '▸',
  doc: '·',
  search: '⌕',
  clock: '◷',
  pull: '⇄',
  play: '▶',
  playCircle: '▶',
  stop: '■',
  restart: '↻',
  close: '×',
  trash: '⌫',
  copy: '⧉',
  pencil: '✎',
  globe: '◍',
  bolt: '⚡',
  server: '▤',
  database: '◫',
  lock: '◦',
  warning: '⚠',
  check: '✓',
  checkCircle: '✓',
  xCircle: '✗',
  up: '↑',
  down: '↓',
  chevron: '›',
  chevronDown: '⌄',
  back: '‹',
  plus: '+',
  fetch: '⇣',
  sparkle: '✦',
  at: '@',
  cube: '◆',
  hammer: '◆',
  link: '⛓',
  external: '↗',
  gear: '⚙',
  list: '≡',
  dot: '●',
}

/** The tile a listening process gets: a symbol and a colour by what it is. */
export function portLook(name: string, framework: string, kind: 'dev' | 'other' | 'system'): { icon: IconName; hue: Hue } {
  const f = framework.toLowerCase()
  const n = name.toLowerCase()
  if (f === 'postgresql' || f === 'mysql' || f === 'mariadb' || f === 'mongodb' || f === 'redis') {
    return { icon: 'database', hue: f === 'redis' ? 'red' : f === 'mongodb' ? 'green' : f === 'mysql' || f === 'mariadb' ? 'orange' : 'blue' }
  }
  if (f === 'vite') return { icon: 'bolt', hue: 'purple' }
  if (f === 'next.js') return { icon: 'globe', hue: 'indigo' }
  if (f === 'nuxt' || f === 'django' || f === 'nginx') return { icon: 'globe', hue: 'mint' }
  if (f === 'astro' || f === 'sveltekit' || f === 'remix' || f === 'angular' || f === 'storybook') return { icon: 'globe', hue: 'orange' }
  if (f === 'uvicorn' || f === 'gunicorn' || f === 'flask' || f === 'http.server' || f === 'streamlit' || f === 'jupyter') return { icon: 'server', hue: 'teal' }
  if (f === 'docker' || f === 'wsl') return { icon: 'cube', hue: f === 'docker' ? 'blue' : 'orange' }
  if (f === 'rails' || f === 'puma') return { icon: 'server', hue: 'red' }
  if (kind === 'system') return { icon: 'gear', hue: 'gray' }
  if (kind === 'other') return { icon: 'cube', hue: 'gray' }
  if (n === 'node' || n === 'bun' || n === 'deno') return { icon: 'bolt', hue: 'green' }
  if (n.startsWith('python')) return { icon: 'server', hue: 'blue' }
  if (n === 'java' || n === 'javaw') return { icon: 'server', hue: 'orange' }
  if (n === 'dotnet') return { icon: 'server', hue: 'purple' }

  return { icon: 'globe', hue: 'blue' }
}

/** A changed file's letter, and the colour Xcode and the Finder would give it. */
export function statusHue(letter: string): Hue {
  if (letter === 'A' || letter === 'U') return 'green'
  if (letter === 'D' || letter === '!') return 'red'
  if (letter === 'R' || letter === 'C') return 'purple'

  return 'orange'
}
