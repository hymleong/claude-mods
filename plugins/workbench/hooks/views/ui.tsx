import type { Color, RenderElement } from 'claude-code'

import { GLYPH, glyphSvg, hex, letterTileSvg, mascotSvg, pillSize, pillSvg, tileSvg } from '../icons'
import type { Hue, IconName } from '../icons'
import type { Kit, Model } from './model'

// The pane's look, after Apple's: grouped cards on a quiet tint, small
// uppercase section headers, rows led by a coloured tile, capsule pills,
// and actions that carry a symbol. A cell grid (the terminal) draws no
// pictures and no rounded cards, so each piece there falls back to glyphs
// and colour.

type Look = Pick<Model, 'isGrid' | 'scheme'>

/** Whether this drawing can show pictures. */
const pictures = (kit: Kit, m: Look): boolean => kit.Svg !== undefined && !m.isGrid

// On a terminal the theme's own keys read best; elsewhere the system colours match the pictures.
const THEMED: Record<Hue, Color> = {
  blue: 'suggestion',
  green: 'success',
  red: 'error',
  orange: 'warning',
  yellow: 'warning',
  purple: 'merged',
  pink: 'error',
  teal: 'suggestion',
  indigo: 'permission',
  mint: 'success',
  brown: 'warning',
  gray: 'inactive',
  gray2: 'subtle',
  label: 'text',
}

/** A text colour for a hue: the theme's on a terminal, Apple's elsewhere. */
export const tone = (m: Look, hue: Hue): Color => (m.isGrid ? THEMED[hue] : hex(hue, m.scheme))

/** The tints the pane is built from: the open tab and its page, the cards on it, their edges. */
export const surface = (m: Pick<Model, 'scheme'>) =>
  m.scheme === 'light'
    ? { page: 'rgba(0,0,0,0.035)', fill: 'rgba(255,255,255,0.75)', edge: 'rgba(0,0,0,0.09)', picked: 'rgba(0,122,255,0.10)', rule: 'rgba(0,0,0,0.12)' }
    : // Opaque, measured over the desktop app's dark pane (#1A1A19): an outline the colour of its fill vanishes.
      { page: '#242423', fill: '#2D2D2C', edge: '#383837', picked: '#1F3248', rule: '#4A4A48' }

/** A symbol in a colour; a glyph on a terminal. */
export function icon(kit: Kit, m: Look, name: IconName, hue: Hue = 'gray', size = 15): RenderElement {
  if (pictures(kit, m) && kit.Svg !== undefined) {
    return <kit.Svg source={glyphSvg(name, hex(hue, m.scheme), size)} alt={name} width={size} height={size} />
  }

  return <kit.Text color={tone(m, hue)}>{GLYPH[name]}</kit.Text>
}

/** A white symbol on a rounded square of colour, as iOS Settings leads its rows. */
export function tile(kit: Kit, m: Look, name: IconName, hue: Hue, size = 22): RenderElement {
  if (pictures(kit, m) && kit.Svg !== undefined) {
    return <kit.Svg source={tileSvg(name, hex(hue, m.scheme), size)} alt={name} width={size} height={size} />
  }

  return <kit.Text color={tone(m, hue)}>{GLYPH[name]}</kit.Text>
}

/** The workbench's otter, or a diamond where pictures are not drawn. */
export function mascot(kit: Kit, m: Look, size = 30): RenderElement {
  if (pictures(kit, m) && kit.Svg !== undefined) {
    return <kit.Svg source={mascotSvg(size)} alt="Workbench" width={size} height={size} />
  }

  return <kit.Text color={tone(m, 'blue')}>{GLYPH.hammer}</kit.Text>
}

/** A rounded square with a letter: a changed file's status. */
export function letterTile(kit: Kit, m: Look, letter: string, hue: Hue, size = 18): RenderElement {
  if (pictures(kit, m) && kit.Svg !== undefined) {
    return <kit.Svg source={letterTileSvg(letter, hex(hue, m.scheme), size)} alt={`status ${letter}`} width={size} height={size} />
  }

  return <kit.Text color={tone(m, hue)}>{letter}</kit.Text>
}

/** A capsule with a short text, tinted by its meaning. */
export function pill(kit: Kit, m: Look, text: string, hue: Hue, withDot = false): RenderElement {
  if (pictures(kit, m) && kit.Svg !== undefined) {
    const size = pillSize(text, withDot)

    return <kit.Svg source={pillSvg(text, hex(hue, m.scheme), withDot)} alt={text} width={size.width} height={size.height} />
  }

  return <kit.Text color={tone(m, hue)}>{withDot ? `${GLYPH.dot} ${text}` : text}</kit.Text>
}

