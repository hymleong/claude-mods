// The pane's pictures, drawn as SVG in the manner of Apple's SF Symbols: a
// 24-unit grid, round strokes, one weight. Three forms: a bare symbol in a
// colour, a tile (a white symbol on a rounded square of colour, as in iOS
// Settings) and a pill (a capsule of tinted colour with a short text).
// Where a surface draws no pictures (a terminal), `GLYPH` stands in.

import type { Mood } from '../types'

export type { Mood }

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

// ── the mascot ──────────────────────────────────────────────────────────────
// An otter sitting up, facing out, drawn on a 200-unit square in parts so each
// mood can move one of them. It animates with SMIL alone: no script, no redraws.

const FUR = '#E8875A'
const FUR_DARK = '#C9643A'
const CREAM = '#FBEBDD'
const INK = '#2A1A14'
const BLUSH = '#F4A38A'
const STEEL = '#5B6B80'
const STEEL_DARK = '#3E4B5C'
const HAT = '#FFC629'
const HAT_DARK = '#E0A100'
const SPARK = '#FFD54A'
const DREAM = '#A9B4C4'

const TAIL = `<path fill="${FUR_DARK}" d="M140 172C168 172 184 150 178 124C176 116 168 116 167 124C164 146 152 158 132 160Z"/>`
const EARS = [
  `<circle cx="58" cy="58" r="11" fill="${FUR}"/><circle cx="58" cy="58" r="5.5" fill="${FUR_DARK}"/>`,
  `<circle cx="142" cy="58" r="11" fill="${FUR}"/><circle cx="142" cy="58" r="5.5" fill="${FUR_DARK}"/>`,
].join('')
const BODY = [
  `<path fill="${FUR}" d="M100 104C130 104 150 128 150 158C150 182 130 192 100 192C70 192 50 182 50 158C50 128 70 104 100 104Z"/>`,
  `<ellipse cx="100" cy="160" rx="27" ry="27" fill="${CREAM}"/>`,
  `<ellipse cx="78" cy="190" rx="15" ry="8" fill="${FUR_DARK}"/>`,
  `<ellipse cx="122" cy="190" rx="15" ry="8" fill="${FUR_DARK}"/>`,
].join('')
const HEAD = [
  `<ellipse cx="100" cy="82" rx="46" ry="40" fill="${FUR}"/>`,
  // The pale face: two cheeks meeting under the nose.
  `<path fill="${CREAM}" d="M100 84C88 74 62 80 62 98C62 114 84 120 100 112C116 120 138 114 138 98C138 80 112 74 100 84Z"/>`,
  `<ellipse cx="70" cy="100" rx="7" ry="4.5" fill="${BLUSH}" opacity="0.8"/>`,
  `<ellipse cx="130" cy="100" rx="7" ry="4.5" fill="${BLUSH}" opacity="0.8"/>`,
  `<path fill="${INK}" d="M92 89C92 85 108 85 108 89C108 94 103 97 100 97C97 97 92 94 92 89Z"/>`,
  `<ellipse cx="97" cy="88" rx="2.4" ry="1.4" fill="#FFFFFF" opacity="0.7"/>`,
].join('')
const SMILE = `<path fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="M100 97V101M100 101C97 105 91 105 89 101M100 101C103 105 109 105 111 101"/>`
const MOUTH_O = `<ellipse cx="100" cy="104" rx="4" ry="5" fill="${INK}"/>`
const SNOOZE_MOUTH = `<path fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" d="M95 103C98 105 102 105 105 103"/>`

// An open eye, drawn about its own centre so a blink can squash it in place.
const eye = (cx: number): string =>
  [
    `<g transform="translate(${cx} 76)"><g>`,
    '<animateTransform attributeName="transform" type="scale" values="1 1;1 1;1 0.1;1 1" keyTimes="0;0.93;0.96;1" dur="4s" repeatCount="indefinite"/>',
    `<ellipse cx="0" cy="0" rx="6" ry="7.5" fill="${INK}"/>`,
    '<circle cx="2" cy="-3" r="2.2" fill="#FFFFFF"/>',
    '</g></g>',
  ].join('')
