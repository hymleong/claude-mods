import type { Color, RenderElement } from 'claude-code'

import type { Activity, Phase, Source, Spend, Worker } from '../../types'
import { SPENDS, cells, effortName, elapsed, modelName, totals } from '../activity'
import { glyphSvg, hex, stackSize, stackSvg, swatchSvg } from '../icons'
import type { Hue, IconName } from '../icons'
import { rel } from '../paths'
import { C, G, fit, fitStart, plural, took } from './chrome'
import type { Actions, Kit, Model } from './model'
import { icon, pill, surface, tone } from './ui'

// The card beside the mascot: how long the latest turn took, a bar of what
// the time went on, the models at work on it, and what they looked at. A
// cell grid gets the same in a few lines of coloured text.

type Look = Pick<Model, 'isGrid' | 'scheme'>

const pictures = (kit: Kit, m: Look): boolean => kit.Svg !== undefined && !m.isGrid

const SPEND_LOOK: Record<Spend, { label: string; hue: Hue }> = {
  search: { label: 'Search', hue: 'purple' },
  read: { label: 'Read', hue: 'green' },
  run: { label: 'Run', hue: 'orange' },
  write: { label: 'Write', hue: 'blue' },
  agents: { label: 'Agents', hue: 'pink' },
  other: { label: 'Tools', hue: 'teal' },
  wait: { label: 'Waiting', hue: 'yellow' },
  think: { label: 'Thinking', hue: 'gray2' },
}

/** The kinds every turn's legend names; the rest only once the turn spent time on them. */
const ALWAYS: readonly Spend[] = ['search', 'read', 'run', 'write', 'think']

const SOURCE_LOOK: Record<Source['kind'], { icon: IconName; hue: Hue }> = {
  file: { icon: 'doc', hue: 'green' },
  search: { icon: 'search', hue: 'purple' },
  web: { icon: 'globe', hue: 'teal' },
  edit: { icon: 'pencil', hue: 'blue' },
}

/** What a row says its loop is doing, in the legend's own words. */
const DOING: Record<Phase, string> = {
  search: 'Searching',
  read: 'Reading',
  run: 'Running',
  write: 'Writing',
  agents: 'Delegating',
  other: 'Using tools',
  wait: 'Waiting for you',
  think: 'Thinking',
  done: 'Done',
  stopped: 'Stopped',
}

/** Claude's own colour, for the main loop's mark. */
const CLAUDE = '#D97757'
const BAR = 0.3

/** A duration as the card shows it: tenths of a second under ten seconds. */
const secs = (ms: number): string => (ms < 10_000 ? `${(Math.max(0, ms) / 1000).toFixed(1)}s` : took(ms))

/** The colour a kind of work is drawn in; thinking is the bar's own track. */
const paint = (m: Look, spend: Spend): string => (spend === 'think' ? surface(m).rule : hex(SPEND_LOOK[spend].hue, m.scheme))

const headline = (a: Activity): string => (a.outcome === 'running' ? 'Working for' : a.outcome === 'done' ? 'Worked for' : 'Stopped after')

/**
 * What a worker is doing as its row says it, for how long, and whether it is
 * at it now. The main loop's is what the turn's time goes on, so its row and
 * the bar always agree; a subagent's is its own.
 */
function phase(a: Activity, w: Worker, now: number): { label: string; ms: number; isLive: boolean } {
  if (w.id === '') {
    if (a.outcome === 'running') return { label: DOING[a.now], ms: now - (a.since ?? a.at), isLive: true }

    return { label: DOING[a.outcome === 'done' ? 'done' : 'stopped'], ms: elapsed(a, now), isLive: false }
  }
  const isLive = w.endedAt === 0
  // A record kept before phases were named so says nothing this table knows.
  const label = DOING[w.doing] ?? 'Working'

  return { label, ms: isLive ? now - w.since : w.endedAt - w.startedAt, isLive }
}

const nameOf = (w: Worker): string => (w.model === '' ? 'Claude' : modelName(w.model))

