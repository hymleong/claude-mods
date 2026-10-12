import type { Color, RenderElement } from 'claude-code'

import type { Repo } from '../../types'
import type { Kit, Model } from './model'

// The pane's shared pieces: colours by meaning, glyphs, rules, headings,
// segmented strips and empty states. Colours are the theme's own keys, so
// the pane follows the person's light or dark theme with nothing to read.

export const C = {
  accent: 'suggestion',
  ok: 'success',
  bad: 'error',
  warn: 'warning',
  rule: 'subtle',
  dim: 'inactive',
  brand: 'claude',
  added: 'diffAdded',
  removed: 'diffRemoved',
} as const satisfies Record<string, Color>

export const G = {
  on: '●',
  off: '○',
  ok: '✓',
  fail: '✗',
  stop: '■',
  run: '▶',
  prompt: '❯',
  open: '▾',
  closed: '▸',
  up: '↑',
  down: '↓',
  back: '←',
  dot: '·',
  brand: '◆',
  warn: '⚠',
  link: '↗',
} as const

/** The repository the views are about: the only one, or the one picked in a folder of several. */
export const inView = (m: Pick<Model, 'repos' | 'repo'>): Repo | undefined =>
  m.repos.length === 1 ? m.repos[0] : m.repos.find(one => one.root === m.repo)

/** Room on a narrow pane is tight below this many cells. */
export const NARROW = 56

export const plural = (n: number, word: string, many = `${word}s`): string => `${n} ${n === 1 ? word : many}`

/** Text cut to `max` characters at its end, an ellipsis standing for the rest. */
export function fit(text: string, max: number): string {
  if (max <= 1) return text.slice(0, Math.max(0, max))

  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** Text cut to `max` at its start: the end of a path matters most. */
export function fitStart(text: string, max: number): string {
  if (max <= 1) return text.slice(-Math.max(0, max))

  return text.length > max ? `…${text.slice(text.length - max + 1)}` : text
}

export function rule(kit: Kit, m: Model): RenderElement {
  return (
    <kit.Text color={C.rule} wrap="truncate">
      {'─'.repeat(Math.max(1, m.width))}
    </kit.Text>
  )
}

export function space(kit: Kit): RenderElement {
  return <kit.Text> </kit.Text>
}

/** A section's heading: its name, a quiet count, and whatever it acts on at the far end. */
export function heading(kit: Kit, label: string, count?: number, right?: RenderElement | false): RenderElement {
  const { Box, Text } = kit

  return (
    <Box flexDirection="row" alignItems="center" columnGap={1}>
      <Text bold>{label}</Text>
      {count !== undefined && <Text dimColor>{count}</Text>}
      <Box flexGrow={1} />
      {right}
    </Box>
  )
}

/** What a view says when it has nothing to show: a mark, a line, and what to do about it. */
export function empty(kit: Kit, title: string, hint: string, mark: string = G.off): RenderElement {
  const { Box, Text } = kit

  return (
    <Box flexDirection="column" paddingY={1} rowGap={0}>
      <Box flexDirection="row" columnGap={1}>
        <Text dimColor>{mark}</Text>
        <Text>{title}</Text>
      </Box>
      {hint !== '' && <Text dimColor>{hint}</Text>}
    </Box>
  )
}

export type StripItem<T extends string> = { id: T; label: string; hotkey?: string; badge?: string; badgeColor?: Color }

/**
 * A segmented row of choices: the one in front as the surface's primary
 * button, the rest quiet. Pressing the one in front again is the way back
 * to its list.
 */
export function strip<T extends string>(
  kit: Kit,
  items: readonly StripItem<T>[],
  current: T,
  pick: (id: T) => void,
  prefix: string,
): RenderElement {
  const { Box, Text, Button } = kit

  return (
    <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={2}>
      {items.map(item => (
        <Box flexDirection="row" alignItems="center" flexShrink={0}>
          {item.id === current ? (
            <Button key={`${prefix}-${item.id}`} variant="primary" label={item.label} onPress={() => pick(item.id)} />
          ) : (
            <Button
              key={`${prefix}-${item.id}`}
              plain
              dimColor
              {...(item.hotkey === undefined ? {} : { hotkey: item.hotkey })}
              label={item.label}
              onPress={() => pick(item.id)}
            />
          )}
          {item.badge !== undefined && item.badge !== '' && (
            <Text {...(item.badgeColor === undefined ? { dimColor: true } : { color: item.badgeColor })}> {item.badge}</Text>
          )}
        </Box>
      ))}
    </Box>
  )
}

/** A quiet press: a secondary action at a row's end. */
export function small(kit: Kit, key: string, label: string, onPress: () => void, isPrimary = false): RenderElement {
  return isPrimary ? (
    <kit.Button key={key} variant="primary" label={label} onPress={onPress} />
  ) : (
    <kit.Button key={key} plain dimColor label={label} onPress={onPress} />
  )
}

/**
 * A press that asks first: the first press arms it (`confirm?`), the second
 * does it, anything else disarms it. Kept for what cannot be undone.
 */
export function guarded(
  kit: Kit,
  m: Model,
  key: string,
  label: string,
  confirm: string,
  ask: (key: string) => void,
  run: () => void,
  cancel: () => void,
): RenderElement {
  const { Box, Text, Button } = kit
  if (m.confirming !== key) return <Button key={key} plain dimColor label={label} onPress={() => ask(key)} />

  return (
    <Box flexDirection="row" columnGap={1}>
      <Text color={C.warn}>{confirm}</Text>
      <Button key={`${key}-yes`} variant="primary" label="Yes" onPress={run} />
      <Button key={`${key}-no`} plain dimColor label="No" onPress={cancel} />
    </Box>
  )
}

/** How long ago, briefly, from milliseconds. */
export function ago(now: number, at: number): string {
  if (at <= 0) return ''
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`

  return `${Math.floor(s / 3600)}h ago`
}

/** A duration, briefly. */
export function took(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`
  const s = ms / 1000
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`
  const m = Math.floor(s / 60)

  return `${m}m ${Math.round(s % 60)}s`
}