const EYES = eye(82) + eye(118)
const EYES_WIDE = [
  `<circle cx="82" cy="76" r="9" fill="#FFFFFF"/><circle cx="82" cy="77" r="6" fill="${INK}"/><circle cx="84" cy="74" r="2" fill="#FFFFFF"/>`,
  `<circle cx="118" cy="76" r="9" fill="#FFFFFF"/><circle cx="118" cy="77" r="6" fill="${INK}"/><circle cx="120" cy="74" r="2" fill="#FFFFFF"/>`,
].join('')
const EYES_SHUT = `<g fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"><path d="M75 77Q82 82 89 77"/><path d="M111 77Q118 82 125 77"/></g>`

const PAW_LEFT = `<ellipse cx="72" cy="140" rx="10" ry="13" fill="${FUR}" transform="rotate(20 72 140)"/>`
const WRENCH = [
  '<g transform="rotate(30 128 140)">',
  `<rect x="123" y="104" width="10" height="62" rx="5" fill="${STEEL}"/>`,
  // The open jaw: a ring with a gap at the top.
  `<path fill="${STEEL}" d="M116 110V96a12 12 0 0 1 7-11V96h10V85a12 12 0 0 1 7 11V110Z"/>`,
  `<circle cx="128" cy="160" r="2.6" fill="${STEEL_DARK}"/>`,
  '</g>',
].join('')
const PAW_RIGHT = `<ellipse cx="128" cy="142" rx="10" ry="12" fill="${FUR}"/>`

/** One letter of the sleep's z z z: it rises and fades, then starts again. */
const dreamZ = (x: number, y: number, size: number, delay: number): string =>
  [
    `<text x="${x}" y="${y}" font-family="-apple-system,'Segoe UI',system-ui,sans-serif" font-weight="800" font-size="${size}" fill="${DREAM}" opacity="0">Z`,
    `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.2;0.7;1" dur="3s" begin="${delay}s" repeatCount="indefinite"/>`,
    `<animateTransform attributeName="transform" type="translate" values="0 0;10 -28" dur="3s" begin="${delay}s" repeatCount="indefinite"/>`,
    '</text>',
  ].join('')

/** A yellow hard hat: a dome with a ridge down its middle, and a brim. */
const HARD_HAT = [
  `<path fill="${HAT}" d="M60 58C60 26 78 14 100 14C122 14 140 26 140 58Z"/>`,
  `<rect x="94" y="15" width="12" height="44" rx="6" fill="${HAT_DARK}"/>`,
  `<path fill="#FFFFFF" opacity="0.35" d="M70 50C70 34 78 24 90 20C82 28 78 38 78 50Z"/>`,
  `<rect x="50" y="54" width="100" height="10" rx="5" fill="${HAT_DARK}"/>`,
].join('')

const spark = (x1: number, y1: number, x2: number, y2: number, delay: number): string =>
  `<path stroke="${SPARK}" stroke-width="3.5" stroke-linecap="round" d="M${x1} ${y1}L${x2} ${y2}" opacity="0"><animate attributeName="opacity" values="0;1;0;0" keyTimes="0;0.1;0.35;1" dur="0.6s" begin="${delay}s" repeatCount="indefinite"/></path>`

const sleeping = (): string =>
  [
    TAIL,
    '<g>',
    '<animateTransform attributeName="transform" type="translate" values="0 0;0 2.5;0 0" dur="3.2s" repeatCount="indefinite"/>',
    BODY,
    PAW_LEFT,
    WRENCH,
    PAW_RIGHT,
    '<g transform="rotate(-8 100 110)">',
    EARS,
    HEAD,
    EYES_SHUT,
    SNOOZE_MOUTH,
    '</g>',
    '</g>',
    dreamZ(142, 52, 16, 0),
    dreamZ(152, 40, 21, 1),
    dreamZ(164, 28, 26, 2),
  ].join('')

