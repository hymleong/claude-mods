import type { RenderElement } from 'claude-code'

import type { GonePort, PortRow } from '../../types'
import { hex, portLook, sparklineSvg } from '../icons'
import type { Hue } from '../icons'
import { age, shown } from '../ports'
import { G, ago, fit } from './chrome'
import type { Actions, Kit, Model } from './model'
import { action, card, detail, emptyState, icon, pill, press, row, section, segments, tile, tone, toolbar } from './ui'

/** A probe's verdict: answered, answered with an error, did not answer, or speaks no HTTP. */
function health(row: PortRow): { hue: Hue; text: string } | undefined {
  if (row.probe === null) return row.kind === 'dev' ? { hue: 'gray', text: 'TCP' } : undefined
  if (row.probe.status === 0) return { hue: 'orange', text: 'No answer' }
  const hue: Hue = row.probe.status >= 500 ? 'red' : row.probe.status >= 400 ? 'orange' : 'green'

  return { hue, text: `${row.probe.status} · ${row.probe.ms}ms` }
}

export function portsTab(kit: Kit, m: Model, act: Actions): RenderElement {
  const { Box, Text } = kit
  const rows = shown(m.ports.rows, m.portFilter)
  const dev = m.ports.rows.filter(one => one.kind === 'dev').length

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" alignItems="center" columnGap={1} {...(m.isGrid ? {} : { paddingX: 1 })}>
        {segments(
          kit,
          m,
          [
            { id: 'dev' as const, label: 'Dev Servers', icon: 'bolt' as const, badge: String(dev), hotkey: 'd' },
            { id: 'all' as const, label: 'All', icon: 'list' as const, badge: String(m.ports.rows.length), hotkey: 'a' },
          ],
          m.portFilter,
          act.setPortFilter,
          'ports',
        )}
        <Box flexGrow={1} />
        {m.ports.at > 0 && <Text dimColor>{`Updated ${ago(m.now, m.ports.at)}`}</Text>}
        {action(kit, m, 'ports-rescan', 'restart', 'Refresh', () => act.rescan(), 'gray')}
      </Box>
      {m.ports.note !== '' && (
        <Box {...(m.isGrid ? {} : { paddingX: 1 })}>
          <Text color={tone(m, 'orange')}>{m.ports.note}</Text>
        </Box>
      )}
      {m.ports.at === 0 && m.ports.note === '' && (
        <Box marginTop={1} {...(m.isGrid ? {} : { paddingX: 1 })}>
          <Text dimColor>Looking at what listens on this machine…</Text>
        </Box>
      )}
      {m.ports.at > 0 && rows.length === 0 && m.gone.length === 0 &&
        emptyState(
          kit,
          m,
          'ports',
          'blue',
          m.portFilter === 'dev' ? 'No dev servers running' : 'Nothing is listening',
          m.portFilter === 'dev' ? 'Start one from Terminals, or see All for everything that listens.' : '',
        )}
      {rows.length > 0 && <Box flexDirection="column">{card(kit, m, rows.map(one => portRow(kit, m, one, act)), { gap: 0.25 })}</Box>}
      {m.gone.length > 0 && section(kit, m, 'Recently stopped', m.gone.length)}
      {m.gone.length > 0 && card(kit, m, m.gone.map(one => goneRow(kit, m, one, act)), { gap: 0.25 })}
    </Box>
  )
}

/** A dev server that went away: when, what started it, and the ways to start it again or ask why. */
function goneRow(kit: Kit, m: Model, one: GonePort, act: Actions): RenderElement {
  const { Box, Text } = kit
  const look = portLook(one.name, one.framework, 'dev')
  const term = one.termId === '' ? undefined : m.terms.find(t => t.id === one.termId)
  const sub = [`stopped ${ago(m.now, one.at)}`, one.cmd !== '' ? one.cmd : '', term !== undefined ? `in ${term.title}` : ''].filter(part => part !== '')

  return (
    <Box flexDirection="column">
      {row(kit, m, {
        key: `gone-${one.key}`,
        lead: tile(kit, m, look.icon, 'gray', 26),
        leadPx: 26,
        title: [<Text bold dimColor>{`:${one.port}  `}</Text>, <Text dimColor>{one.framework !== '' ? one.framework : one.name}</Text>],
        sub: fit(sub.join(` ${G.dot} `), Math.max(16, m.width - 26)),
        trail: [press(kit, `gone-x-${one.key}`, '×', () => act.dismissGone(one.key))],
      })}
      {toolbar(
        kit,
        [
          one.cmd !== '' && action(kit, m, `gone-restart-${one.key}`, 'restart', 'Start Again', () => act.restartGone(one.key), 'green'),
          action(kit, m, `gone-why-${one.key}`, 'sparkle', 'Ask Claude Why', () => act.explainGone(one.key), 'purple'),
        ],
        0.25,
      )}
    </Box>
  )
}

