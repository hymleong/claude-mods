import type { RenderElement } from 'claude-code'

import type { OpenCommit } from '../../types'
import { GRAPH_ROW, graphRowSvg, graphWidth, statusHue } from '../icons'
import { base, dir } from '../paths'
import { layoutGraph } from '../git'
import { G, fit, fitStart, inView, plural } from './chrome'
import type { Actions, Kit, Model } from './model'
import { action, card, emptyState, row, section, surface, tile, tone, toolbar } from './ui'

const MAX_ROWS = 150

/** The commit graph, every branch, the newest first; on a surface that sets type, a dot for each commit. */
export function historyList(kit: Kit, m: Model, act: Actions): RenderElement {
  const { Box, Text, Button, Svg } = kit
  const repo = inView(m)
  if (repo === undefined) return emptyState(kit, m, 'clock', 'indigo', 'Pick a repository', 'Choose one under Changes to see its history.')
  const history = m.history
  if (history === null || history.root !== repo.root) {
    return (
      <Box marginTop={1} {...(m.isGrid ? {} : { paddingX: 1 })}>
        <Text dimColor>Reading the history…</Text>
      </Box>
    )
  }
  if (history.rows.length === 0) return emptyState(kit, m, 'clock', 'indigo', 'No commits yet', 'The first commit shows up here.')
  const refsOf = (refs: string): string[] =>
    refs
      .split(', ')
      .filter(ref => ref !== '')
      .map(ref => ref.replace(/^HEAD -> /, ''))
      .filter(ref => !ref.endsWith('/HEAD'))

  if (m.isGrid) {
    // In a grid of cells the graph lines up: draw it.
    const rows = history.rows.slice(0, MAX_ROWS)
    const graphRoom = Math.max(...rows.map(one => one.graph.length), 0)

    return (
      <Box flexDirection="column" marginTop={1}>
        {rows.map(one => {
          if (one.sha === '') return <Text color={tone(m, 'blue')}>{one.graph}</Text>
          const refs = refsOf(one.refs)

          return (
            <Box flexDirection="row" alignItems="center" columnGap={1}>
              <Text color={tone(m, 'blue')}>{one.graph.padEnd(graphRoom)}</Text>
              <Button key={`commit-${one.sha}`} plain onPress={() => act.openCommit(repo.root, one.sha)}>
                <Text dimColor>{`${one.sha} `}</Text>
                {fit(one.subject, Math.max(10, m.width - graphRoom - 22))}
              </Button>
              {refs.length > 0 && <Text color={tone(m, 'green')}>{fit(refs.join(' '), 14)}</Text>}
              <Box flexGrow={1} />
              <Text dimColor>{fit(one.when.replace(/ ago$/, ''), 12)}</Text>
            </Box>
          )
        })}
      </Box>
    )
  }
  // Everywhere else the graph is drawn from the commits' parents: each row a strip as tall as a line of text, so the strips join.
  const rows = history.rows.filter(one => one.sha !== '').slice(0, MAX_ROWS)
  const graph = layoutGraph(rows.map(one => ({ sha: one.sha, parents: one.parents ?? [] })))
  const look = surface(m)

  return (
    <Box flexDirection="column">
      {section(kit, m, 'Commits', history.rows.filter(one => one.sha !== '').length)}
      <Box flexDirection="column" backgroundColor={look.fill} borderStyle="round" borderColor={look.edge} paddingX={1} paddingY={0.4} marginTop={0.5}>
        {rows.map((one, at) => {
          const cell = graph.rows[at]
          const strip =
            Svg === undefined || cell === undefined ? (
              false
            ) : (
              <Svg
                source={graphRowSvg(cell, graph.lanes, m.scheme, (one.parents ?? []).length > 1)}
                alt={`commit ${one.sha}`}
                width={graphWidth(graph.lanes)}
                height={GRAPH_ROW}
              />
            )
          const refs = refsOf(one.refs)
          const isHead = one.refs.includes('HEAD')

          return (
            <Box flexDirection="row" alignItems="center" columnGap={1} height={1} overflow="hidden">
              {strip}
              {refs.slice(0, 3).map(ref => (
                <Text color={tone(m, ref.includes('/') ? 'teal' : 'green')} bold={isHead && !ref.includes('/')}>
                  {fit(ref, 22)}
                </Text>
              ))}
              <Box flexShrink={1} minWidth={0} flexGrow={1}>
                <Button key={`commit-${one.sha}`} plain onPress={() => act.openCommit(repo.root, one.sha)}>
                  <Text bold={isHead} wrap="truncate-end">
                    {one.subject}
                  </Text>
                </Button>
              </Box>
              <Text dimColor>{shortWhen(one.when)}</Text>
            </Box>
          )
        })}
      </Box>
      {history.rows.length > MAX_ROWS && (
        <Box paddingX={1}>
          <Text dimColor>{`${G.dot} older commits not shown`}</Text>
        </Box>
      )}
    </Box>
  )
}