// The wrench and the paw holding it crank together, about the wrist.
const CRANK = '<animateTransform attributeName="transform" type="rotate" values="0 128 142;22 128 142;0 128 142" keyTimes="0;0.45;1" dur="0.6s" repeatCount="indefinite"/>'

const working = (): string =>
  [
    TAIL,
    '<g>',
    '<animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur="0.6s" repeatCount="indefinite"/>',
    BODY,
    PAW_LEFT,
    EARS,
    HEAD,
    EYES,
    SMILE,
    HARD_HAT,
    `<g>${CRANK}${WRENCH}${PAW_RIGHT}</g>`,
    '</g>',
    spark(158, 92, 168, 84, 0.2),
    spark(162, 104, 174, 104, 0.25),
    spark(150, 84, 152, 72, 0.3),
  ].join('')

const waiting = (): string =>
  [
    TAIL,
    '<g>',
    '<animateTransform attributeName="transform" type="rotate" values="0 100 190;-3 100 190;0 100 190;3 100 190;0 100 190" dur="1.6s" repeatCount="indefinite"/>',
    BODY,
    WRENCH,
    PAW_RIGHT,
    EARS,
    HEAD,
    EYES_WIDE,
    MOUTH_O,
    // The free paw raised, waving.
    `<g><animateTransform attributeName="transform" type="rotate" values="0 66 128;-25 66 128;0 66 128" dur="0.8s" repeatCount="indefinite"/><ellipse cx="54" cy="112" rx="10" ry="14" fill="${FUR}" transform="rotate(-25 54 112)"/></g>`,
    '</g>',
    // A bubble with a "!" that bobs: the otter needs the person.
    '<g>',
    '<animateTransform attributeName="transform" type="translate" values="0 0;0 -4;0 0" dur="1s" repeatCount="indefinite"/>',
    `<path fill="${HAT}" d="M152 8h28a10 10 0 0 1 10 10v20a10 10 0 0 1-10 10h-14l-10 10 2-10h-6a10 10 0 0 1-10-10v-20a10 10 0 0 1 10-10z"/>`,
    `<rect x="163.5" y="14" width="5" height="19" rx="2.5" fill="${INK}"/>`,
    `<circle cx="166" cy="40" r="3" fill="${INK}"/>`,
    '</g>',
  ].join('')

const PAPER = '#FFFFFF'
const PAPER_LINE = '#B8C2CE'
const SCREEN = '#1F2630'
const PROMPT = '#5BD47A'
const GLASS = '#BFE3FF'
const BOX_TAN = '#C8955C'
const BOX_DARK = '#A97A45'
const BOX_TAPE = '#E6C894'
const STAR = '#FFD54A'
const SWEAT = '#7CC4F2'

/** Pupils looking `dx`, `dy` away from straight ahead, with their shine. */
const pupils = (dx: number, dy: number): string =>
  [82, 118]
    .map(cx => `<ellipse cx="${cx + dx}" cy="${76 + dy}" rx="6" ry="7.5" fill="${INK}"/><circle cx="${cx + dx + 2}" cy="${73 + dy}" r="2.2" fill="#FFFFFF"/>`)
    .join('')

const loop = (attr: string, values: string, dur: number, extra = ''): string =>
  `<animateTransform attributeName="${attr}" type="translate" values="${values}" dur="${dur}s" repeatCount="indefinite"${extra}/>`

/** A four-point sparkle centred on the origin. */
const STAR_PATH = 'M0 -8L2 -2L8 0L2 2L0 8L-2 2L-8 0L-2 -2Z'

const twinkle = (x: number, y: number, scale: number, delay: number): string =>
  [
    `<g transform="translate(${x} ${y}) scale(${scale})"><path fill="${STAR}" d="${STAR_PATH}" opacity="0">`,
    `<animate attributeName="opacity" values="0;1;0" dur="1.4s" begin="${delay}s" repeatCount="indefinite"/>`,
    '</path></g>',
  ].join('')

