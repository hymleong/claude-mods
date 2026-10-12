import type { RenderElement } from 'claude-code'

import type { Diff, GitFile, GitSection, Repo } from '../../types'
import { COMMIT_PROMPT, isChanged, isStaged, letterOf } from '../git'
import { statusHue } from '../icons'
import type { Hue, IconName } from '../icons'
import { base, dir } from '../paths'
import { G, fit, fitStart, inView, plural } from './chrome'
import { browser, fileView } from './files'
import { pullsList, runView, runsList } from './github'
import { commitView, historyList } from './history'
import type { Actions, Kit, Model } from './model'
import { action, card, emptyState, icon, letterTile, pill, press, row, section, segments, tile, tone, toolbar } from './ui'

const SECTIONS: readonly { id: GitSection; label: string; hotkey: string; icon: IconName }[] = [
  { id: 'changes', label: 'Changes', hotkey: 'c', icon: 'list' },
  { id: 'files', label: 'Files', hotkey: 'f', icon: 'folder' },
  { id: 'history', label: 'History', hotkey: 'h', icon: 'clock' },
  { id: 'pulls', label: 'PRs', hotkey: 'r', icon: 'pull' },
  { id: 'actions', label: 'Actions', hotkey: 'a', icon: 'playCircle' },
]

export function gitTab(kit: Kit, m: Model, act: Actions): RenderElement {
  const { Box } = kit
  if (m.gitSection === 'changes' && m.diff !== null) return diffView(kit, m, m.diff, act)
  if (m.gitSection === 'files' && m.file !== null) return fileView(kit, m, m.file, act)
  if (m.gitSection === 'history' && m.commit !== null) return commitView(kit, m, m.commit, act)
  const open = m.run === null ? undefined : m.runs?.items.find(one => one.id === m.run?.id)
  if (m.gitSection === 'actions' && open !== undefined && m.run !== null && m.runs !== null) return runView(kit, m, m.runs, open, m.run, act)

  return (
    <Box flexDirection="column">
      <Box {...(m.isGrid ? {} : { paddingX: 1 })}>{segments(kit, m, SECTIONS, m.gitSection, act.setGitSection, 'git')}</Box>
      {m.gitSection === 'changes' && changes(kit, m, act)}
      {m.gitSection === 'files' && browser(kit, m, act)}
      {m.gitSection === 'history' && historyList(kit, m, act)}
      {m.gitSection === 'pulls' && pullsList(kit, m, act)}
      {m.gitSection === 'actions' && runsList(kit, m, act)}
    </Box>
  )
}

function changes(kit: Kit, m: Model, act: Actions): RenderElement {
  if (m.repos.length === 0) {
    return emptyState(kit, m, 'branch', 'orange', 'No Git repository here', 'Open Claude Code in a repository, or in a folder that holds some.')
  }
  const repo = inView(m)

  return repo === undefined ? board(kit, m, act) : repoView(kit, m, repo, act)
}

/** A folder of repositories: each one's branch and how much has changed in it. */
function board(kit: Kit, m: Model, act: Actions): RenderElement {
  const { Box } = kit

  return (
    <Box flexDirection="column">
      {section(kit, m, 'Repositories', m.repos.length)}
      {card(
        kit,
        m,
        m.repos.map(repo =>
          row(kit, m, {
            key: `repo-${repo.root}`,
            lead: tile(kit, m, 'branch', repo.files.length > 0 ? 'orange' : 'blue', 24),
            leadPx: 24,
            title: repo.name,
            isBold: true,
            sub: `${repo.branch}${repo.ahead > 0 ? `  ${G.up}${repo.ahead}` : ''}${repo.behind > 0 ? `  ${G.down}${repo.behind}` : ''}`,
            trail: [repo.files.length > 0 ? pill(kit, m, `${repo.files.length} changed`, 'orange') : pill(kit, m, 'Clean', 'green')],
            onPress: () => act.openRepo(repo.root),
            chevron: 'right',
          }),
        ),
      )}
    </Box>
  )
}