/**
 * The card's own sheet: the pane's card tint with room inside, the
 * sections spaced evenly. Set apart from `card` in `ui.tsx`, whose lists
 * sit tight against their edges.
 */
function sheet(kit: Kit, m: Model, children: (RenderElement | false | undefined)[]): RenderElement {
  const look = surface(m)

  return (
    <kit.Box
      flexDirection="column"
      backgroundColor={look.fill}
      borderStyle="round"
      borderColor={look.edge}
      paddingX={1.5}
      paddingY={1.2}
      rowGap={1}
      marginTop={0.8}
    >
      {children.filter((one): one is RenderElement => one !== false && one !== undefined)}
    </kit.Box>
  )
}

/** The card beside the mascot, for the latest turn. */
export function activityCard(kit: Kit, m: Model, act: Actions): RenderElement {
  if (!pictures(kit, m)) return lines(kit, m)
  const { Box, Text } = kit
  const a = m.activity
  if (a === null) {
    return sheet(kit, m, [
      <Box flexDirection="column" rowGap={0.8}>
        <Text bold>Ready when you are</Text>
        {bar(kit, m, undefined)}
      </Box>,
      <Text dimColor wrap="wrap">
        Each turn's time, models and sources show here.
      </Text>,
    ])
  }
  const spent = totals(a, m.now)
  const helpers = a.workers.slice(1)
  const shown = helpers.slice(-3)

  return sheet(kit, m, [
    <Box flexDirection="column" rowGap={0.8}>
      <Box flexDirection="row" alignItems="center" columnGap={0.6}>
        <Text dimColor>{headline(a)}</Text>
        <Text bold>{secs(elapsed(a, m.now))}</Text>
        <Box flexGrow={1} />
        <Text dimColor>{plural(a.steps, 'step')}</Text>
      </Box>
      {bar(kit, m, spent)}
      {legend(kit, m, spent)}
    </Box>,
    divider(kit, m),
    <Box flexDirection="column" rowGap={0.6}>
      {[...a.workers.slice(0, 1), ...shown].map(w => workerRow(kit, m, a, w))}
      {helpers.length > shown.length && <Text dimColor>{`+${plural(helpers.length - shown.length, 'more helper')}`}</Text>}
    </Box>,
    divider(kit, m),
    <Box flexDirection="column" rowGap={0.8}>
      {footer(kit, m, a, act)}
      {m.activityOpen && sourceList(kit, m, a)}
    </Box>,
  ])
}

/**
 * The turn's time as one slim track, a rounded segment for each kind of
 * work, thinking last in the track's own grey; an empty track before any.
 */
function bar(kit: Kit, m: Model, spent: Record<Spend, number> | undefined): RenderElement {
  const { Box } = kit
  const sum = spent === undefined ? 0 : SPENDS.reduce((all, one) => all + spent[one], 0)
  // A sliver under a hundredth of the bar would be its rounded ends alone.
  const parts = spent === undefined || sum <= 0 ? [] : SPENDS.filter(one => spent[one] / sum >= 0.01)
  // Each segment grows by its share of a thousand: the engine takes no growth past 10,000, and a turn's milliseconds pass that.
  const share = (ms: number): number => Math.max(1, Math.round((ms / sum) * 1000))
  // A border rounds the ends; the desktop pads a bordered box unless told not to.
  const segment = (color: string, grow: number): RenderElement => (
    <Box flexGrow={grow} height={BAR} padding={0} backgroundColor={color} borderStyle="round" borderColor={color} />
  )

  return (
    <Box flexDirection="row" columnGap={0.3}>
      {parts.length === 0 ? segment(surface(m).rule, 1) : parts.map(one => segment(paint(m, one), share(spent?.[one] ?? 0)))}
    </Box>
  )
}