const thinking = (): string =>
  [
    TAIL,
    BODY,
    WRENCH,
    PAW_RIGHT,
    EARS,
    HEAD,
    // Eyes up and to the side, a paw on the chin, a mouth pursed in thought.
    `<g>${loop('transform', '0 0;1.5 -1;0 0', 3)}${pupils(3, -3)}</g>`,
    `<path fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" d="M96 104H106"/>`,
    `<ellipse cx="88" cy="122" rx="10" ry="12" fill="${FUR}" transform="rotate(-25 88 122)"/>`,
    // A thought cloud whose dots light one after another.
    `<circle cx="146" cy="50" r="3.5" fill="${DREAM}"/>`,
    `<circle cx="155" cy="38" r="5" fill="${DREAM}"/>`,
    `<rect x="148" y="4" width="48" height="28" rx="14" fill="#FFFFFF" stroke="${DREAM}" stroke-width="2"/>`,
    ...[162, 172, 182].map(
      (cx, at) =>
        `<circle cx="${cx}" cy="18" r="3.2" fill="${INK}" opacity="0.25"><animate attributeName="opacity" values="0.25;1;0.25" dur="1.2s" begin="${at * 0.3}s" repeatCount="indefinite"/></circle>`,
    ),
  ].join('')

/** A page of writing held up in both paws. */
const PAGE = [
  '<g transform="rotate(-4 100 148)">',
  `<rect x="68" y="122" width="64" height="48" rx="4" fill="${PAPER}" stroke="#D8DEE6" stroke-width="1.5"/>`,
  ...[
    [132, 42],
    [140, 50],
    [148, 36],
    [156, 46],
  ].map(([y, w]) => `<rect x="75" y="${y}" width="${w}" height="3.2" rx="1.6" fill="${PAPER_LINE}"/>`),
  '</g>',
].join('')
const GLASSES = [
  `<g fill="#FFFFFF" fill-opacity="0.18" stroke="${INK}" stroke-width="2.6">`,
  '<circle cx="82" cy="77" r="12"/><circle cx="118" cy="77" r="12"/>',
  '</g>',
  `<path fill="none" stroke="${INK}" stroke-width="2.6" d="M94 76Q100 72 106 76"/>`,
].join('')

const reading = (): string =>
  [
    TAIL,
    BODY,
    EARS,
    HEAD,
    // Eyes run along the lines, down at the page.
    `<g>${loop('transform', '-3 0;3 0;-3 0', 1.6)}${pupils(0, 2)}</g>`,
    GLASSES,
    SNOOZE_MOUTH,
    `<g>${loop('transform', '0 0;0 -1.5;0 0', 1.6)}${PAGE}`,
    `<ellipse cx="66" cy="150" rx="9" ry="11" fill="${FUR}"/><ellipse cx="134" cy="150" rx="9" ry="11" fill="${FUR}"/></g>`,
  ].join('')

const running = (): string =>
  [
    TAIL,
    BODY,
    EARS,
    HEAD,
    pupils(0, 3),
    SMILE,
    // A little terminal: a prompt, a blinking cursor, and lines of output that grow.
    `<rect x="60" y="120" width="80" height="54" rx="7" fill="${SCREEN}" stroke="${STEEL_DARK}" stroke-width="2"/>`,
    `<text x="67" y="138" font-family="ui-monospace,Consolas,monospace" font-size="12" font-weight="700" fill="${PROMPT}">&gt;_</text>`,
    `<rect x="86" y="128" width="6" height="11" fill="${PROMPT}"><animate attributeName="opacity" values="1;0" dur="0.9s" calcMode="discrete" repeatCount="indefinite"/></rect>`,
    ...[
      [148, 46, 0],
      [156, 58, 0.4],
      [164, 34, 0.8],
    ].map(
      ([y, w, delay]) =>
        `<rect x="67" y="${y}" width="0" height="3.2" rx="1.6" fill="#8FA3B8"><animate attributeName="width" values="0;${w};${w}" keyTimes="0;0.4;1" dur="1.6s" begin="${delay}s" repeatCount="indefinite"/></rect>`,
    ),
    // Paws tapping keys in turn.
    `<g>${loop('transform', '0 0;0 -4;0 0', 0.4)}<ellipse cx="80" cy="176" rx="10" ry="8" fill="${FUR}"/></g>`,
    `<g>${loop('transform', '0 -4;0 0;0 -4', 0.4)}<ellipse cx="120" cy="176" rx="10" ry="8" fill="${FUR}"/></g>`,
  ].join('')