function fileRow(kit: Kit, m: Model, repo: Repo, file: GitFile, staged: boolean, act: Actions): RenderElement {
  const { Text } = kit
  const letter = letterOf(file, staged)
  const folder = dir(file.path)
  const side = staged ? 's' : 'w'
  const name = base(file.path)

  return row(kit, m, {
    key: `${side}:${repo.root}:${file.path}`,
    lead: (
      <Text bold color={tone(m, statusHue(letter))}>
        {letter}
      </Text>
    ),
    title: fit(name, Math.max(12, m.width - 20)),
    sub: folder === '' ? false : fitStart(folder, Math.max(8, m.width - name.length - 16)),
    inline: true,
    trail: [
      press(kit, `at:${side}:${file.path}`, '@', () => act.mention(`${repo.root}/${file.path}`)),
      staged
        ? press(kit, `mv:${side}:${file.path}`, '−', () => act.stage(repo.root, [file.path], false), tone(m, 'orange'))
        : press(kit, `mv:${side}:${file.path}`, '+', () => act.stage(repo.root, [file.path], true), tone(m, 'green')),
    ],
    onPress: () => act.openDiff(repo.root, file.path, staged),
  })
}

/** The branch, how it stands against its upstream, its pull request, and the ways to sync it: two lines. */
function branchCard(kit: Kit, m: Model, repo: Repo, act: Actions): RenderElement {
  const { Box, Text } = kit
  const isBusy = m.busy !== ''
  const held = m.branchPull
  const pull = held !== null && held.root === repo.root && held.branch === repo.branch ? held.pull : null
  const checks: Record<string, { hue: Hue; text: string }> = {
    pass: { hue: 'green', text: 'checks passed' },
    fail: { hue: 'red', text: 'checks failed' },
    pending: { hue: 'orange', text: 'checks running' },
  }
  const check = pull === null ? undefined : checks[pull.checks]
  const standing = repo.isDetached
    ? 'detached HEAD'
    : repo.upstream === ''
      ? 'not published yet'
      : repo.ahead === 0 && repo.behind === 0
        ? 'up to date'
        : [repo.ahead > 0 ? `${repo.ahead} to push` : '', repo.behind > 0 ? `${repo.behind} to pull` : ''].filter(Boolean).join(', ')

  return card(
    kit,
    m,
    [
      <Box flexDirection="row" alignItems="center" columnGap={1}>
        {m.repos.length > 1 && press(kit, 'repo-back', G.back, () => act.closeRepo())}
        {icon(kit, m, 'branch', 'blue', 13)}
        <Text bold>{fit(repo.branch, 30)}</Text>
        <Box flexGrow={1} />
        {repo.upstream !== '' && <Text dimColor>{fit(repo.upstream, 28)}</Text>}
      </Box>,
      <Box flexDirection="row" alignItems="center" columnGap={1}>
        <Text color={repo.ahead > 0 || repo.behind > 0 ? tone(m, 'orange') : undefined} dimColor={repo.ahead === 0 && repo.behind === 0}>
          {standing}
        </Text>
        <Box flexGrow={1} />
        {isBusy && <Text color={tone(m, 'orange')}>{`${m.busy}…`}</Text>}
        {!isBusy && press(kit, 'sync-fetch', 'fetch', () => act.sync(repo.root, 'fetch'))}
        {!isBusy && repo.behind > 0 && press(kit, 'sync-pull', `pull ${G.down}${repo.behind}`, () => act.sync(repo.root, 'pull'), tone(m, 'blue'))}
        {!isBusy &&
          (repo.ahead > 0 || (repo.upstream === '' && !repo.isDetached)) &&
          press(kit, 'sync-push', repo.ahead > 0 ? `push ${G.up}${repo.ahead}` : 'publish', () => act.sync(repo.root, 'push'), tone(m, 'blue'))}
      </Box>,
      pull !== null &&
        row(kit, m, {
          key: 'branch-pull',
          lead: icon(kit, m, 'pull', pull.isDraft ? 'gray' : 'green', 13),
          title: `#${pull.number} ${fit(pull.title, Math.max(10, m.width - 30))}`,
          inline: true,
          trail: [check !== undefined && <Text color={tone(m, check.hue)}>{check.text}</Text>],
          onPress: () => act.openUrl(pull.url),
        }),
    ],
    { dense: true },
  )
}