/** Each kind's time beside its colour, two to a row, the times flush with each column's end. */
function legend(kit: Kit, m: Model, spent: Record<Spend, number>): RenderElement {
  const { Box, Text, Svg } = kit
  const named = SPENDS.filter(one => ALWAYS.includes(one) || spent[one] >= 50)

  return (
    <Box flexDirection="row" flexWrap="wrap" rowGap={0.5}>
      {named.map((one, at) => (
        <Box width="50%" flexDirection="row" alignItems="center" columnGap={0.8} {...(at % 2 === 0 ? { paddingRight: 3 } : { paddingLeft: 1 })}>
          {Svg !== undefined && <Svg source={swatchSvg(paint(m, one), 9)} alt={SPEND_LOOK[one].label} width={9} height={9} />}
          <Box flexShrink={1} minWidth={0}>
            <Text dimColor wrap="truncate-end">
              {SPEND_LOOK[one].label}
            </Text>
          </Box>
          <Box flexGrow={1} />
          <Box flexShrink={0}>
            <Text wrap="truncate-end">{secs(spent[one])}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  )
}

/** A hairline between the card's sections. */
function divider(kit: Kit, m: Model): RenderElement {
  return <kit.Box height={0.05} backgroundColor={surface(m).rule} />
}

/** A model at work: its mark, name and effort, a subagent's type and task, and what it is doing. */
function workerRow(kit: Kit, m: Model, a: Activity, w: Worker): RenderElement {
  const { Box, Text, Svg } = kit
  const { label, ms, isLive } = phase(a, w, m.now)
  const effort = effortName(w.effort)
  const about = [w.type, w.task].filter(part => part !== '').join(` ${G.dot} `)

  // The desktop refuses a picture without words for it, so each says what it stands for.
  return (
    <Box flexDirection="row" alignItems="center" columnGap={0.8}>
      {Svg !== undefined && (
        <Svg
          source={glyphSvg(w.id === '' ? 'sparkle' : 'cube', w.id === '' ? CLAUDE : hex('purple', m.scheme), 14)}
          alt={w.id === '' ? 'Claude' : 'Helper'}
          width={14}
          height={14}
        />
      )}
      <Box flexShrink={0}>
        <Text bold wrap="truncate-end">
          {nameOf(w)}
        </Text>
      </Box>
      {effort !== '' && pill(kit, m, effort, 'blue')}
      {about !== '' && (
        <Box flexShrink={1} minWidth={0}>
          <Text dimColor wrap="truncate-end">
            {about}
          </Text>
        </Box>
      )}
      <Box flexGrow={1} />
      {isLive && icon(kit, m, 'dot', 'green', 9)}
      <Box flexShrink={0} flexDirection="row" columnGap={0.6}>
        <Text dimColor wrap="truncate-end">
          {label}
        </Text>
        <Text wrap="truncate-end">{secs(ms)}</Text>
      </Box>
    </Box>
  )
}

/** How many things were looked at and written, as stacked dots, and the way to the list. */
function footer(kit: Kit, m: Model, a: Activity, act: Actions): RenderElement {
  const { Box, Text, Button, Svg } = kit
  const looked = a.sources.filter(one => one.kind !== 'edit').length
  const edited = a.sources.length - looked
  const kinds = [...new Set(a.sources.map(one => one.kind))].slice(0, 3)
  const ring = m.scheme === 'light' ? '#FFFFFF' : surface(m).fill
  const size = stackSize(kinds.length)

  return (
    <Box flexDirection="row" alignItems="center" columnGap={0.8}>
      {Svg !== undefined && kinds.length > 0 && (
        <Svg source={stackSvg(kinds.map(kind => hex(SOURCE_LOOK[kind].hue, m.scheme)), ring)} alt="Sources" width={size.width} height={size.height} />
      )}
      <Box flexShrink={1} minWidth={0} flexDirection="row" columnGap={0.8}>
        <Text wrap="truncate-end">{looked === 0 ? 'No sources yet' : plural(looked, 'source')}</Text>
        {edited > 0 && <Text dimColor wrap="truncate-end">{`${G.dot} ${edited} edited`}</Text>}
      </Box>
      <Box flexGrow={1} />
      {a.sources.length > 0 && (
        <Box flexShrink={0}>
          <Button key="activity-details" plain dimColor label={m.activityOpen ? 'Hide' : 'Details ›'} onPress={() => act.toggleActivity()} />
        </Box>
      )}
    </Box>
  )
}

/** A file as a path from the workspace, anything else as it was asked. */
function sourceLabel(m: Model, one: Source, max: number): string {
  if (one.kind === 'file' || one.kind === 'edit') return fitStart(m.workspace === '' ? one.label : rel(one.label, m.workspace), max)

  return fit(one.label, max)
}

/** What the turn looked at and wrote, the latest first. */
function sourceList(kit: Kit, m: Model, a: Activity): RenderElement {
  const { Box, Text } = kit
  const shown = a.sources.slice(0, 12)
  const max = Math.max(16, m.width - 24)

  return (
    <Box flexDirection="column" rowGap={0.4}>
      {shown.map(one => (
        <Box flexDirection="row" alignItems="center" columnGap={0.8}>
          {icon(kit, m, SOURCE_LOOK[one.kind].icon, SOURCE_LOOK[one.kind].hue, 12)}
          <Box flexShrink={1} minWidth={0}>
            <Text dimColor wrap="truncate-end">
              {sourceLabel(m, one, max)}
            </Text>
          </Box>
        </Box>
      ))}
      {a.sources.length > shown.length && <Text dimColor>{`+${a.sources.length - shown.length} more`}</Text>}
    </Box>
  )
}

/** On a cell grid: the headline, the bar in coloured blocks, the legend and who is at work. */
function lines(kit: Kit, m: Model): RenderElement {
  const { Box, Text } = kit
  const a = m.activity
  if (a === null) return <Text dimColor>Ready: Claude's next turn shows here</Text>
  const spent = totals(a, m.now)
  const width = Math.max(10, Math.min(48, m.width - 4))
  const sizes = cells(
    SPENDS.map(one => spent[one]),
    width,
  )
  const colour = (one: Spend): Color => (one === 'think' ? C.rule : tone(m, SPEND_LOOK[one].hue))
  const named = SPENDS.filter(one => spent[one] >= 50)
  const [main] = a.workers
  const looked = a.sources.filter(one => one.kind !== 'edit').length
  const now = main === undefined ? undefined : phase(a, main, m.now)
  const busy = a.workers.slice(1).filter(one => one.endedAt === 0).length

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" columnGap={1}>
        <Text bold>{`${headline(a)} ${secs(elapsed(a, m.now))}`}</Text>
        <Text dimColor>{`${G.dot} ${plural(a.steps, 'step')} ${G.dot} ${plural(looked, 'source')}`}</Text>
      </Box>
      <Box flexDirection="row">
        {SPENDS.map((one, at) => (sizes[at] ?? 0) > 0 && <Text color={colour(one)}>{(one === 'think' ? '░' : '█').repeat(sizes[at] ?? 0)}</Text>)}
        {sizes.every(size => size === 0) && <Text color={C.rule}>{'░'.repeat(width)}</Text>}
      </Box>
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        {named.map(one => (
          <Box flexDirection="row" columnGap={1}>
            <Text color={colour(one)}>{SPEND_LOOK[one].label}</Text>
            <Text>{secs(spent[one])}</Text>
          </Box>
        ))}
      </Box>
      {main !== undefined && now !== undefined && (
        <Box flexDirection="row" columnGap={1}>
          <Text bold>{nameOf(main)}</Text>
          {main.effort !== '' && <Text color={tone(m, 'blue')}>{effortName(main.effort).toLowerCase()}</Text>}
          <Text dimColor>{G.dot}</Text>
          <Text {...(now.isLive ? { color: tone(m, 'green') } : { dimColor: true })}>{`${now.label} ${secs(now.ms)}`}</Text>
          {busy > 0 && <Text color={tone(m, 'purple')}>{`+${plural(busy, 'helper')}`}</Text>}
        </Box>
      )}
    </Box>
  )
}