const SEARCH_PATH = '0 0;-16 6;-4 14;12 6;0 0'

const browsing = (): string =>
  [
    TAIL,
    BODY,
    PAW_LEFT,
    EARS,
    HEAD,
    // The eyes follow the glass as it sweeps.
    `<g>${loop('transform', '0 0;-3 1;-1 3;3 1;0 0', 2.4)}${pupils(1, 1)}</g>`,
    MOUTH_O,
    '<g>',
    loop('transform', SEARCH_PATH, 2.4),
    `<path stroke="${STEEL_DARK}" stroke-width="8" stroke-linecap="round" d="M152 132L168 150"/>`,
    `<circle cx="140" cy="118" r="17" fill="${GLASS}" fill-opacity="0.5" stroke="${STEEL}" stroke-width="5.5"/>`,
    '<path fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" opacity="0.85" d="M130 112A11 11 0 0 1 138 106"/>',
    `<ellipse cx="166" cy="150" rx="9" ry="11" fill="${FUR}"/>`,
    '</g>',
  ].join('')

/** The otter whole, in a hard hat, for the helpers scene. */
const crew = (eyes: string): string => `${TAIL}${BODY}${EARS}${HEAD}${eyes}${SMILE}${HARD_HAT}`

const helping = (): string =>
  [
    // The lead otter, a little smaller, directing with the wrench held high.
    '<g transform="translate(30 30) scale(0.7)">',
    crew(EYES),
    `<g>${CRANK}${WRENCH}${PAW_RIGHT}</g>`,
    PAW_LEFT,
    '</g>',
    // Two small helpers at its sides, bouncing out of step.
    ...[
      [-2, 0],
      [118, 0.35],
    ].map(
      ([x, delay]) =>
        `<g transform="translate(${x} 112) scale(0.42)"><g>${loop('transform', '0 0;0 -18;0 0', 0.7, ` begin="${delay}s"`)}${crew(EYES)}${PAW_LEFT}${PAW_RIGHT}</g></g>`,
    ),
  ].join('')

const compacting = (): string =>
  [
    TAIL,
    `<g>${loop('transform', '0 0;0 6;0 0', 1.2)}`,
    BODY,
    EARS,
    HEAD,
    // Eyes squeezed shut with the effort, teeth gritted, a drop of sweat.
    `<g fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M76 71L87 77L76 83"/><path d="M124 71L113 77L124 83"/></g>`,
    `<rect x="92" y="100" width="16" height="7" rx="3" fill="#FFFFFF" stroke="${INK}" stroke-width="2"/>`,
    `<path fill="${SWEAT}" d="M142 54C142 54 136 62 136 66A6 6 0 0 0 148 66C148 62 142 54 142 54Z"><animate attributeName="opacity" values="0;1;1;0" dur="1.2s" repeatCount="indefinite"/></path>`,
    '</g>',
    // A box pressed flat, then springing back.
    '<g transform="translate(100 190)"><g>',
    '<animateTransform attributeName="transform" type="scale" values="1 1;1.14 0.62;1 1" dur="1.2s" repeatCount="indefinite"/>',
    `<rect x="-36" y="-44" width="72" height="44" rx="3" fill="${BOX_TAN}"/>`,
    `<rect x="-36" y="-44" width="72" height="10" fill="${BOX_DARK}"/>`,
    `<rect x="-6" y="-44" width="12" height="44" fill="${BOX_TAPE}"/>`,
    '</g></g>',
    // The paws push down on its lid.
    `<g>${loop('transform', '0 0;0 17;0 0', 1.2)}<ellipse cx="78" cy="144" rx="11" ry="9" fill="${FUR}"/><ellipse cx="122" cy="144" rx="11" ry="9" fill="${FUR}"/></g>`,
  ].join('')