function repoView(kit: Kit, m: Model, repo: Repo, act: Actions): RenderElement {
  const { Box, Text, Input } = kit
  const staged = repo.files.filter(isStaged)
  const changed = repo.files.filter(isChanged)

  return (
    <Box flexDirection="column">
      {branchCard(kit, m, repo, act)}
      {repo.files.length === 0 && emptyState(kit, m, 'checkCircle', 'green', 'Working tree clean', 'Nothing to commit.')}
      {staged.length > 0 && section(kit, m, 'Staged', staged.length, press(kit, 'unstage-all', '− unstage all', () => act.stage(repo.root, 'all', false)))}
      {staged.length > 0 && card(kit, m, staged.slice(0, 200).map(file => fileRow(kit, m, repo, file, true, act)), { dense: true })}
      {staged.length > 0 &&
        card(kit, m, [
          Input !== undefined ? (
            <Box paddingY={m.isGrid ? 0 : 0.25}>
              <Input
                key={`commit-${repo.root}`}
                placeholder={`Commit message for ${plural(staged.length, 'file')}`}
                submitLabel="commit"
                onSubmit={text => act.commit(repo.root, text)}
              />
            </Box>
          ) : (
            <Text dimColor>Commit from a surface with a text field.</Text>
          ),
          toolbar(kit, [action(kit, m, 'commit-draft', 'sparkle', 'Ask Claude for a message', () => act.draft(COMMIT_PROMPT), 'purple')]),
        ], { dense: true })}
      {changed.length > 0 && section(kit, m, 'Changes', changed.length, press(kit, 'stage-all', '+ stage all', () => act.stage(repo.root, 'all', true)))}
      {changed.length > 0 && card(kit, m, changed.slice(0, 200).map(file => fileRow(kit, m, repo, file, false, act)), { dense: true })}
      {changed.length > 200 && (
        <Box {...(m.isGrid ? {} : { paddingX: 1 })}>
          <Text dimColor>{`+${changed.length - 200} more`}</Text>
        </Box>
      )}
    </Box>
  )
}

function diffView(kit: Kit, m: Model, diff: Diff, act: Actions): RenderElement {
  const { Box, Text, Code } = kit
  const file = m.repos.find(one => one.root === diff.root)?.files.find(one => one.path === diff.path)
  const letter = file === undefined ? 'M' : letterOf(file, diff.isStaged)

  return (
    <Box flexDirection="column">
      {card(kit, m, [
        row(kit, m, {
          key: 'diff-head',
          lead: letterTile(kit, m, letter, statusHue(letter), 22),
          title: base(diff.path),
          isBold: true,
          sub: `${dir(diff.path) === '' ? '' : `${dir(diff.path)} · `}${diff.isStaged ? 'Staged' : 'Unstaged'}`,
          trail: [],
        }),
        toolbar(kit, [
          action(kit, m, 'diff-back', 'back', 'Changes', () => act.closeDiff(), 'blue'),
          file !== undefined &&
            (diff.isStaged
              ? action(kit, m, 'diff-move', 'up', 'Unstage', () => act.stage(diff.root, [diff.path], false), 'orange')
              : action(kit, m, 'diff-move', 'plus', 'Stage', () => act.stage(diff.root, [diff.path], true), 'green')),
          action(kit, m, 'diff-at', 'at', 'Mention', () => act.mention(`${diff.root}/${diff.path}`), 'gray'),
        ]),
      ])}
      <Box flexDirection="column" marginTop={0.5}>
        {diff.isBinary && card(kit, m, [<Text dimColor>A binary file: no text to compare.</Text>])}
        {!diff.isBinary && diff.text === '' && card(kit, m, [<Text dimColor>No line changes to show.</Text>])}
        {!diff.isBinary && diff.text !== '' && <Code source={diff.text} format="diff" path={diff.path} />}
      </Box>
      {diff.shown < diff.total && (
        <Box marginTop={0.5} {...(m.isGrid ? {} : { paddingX: 1 })}>
          {action(kit, m, 'diff-more', 'chevronDown', `Show ${diff.total - diff.shown} More Lines`, () => act.moreDiff(), 'blue')}
        </Box>
      )}
    </Box>
  )
}