/** A small uppercase heading over a card, a count beside it, and what it acts on at the far end. */
export function section(kit: Kit, m: Look, title: string, count?: number | string, accessory?: RenderElement | false): RenderElement {
  const { Box, Text } = kit

  return (
    <Box flexDirection="row" alignItems="center" columnGap={1} marginTop={1} {...(m.isGrid ? {} : { paddingX: 1 })}>
      <Text dimColor bold>
        {title.toUpperCase()}
      </Text>
      {count !== undefined && count !== '' && <Text dimColor>{String(count)}</Text>}
      <Box flexGrow={1} />
      {accessory}
    </Box>
  )
}

/** A grouped card: rows on a quiet tint with rounded corners; on a terminal, the rows alone. */
export function card(
  kit: Kit,
  m: Look,
  children: (RenderElement | false | undefined | null)[],
  options: { isPicked?: boolean; gap?: number; dense?: boolean } = {},
): RenderElement {
  const { Box } = kit
  const shown = children.filter((one): one is RenderElement => one !== false && one !== undefined && one !== null)
  if (m.isGrid) return <Box flexDirection="column">{shown}</Box>
  const look = surface(m)

  return (
    <Box
      flexDirection="column"
      backgroundColor={options.isPicked === true ? look.picked : look.fill}
      borderStyle="round"
      borderColor={look.edge}
      paddingX={1}
      paddingY={options.dense === true ? 0.3 : 0}
      rowGap={options.dense === true ? 0 : (options.gap ?? 0.5)}
      marginTop={0.5}
    >
      {shown}
    </Box>
  )
}

export type RowSpec = {
  key: string
  lead?: RenderElement | false
  /** Text, or `Text` parts (a press can hold nothing else). */
  title: string | RenderElement | RenderElement[]
  /** The title's colour, by meaning. */
  hue?: Hue
  isBold?: boolean
  sub?: string | RenderElement | false
  trail?: (RenderElement | false | undefined)[]
  onPress?: () => void
  /** A disclosure chevron at the end: `right` for a row that opens, `down` for one that is open. */
  chevron?: 'right' | 'down'
  /** One line: the quiet text after the title rather than under it, no padding. */
  inline?: boolean
  /** How wide the lead is in pixels, so a press laid over it covers it. */
  leadPx?: number
}

/** A list row: a lead tile, a title that is the press, a quiet line under it, and accessories at the end. */
export function row(kit: Kit, m: Look, given: RowSpec): RenderElement {
  const { Box, Text, Button } = kit
  // The lead of a row that opens is pressable too.
  const spec: RowSpec =
    given.lead !== undefined && given.lead !== false && given.onPress !== undefined && pictures(kit, m)
      ? { ...given, lead: pressableIcon(kit, `${given.key}-icon`, given.lead, given.onPress, false, 0, given.leadPx ?? 16) }
      : given
  const title =
    typeof spec.title === 'string' ? (
      <Text bold={spec.isBold === true} {...(spec.hue === undefined ? {} : { color: tone(m, spec.hue) })} wrap="truncate-end">
        {spec.title}
      </Text>
    ) : Array.isArray(spec.title) && spec.onPress === undefined ? (
      <Box flexDirection="row">{spec.title}</Box>
    ) : (
      spec.title
    )

  if (spec.inline === true) {
    return (
      <Box flexDirection="row" alignItems="center" columnGap={1}>
        {spec.lead}
        <Box flexDirection="row" alignItems="center" columnGap={1} flexGrow={1} flexShrink={1} minWidth={0}>
          <Box flexShrink={0}>
            {spec.onPress === undefined ? (
              title
            ) : (
              <Button key={spec.key} plain onPress={spec.onPress}>
                {title}
              </Button>
            )}
          </Box>
          {spec.sub !== undefined && spec.sub !== false && spec.sub !== '' && (
            <Box flexShrink={1} minWidth={0}>
              {typeof spec.sub === 'string' ? (
                <Text dimColor wrap="truncate-end">
                  {spec.sub}
                </Text>
              ) : (
                spec.sub
              )}
            </Box>
          )}
        </Box>
        {(spec.trail ?? []).filter(Boolean)}
        {spec.chevron !== undefined && icon(kit, m, spec.chevron === 'down' ? 'chevronDown' : 'chevron', 'gray2', 11)}
      </Box>
    )
  }

  return (
    <Box flexDirection="row" alignItems="center" columnGap={1} paddingY={m.isGrid ? 0 : 0.25}>
      {spec.lead}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
        {spec.onPress === undefined ? (
          title
        ) : (
          <Button key={spec.key} plain onPress={spec.onPress}>
            {title}
          </Button>
        )}
        {spec.sub !== undefined && spec.sub !== false && spec.sub !== '' &&
          (typeof spec.sub === 'string' ? (
            <Text dimColor wrap="truncate-end">
              {spec.sub}
            </Text>
          ) : (
            spec.sub
          ))}
      </Box>
      {(spec.trail ?? []).filter(Boolean)}
      {spec.chevron !== undefined && icon(kit, m, spec.chevron === 'down' ? 'chevronDown' : 'chevron', 'gray2', 12)}
    </Box>
  )
}