const finished = (): string =>
  [
    '<g>',
    '<animateTransform attributeName="transform" type="translate" values="0 0;0 -14;0 0;0 0" keyTimes="0;0.18;0.36;1" dur="1.6s" repeatCount="indefinite"/>',
    TAIL,
    BODY,
    PAW_LEFT,
    EARS,
    HEAD,
    // Happy eyes and a wide open grin.
    `<g fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"><path d="M75 79Q82 69 89 79"/><path d="M111 79Q118 69 125 79"/></g>`,
    `<path fill="${INK}" d="M89 100Q100 116 111 100Z"/>`,
    `<path fill="${BLUSH}" d="M94 105Q100 111 106 105Q100 103 94 105Z"/>`,
    // The wrench raised in triumph.
    '<g transform="translate(18 -24)">',
    WRENCH,
    PAW_RIGHT,
    '</g>',
    '</g>',
    twinkle(36, 50, 1.2, 0),
    twinkle(170, 40, 1.5, 0.45),
    twinkle(176, 120, 1, 0.9),
    twinkle(28, 128, 0.9, 0.7),
  ].join('')

/** A star going round the otter's head on a flat ellipse, `delay` seconds along. */
const orbit = (delay: number): string =>
  [
    '<g transform="translate(100 32)"><g>',
    `<animateMotion dur="1.8s" begin="-${delay}s" repeatCount="indefinite" path="M-44 0A44 11 0 1 0 44 0A44 11 0 1 0 -44 0"/>`,
    `<path fill="${STAR}" d="${STAR_PATH}"/>`,
    '</g></g>',
  ].join('')

const dizzy = (): string =>
  [
    '<g>',
    '<animateTransform attributeName="transform" type="rotate" values="0 100 190;-5 100 190;0 100 190;5 100 190;0 100 190" dur="1.8s" repeatCount="indefinite"/>',
    TAIL,
    BODY,
    PAW_LEFT,
    PAW_RIGHT,
    EARS,
    HEAD,
    // Crossed-out eyes and a wobbly mouth.
    `<g fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"><path d="M76 70L88 82M88 70L76 82"/><path d="M112 70L124 82M124 70L112 82"/></g>`,
    `<path fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" d="M88 105Q91 101 94 105T100 105T106 105T112 105"/>`,
    '</g>',
    // The dropped wrench, lying on the floor at its feet.
    `<g transform="translate(160 186) rotate(-120) translate(-128 -135)">${WRENCH}</g>`,
    orbit(0),
    orbit(0.6),
    orbit(1.2),
  ].join('')

const SCENES: Record<Mood, () => string> = {
  sleep: sleeping,
  think: thinking,
  read: reading,
  work: working,
  run: running,
  web: browsing,
  helpers: helping,
  compact: compacting,
  wait: waiting,
  done: finished,
  oops: dizzy,
}

const BOX = 'viewBox="0 0 200 200"'

/** The workbench's mascot, an otter with a wrench, animated for its mood. */
export function mascotSvg(mood: Mood = 'sleep', size = 30): string {
  const scene = (SCENES[mood] ?? sleeping)()

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ${BOX}>${scene}</svg>`
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

/** A small rounded square of one colour: a legend's key. */
export function swatchSvg(color: string, size = 10): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 10 10"><rect width="10" height="10" rx="2.6" fill="${color}"/></svg>`
}

/** The size a stack of `count` dots is drawn at. */
export const stackSize = (count: number): { width: number; height: number } => ({ width: 16 + Math.max(0, count - 1) * 10, height: 16 })

/** Dots overlapping as avatars do, the first on top, each ringed in the colour of what it sits on. */
export function stackSvg(colors: readonly string[], ring: string): string {
  const { width, height } = stackSize(colors.length)
  const dots = colors.map((color, at) => `<circle cx="${8 + at * 10}" cy="8" r="7" fill="${color}" stroke="${ring}" stroke-width="1.6"/>`)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${dots.reverse().join('')}</svg>`
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
