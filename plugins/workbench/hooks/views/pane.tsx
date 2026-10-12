import type { RenderElement } from 'claude-code'

import type { Tab } from '../../types'
import type { IconName } from '../icons'
import { base } from '../paths'
import { G, NARROW, fit, rule } from './chrome'
import { fileView } from './files'
import { gitTab } from './git'
import type { Actions, Kit, Model } from './model'
import { portsTab } from './ports'
import { termTab } from './terminals'
import { browserTabs, icon, mascot, pill, segments, tabPage, tone } from './ui'

export const TABS: readonly { id: Tab; label: string; hotkey: string; icon: IconName }[] = [
  { id: 'git', label: 'Git', hotkey: '1', icon: 'branch' },
  { id: 'term', label: 'Terminals', hotkey: '2', icon: 'terminal' },
  { id: 'ports', label: 'Ports', hotkey: '3', icon: 'ports' },
]

/** The pane: header, the three views, and on a cell grid the keys at its foot. */
export function pane(kit: Kit, m: Model, act: Actions): RenderElement {
  const { Box } = kit
  const frame = {
    flexDirection: 'column' as const,
    paddingX: 1,
    ...(m.isGrid && m.rows > 0 ? { minHeight: m.rows } : {}),
    ...(m.isGrid ? {} : { paddingTop: 0.5, paddingBottom: 1 }),
  }
  // A file being edited has the pane to itself; `done` gives the rest back.
  if (m.tab === 'git' && m.gitSection === 'files' && m.file !== null && m.file.isEditing) {
    return <Box {...frame}>{fileView(kit, m, m.file, act)}</Box>
  }

  const body = [m.tab === 'git' && gitTab(kit, m, act), m.tab === 'term' && termTab(kit, m, act), m.tab === 'ports' && portsTab(kit, m, act)]
  if (m.isGrid) {
    return (
      <Box {...frame}>
        {header(kit, m)}
        <Box marginTop={1}>{tabs(kit, m, act)}</Box>
        {rule(kit, m)}
        {body}
        <Box flexGrow={1} minHeight={1} />
        {footer(kit, m, act)}
      </Box>
    )
  }

  // As a browser: the tabs, and under them the open tab's page, one sheet with it.
  return (
    <Box {...frame}>
      {header(kit, m)}
      <Box flexDirection="column" marginTop={1}>
        {tabs(kit, m, act)}
        {tabPage(kit, m, body)}
      </Box>
    </Box>
  )
}

/** The repository in view, or the session's folder when there is none. */
function place(m: Model): { name: string; branch: string; ahead: number; behind: number } {
  const repo = m.repos.length === 1 ? m.repos[0] : m.repos.find(one => one.root === m.repo)
  if (repo === undefined) return { name: base(m.workspace), branch: '', ahead: 0, behind: 0 }

  return { name: repo.name, branch: repo.branch, ahead: repo.ahead, behind: repo.behind }
}

/** The app's name with its icon, where it is, and what is live, as a window's title area. */
export function header(kit: Kit, m: Model): RenderElement {
  const { Box, Text } = kit
  const at = place(m)
  const room = Math.max(8, m.width - 40)

  return (
    <Box flexDirection="row" alignItems="center" columnGap={1}>
      {mascot(kit, m, 32)}
      <Box flexDirection="column" flexShrink={1} minWidth={0}>
        <Text bold>Workbench</Text>
        <Box flexDirection="row" alignItems="center" columnGap={1}>
          {at.name !== '' && m.width >= NARROW && <Text dimColor>{fit(at.name, Math.max(12, room - at.branch.length))}</Text>}
          {at.branch !== '' && icon(kit, m, 'branch', 'gray', 12)}
          {at.branch !== '' && <Text color={tone(m, 'blue')}>{fit(at.branch, Math.floor(room / 2))}</Text>}
          {at.ahead > 0 && <Text color={tone(m, 'orange')}>{`${G.up}${at.ahead}`}</Text>}
          {at.behind > 0 && <Text color={tone(m, 'orange')}>{`${G.down}${at.behind}`}</Text>}
        </Box>
      </Box>
      <Box flexGrow={1} />
      {m.counts.running > 0 && pill(kit, m, `${m.counts.running} running`, 'green', true)}
      {m.counts.ports > 0 && pill(kit, m, `${m.counts.ports} port${m.counts.ports === 1 ? '' : 's'}`, 'blue', true)}
    </Box>
  )
}