/**
 * An action with its symbol: on a desktop the symbol beside a quiet button
 * (or the primary one), on a terminal the glyph inside the label.
 */
export function action(kit: Kit, m: Look, key: string, name: IconName, label: string, onPress: () => void, hue: Hue = 'blue', isPrimary = false): RenderElement {
  const { Button } = kit
  if (!pictures(kit, m)) {
    return isPrimary ? (
      <Button key={key} variant="primary" label={`${GLYPH[name]} ${label}`} onPress={onPress} />
    ) : (
      <Button key={key} plain dimColor label={`${GLYPH[name]} ${label}`} onPress={onPress} />
    )
  }
  if (isPrimary) return <Button key={key} variant="primary" label={label} onPress={onPress} />

  return pressableIcon(
    kit,
    `${key}-icon`,
    icon(kit, m, name, hue, 13),
    onPress,
    <Button key={key} plain onPress={onPress}>
      <kit.Text color={tone(m, hue)}>{label}</kit.Text>
    </Button>,
  )
}

/** A blank label about `px` wide: four no-break spaces cover a small symbol. */
const room = (px = 14): string => ' '.repeat(Math.max(2, Math.ceil(px / 3.5)))

/**
 * A symbol and its button, the symbol pressable too. A press can hold only
 * text and a symbol is a picture, so a blank press lies over the symbol and
 * does what the button does.
 */
export function pressableIcon(kit: Kit, key: string, symbol: RenderElement, onPress: () => void, button: RenderElement | false, gap = 0.5, px = 14): RenderElement {
  const { Box, Button } = kit

  return (
    <Box flexDirection="row" alignItems="center" columnGap={gap} flexShrink={0}>
      {symbol}
      {button}
      <Box position="absolute" left={0} top={0} bottom={0} flexDirection="row" alignItems="center">
        <Button key={key} plain label={room(px)} onPress={onPress} />
      </Box>
    </Box>
  )
}

/** A symbol alone as a quiet press: a row's accessory. */
export function iconPress(kit: Kit, m: Look, key: string, name: IconName, label: string, onPress: () => void, hue: Hue = 'gray'): RenderElement {
  const { Button } = kit
  if (!pictures(kit, m)) return <Button key={key} plain dimColor label={GLYPH[name]} onPress={onPress} />

  return pressableIcon(kit, `${key}-icon`, icon(kit, m, name, hue, 13), onPress, <Button key={key} plain dimColor label={label} onPress={onPress} />)
}

/** A row of actions that wraps when the pane is narrow. */
export function toolbar(kit: Kit, children: (RenderElement | false | undefined)[], marginTop = 0): RenderElement {
  return (
    <kit.Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={2} rowGap={0.5} marginTop={marginTop}>
      {children.filter((one): one is RenderElement => one !== false && one !== undefined)}
    </kit.Box>
  )
}

/** A view with nothing to show: a large tile, a title, and what to do about it. */
export function emptyState(kit: Kit, m: Look, name: IconName, hue: Hue, title: string, hint: string, actions: (RenderElement | false)[] = []): RenderElement {
  const { Box, Text } = kit

  return (
    <Box flexDirection="column" alignItems={m.isGrid ? 'flex-start' : 'center'} paddingY={1} rowGap={0.5}>
      {tile(kit, m, name, hue, 44)}
      <Text bold>{title}</Text>
      {hint !== '' && (
        <Box {...(m.isGrid ? {} : { paddingX: 4 })}>
          <Text dimColor wrap="wrap">
            {hint}
          </Text>
        </Box>
      )}
      {actions.length > 0 && toolbar(kit, actions, 0.5)}
    </Box>
  )
}

/** A label and its value on one line, as a detail sheet lists them. */
export function detail(kit: Kit, label: string, value: string | RenderElement): RenderElement {
  const { Box, Text } = kit

  return (
    <Box flexDirection="row" columnGap={1}>
      <Box width={12} flexShrink={0}>
        <Text dimColor>{label}</Text>
      </Box>
      <Box flexShrink={1} minWidth={0}>
        {typeof value === 'string' ? <Text wrap="wrap">{value}</Text> : value}
      </Box>
    </Box>
  )
}