function portRow(kit: Kit, m: Model, one: PortRow, act: Actions): RenderElement {
  const { Box, Text } = kit
  const isOpen = m.portOpen === one.key
  const verdict = health(one)
  const look = portLook(one.name, one.framework, one.kind)
  const term = one.termId === '' ? undefined : m.terms.find(t => t.id === one.termId)
  const subParts = [
    one.name,
    one.probe?.title ? `“${one.probe.title}”` : '',
    term !== undefined ? `in ${term.title}` : '',
    age(m.now, one.startedAt) === '' ? '' : `up ${age(m.now, one.startedAt)}`,
  ].filter(part => part !== '')
  // A press holds text alone: the port and what serves it as two parts of one line.
  const title = [
    <Text bold color={one.kind === 'system' ? undefined : tone(m, 'blue')}>{`:${one.port}  `}</Text>,
    <Text bold={one.kind === 'dev'}>{one.framework !== '' ? one.framework : one.name}</Text>,
  ]

  return (
    <Box flexDirection="column">
      {row(kit, m, {
        key: `port-${one.key}`,
        lead: tile(kit, m, look.icon, look.hue, 26),
        leadPx: 26,
        title,
        sub: fit(subParts.join(` ${G.dot} `), Math.max(16, m.width - 26)),
        trail: [
          one.isExposed && one.kind !== 'system' && icon(kit, m, 'warning', 'orange', 14),
          verdict !== undefined && pill(kit, m, verdict.text, verdict.hue),
        ],
        onPress: () => act.openPort(one.key),
        chevron: isOpen ? 'down' : 'right',
      })}
      {isOpen && details(kit, m, one, act)}
    </Box>
  )
}

function details(kit: Kit, m: Model, one: PortRow, act: Actions): RenderElement {
  const { Box, Text, Svg } = kit
  const term = one.termId === '' ? undefined : m.terms.find(t => t.id === one.termId)
  const canKill = one.kind !== 'system' && one.pid > 4
  const uptime = age(m.now, one.startedAt)
  const isKilling = m.confirming === `kill-${one.key}`

  return (
    <Box flexDirection="column" rowGap={0.25} marginTop={0.5} marginBottom={0.5} {...(m.isGrid ? { paddingLeft: 2 } : { paddingLeft: 4 })}>
      {detail(kit, 'Process', `${one.name} (pid ${one.pid})`)}
      {uptime !== '' && detail(kit, 'Running for', uptime)}
      {one.memMb > 0 && detail(kit, 'Memory', `${one.memMb} MB`)}
      {detail(
        kit,
        'Listening on',
        <Box flexDirection="row" alignItems="center" columnGap={1}>
          {icon(kit, m, one.isExposed ? 'warning' : 'lock', one.isExposed ? 'orange' : 'green', 12)}
          <Text wrap="wrap">{`${one.addresses.join(', ')}${one.isExposed ? ' · reachable from your network' : ' · this machine only'}`}</Text>
        </Box>,
      )}
      {one.probe !== null && one.probe.server !== '' && detail(kit, 'Server', one.probe.server)}
      {one.cmd !== '' && detail(kit, 'Command', <Text dimColor wrap="wrap">{one.cmd}</Text>)}
      {Svg !== undefined && !m.isGrid && one.history.length > 2 &&
        detail(
          kit,
          'Response',
          <Svg source={sparklineSvg(one.history, hex('green', m.scheme), 180, 26)} alt={`Response times: ${one.history.join(', ')} ms`} width={180} height={26} />,
        )}
      {toolbar(
        kit,
        [
          one.kind !== 'system' && action(kit, m, `browse-${one.key}`, 'external', 'Open in Browser', () => act.browse(one.key), 'blue'),
          <Box flexDirection="row" alignItems="center" columnGap={0.5}>
            {!m.isGrid && Svg !== undefined && icon(kit, m, 'copy', 'blue', 13)}
            <kit.Button key={`copyurl-${one.key}`} plain onPress={press => act.copyUrl(one.key, press.surface)}>
              <Text color={tone(m, 'blue')}>{m.isGrid ? `${G.dot} Copy URL` : 'Copy URL'}</Text>
            </kit.Button>
          </Box>,
          term !== undefined && action(kit, m, `goterm-${one.key}`, 'terminal', `Show ${fit(term.title, 14)}`, () => act.pickTerm(term.id), 'blue'),
          one.kind === 'dev' && action(kit, m, `ask-${one.key}`, 'sparkle', 'Ask Claude', () => act.askPort(one.key), 'purple'),
          canKill && !isKilling && action(kit, m, `kill-${one.key}`, 'xCircle', 'Stop Process', () => act.ask(`kill-${one.key}`), 'red'),
        ],
        0.5,
      )}
      {canKill && isKilling && (
        <Box flexDirection="row" alignItems="center" columnGap={1} marginTop={0.5}>
          {icon(kit, m, 'warning', 'red', 14)}
          <Text color={tone(m, 'red')}>{`End ${one.name} (pid ${one.pid}) and what it started?`}</Text>
          <kit.Button key={`kill-${one.key}-yes`} variant="primary" label="Stop" onPress={() => act.killPort(one.key)} />
          <kit.Button key={`kill-${one.key}-no`} plain dimColor label="Cancel" onPress={() => act.cancel()} />
        </Box>
      )}
    </Box>
  )
}