function badge(id: Tab, m: Model): string {
  if (id === 'git') return m.counts.changed > 0 ? String(m.counts.changed) : ''
  if (id === 'term') return m.terms.length > 0 ? String(m.terms.length) : ''

  return m.counts.ports > 0 ? String(m.counts.ports) : ''
}

function tabs(kit: Kit, m: Model, act: Actions): RenderElement {
  if (!m.isGrid) {
    return browserTabs(
      kit,
      m,
      TABS.map(one => ({
        id: one.id,
        label: one.label,
        icon: one.icon,
        badge: badge(one.id, m),
        ...(one.id === 'term' && m.counts.running > 0 ? { badgeHue: 'green' as const } : {}),
      })),
      m.tab,
      act.setTab,
      'tab',
    )
  }

  return segments(
    kit,
    m,
    TABS.map(one => ({ id: one.id, label: one.label, icon: one.icon, hotkey: one.hotkey, badge: badge(one.id, m) })),
    m.tab,
    act.setTab,
    'tab',
  )
}

/** A cell grid's last line: the views by number, and how to leave. */
function footer(kit: Kit, m: Model, act: Actions): RenderElement {
  const { Box, Text, Button } = kit
  const hint = m.isFocused ? 'esc back to prompt' : 'click or ctrl+x tab to focus'

  return (
    <Box flexDirection="column" flexShrink={0}>
      {rule(kit, m)}
      <Box flexDirection="row" columnGap={2}>
        {TABS.map(one => (
          <Button key={`key-${one.id}`} plain dimColor hotkey={one.hotkey} label={one.label.toLowerCase()} onPress={() => act.setTab(one.id)} />
        ))}
        <Box flexGrow={1} />
        {m.width >= 50 + hint.length && <Text dimColor>{hint}</Text>}
      </Box>
    </Box>
  )
}

/**
 * The row above the prompt, for a pane that is on but has nowhere to sit:
 * what changed, what runs, what listens, and the way to the pane.
 */
export function band(kit: Kit, m: Model, act: Actions): RenderElement | undefined {
  const { Box, Text, Button } = kit
  const at = place(m)
  const parts: RenderElement[] = []
  if (at.branch !== '') {
    parts.push(
      <Box flexDirection="row" alignItems="center" columnGap={1}>
        {icon(kit, m, 'branch', 'blue', 12)}
        <Text color={tone(m, 'blue')}>{fit(at.branch, 24)}</Text>
        {m.counts.changed > 0 && <Text dimColor>{`${m.counts.changed} changed`}</Text>}
      </Box>,
    )
  }
  if (m.counts.running > 0) parts.push(pill(kit, m, `${m.counts.running} running`, 'green', true))
  const live = m.ports.rows.filter(row => row.kind === 'dev').slice(0, 4)
  if (live.length > 0) parts.push(pill(kit, m, live.map(row => `:${row.port}`).join(' '), 'blue', true))
  if (parts.length === 0) return undefined

  return (
    <Box flexDirection="row" alignItems="center" columnGap={1}>
      {mascot(kit, m, 18)}
      {parts.map((part, at) => (
        <Box flexDirection="row" alignItems="center" columnGap={1}>
          {at > 0 && <Text dimColor>{G.dot}</Text>}
          {part}
        </Box>
      ))}
      <Box flexGrow={1} />
      <Button key="band-open" plain dimColor label="Open Workbench" onPress={() => act.openPane()} />
    </Box>
  )
}