/**
 * A segmented control: each choice a press, the picked one as the surface's
 * primary button, a symbol before each where pictures are drawn.
 */
export function segments<T extends string>(
  kit: Kit,
  m: Look,
  items: readonly { id: T; label: string; icon?: IconName; badge?: string; hotkey?: string }[],
  current: T,
  pick: (id: T) => void,
  prefix: string,
): RenderElement {
  const { Box, Button } = kit

  return (
    <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={m.isGrid ? 2 : 1.5} rowGap={0.5}>
      {items.map(item => {
        const isOn = item.id === current
        const label = item.badge === undefined || item.badge === '' ? item.label : `${item.label}  ${item.badge}`

        return (
          (() => {
            const button = isOn ? (
              <Button key={`${prefix}-${item.id}`} variant="primary" label={label} onPress={() => pick(item.id)} />
            ) : (
              <Button
                key={`${prefix}-${item.id}`}
                plain
                dimColor
                {...(m.isGrid && item.hotkey !== undefined ? { hotkey: item.hotkey } : {})}
                label={label}
                onPress={() => pick(item.id)}
              />
            )

            return item.icon !== undefined && pictures(kit, m) ? (
              pressableIcon(kit, `${prefix}-${item.id}-icon`, icon(kit, m, item.icon, isOn ? 'blue' : 'gray', 14), () => pick(item.id), button)
            ) : (
              <Box flexDirection="row" alignItems="center" flexShrink={0}>
                {button}
              </Box>
            )
          })()
        )
      })}
    </Box>
  )
}

/** A quiet press with a short label: a compact row's accessory (`+`, `−`, `@`). */
export function press(kit: Kit, key: string, label: string, onPress: () => void, color?: Color): RenderElement {
  return color === undefined ? (
    <kit.Button key={key} plain dimColor label={label} onPress={onPress} />
  ) : (
    <kit.Button key={key} plain onPress={onPress}>
      <kit.Text color={color}>{label}</kit.Text>
    </kit.Button>
  )
}

export type TabSpec<T extends string> = { id: T; label: string; icon: IconName; badge?: string; badgeHue?: Hue }

/**
 * Tabs drawn as a browser draws them: the open one shares the tint of the
 * page under it, so the two read as one sheet; the closed ones sit on the
 * pane's own ground, a thin rule between neighbours. A press opens a tab.
 */
export function browserTabs<T extends string>(kit: Kit, m: Look, items: readonly TabSpec<T>[], current: T, pick: (id: T) => void, prefix: string): RenderElement {
  const { Box, Text, Button } = kit
  const look = surface(m)

  return (
    <Box flexDirection="row" alignItems="flex-end">
      {items.map((item, at) => {
        const isOn = item.id === current
        const isAfterOn = items[at - 1]?.id === current

        return (
          <Box flexDirection="row" alignItems="center">
            {at > 0 && !isOn && !isAfterOn && <Text color={look.rule}>│</Text>}
            <Box
              flexDirection="row"
              alignItems="center"
              columnGap={0.5}
              paddingX={1.5}
              paddingTop={0.35}
              paddingBottom={0.35}
              {...(isOn ? { backgroundColor: look.page, ...(m.scheme === 'dark' ? { borderStyle: 'round', borderColor: look.page } : {}) } : {})}
            >
              {pressableIcon(
                kit,
                `${prefix}-${item.id}-icon`,
                icon(kit, m, item.icon, isOn ? 'blue' : 'gray', 14),
                () => pick(item.id),
                <Button key={`${prefix}-${item.id}`} plain dimColor={!isOn} label={item.label} onPress={() => pick(item.id)} />,
              )}
              {item.badge !== undefined && item.badge !== '' && (
                <Text color={item.badgeHue === undefined ? undefined : tone(m, item.badgeHue)} dimColor={item.badgeHue === undefined}>
                  {item.badge}
                </Text>
              )}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

/** The sheet under the open tab: the same tint, so tab and page are one. */
export function tabPage(kit: Kit, m: Look, children: (RenderElement | false | undefined)[]): RenderElement {
  const look = surface(m)

  return (
    <kit.Box
      flexDirection="column"
      backgroundColor={look.page}
      {...(m.scheme === 'dark' ? { borderStyle: 'round', borderColor: look.page } : {})}
      paddingX={1}
      paddingTop={0.5}
      paddingBottom={1}
      flexGrow={1}
    >
      {children.filter((one): one is RenderElement => one !== false && one !== undefined)}
    </kit.Box>
  )
}