/** `3 hours ago` as `3h`, `2 weeks ago` as `2w`. */
function shortWhen(when: string): string {
  const match = /^(\d+)\s+(second|minute|hour|day|week|month|year)s?/.exec(when)
  if (match === null) return when.replace(/ ago$/, '')
  const unit = { second: 's', minute: 'm', hour: 'h', day: 'd', week: 'w', month: 'mo', year: 'y' }[match[2] as 'second'] ?? ''

  return `${match[1]}${unit}`
}

/** One commit: its message, who and when, the files it touched, and a file's diff. */
export function commitView(kit: Kit, m: Model, commit: OpenCommit, act: Actions): RenderElement {
  const { Box, Text, Code } = kit
  const diff = commit.diff

  return (
    <Box flexDirection="column">
      {card(kit, m, [
        row(kit, m, {
          key: 'commit-head',
          lead: tile(kit, m, diff === null ? 'clock' : 'doc', 'indigo', 26),
          title: diff === null ? commit.subject : base(diff.path),
          isBold: true,
          sub: diff === null ? `${commit.sha.slice(0, 10)} · ${commit.author} · ${commit.when}` : `${dir(diff.path) === '' ? '' : `${dir(diff.path)} · `}in ${commit.sha.slice(0, 7)}`,
        }),
        diff === null && commit.body !== '' && <Text wrap="wrap">{commit.body}</Text>,
        toolbar(kit, [
          diff === null
            ? action(kit, m, 'commit-back', 'back', 'History', () => act.closeCommit(), 'blue')
            : action(kit, m, 'commit-back', 'back', 'Files', () => act.openCommitFile(''), 'blue'),
        ]),
      ])}
      {diff === null && section(kit, m, 'Files', plural(commit.files.length, 'file'))}
      {diff === null &&
        card(
          kit,
          m,
          commit.files.slice(0, 200).map(file =>
            row(kit, m, {
              key: `cfile-${file.path}`,
              lead: <Text bold color={tone(m, statusHue(file.status))}>{file.status}</Text>,
              title: base(file.path),
              sub: dir(file.path) === '' ? false : fitStart(dir(file.path), Math.max(12, m.width - 14)),
              inline: true,
              onPress: () => act.openCommitFile(file.path),
            }),
          ),
          { dense: true },
        )}
      {diff !== null && (
        <Box flexDirection="column" marginTop={0.5}>
          {diff.text === '' ? card(kit, m, [<Text dimColor>No line changes to show.</Text>]) : <Code source={diff.text} format="diff" path={diff.path} />}
          {diff.shown < diff.total && (
            <Box marginTop={0.5} {...(m.isGrid ? {} : { paddingX: 1 })}>
              {action(kit, m, 'cdiff-more', 'chevronDown', `Show ${diff.total - diff.shown} More Lines`, () => act.moreDiff(), 'blue')}
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}
