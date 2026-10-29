import type { RenderElement } from 'claude-code'

import type { Branches, Diff, GitFile, GitSection, Repo, Touched } from '../../types'
import { COMMIT_PROMPT, isChanged, isStaged, letterOf } from '../git'
import { statusHue } from '../icons'
import type { Hue, IconName } from '../icons'
import { base, dir, join, short } from '../paths'
import { findTouched } from '../touched'
import { G, ago, fit, fitStart, inView, plural } from './chrome'
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

/** What Claude wrote of a repository's changed files. */
const byClaude = (m: Model, repo: Repo, file: GitFile): Touched | undefined => findTouched(m.touched, join(repo.root, file.path))

function fileRow(kit: Kit, m: Model, repo: Repo, file: GitFile, staged: boolean, act: Actions): RenderElement {
  const { Text } = kit
  const letter = letterOf(file, staged)
  const folder = dir(file.path)
  const side = staged ? 's' : 'w'
  const name = base(file.path)
  const claude = byClaude(m, repo, file)

  return row(kit, m, {
    key: `${side}:${repo.root}:${file.path}`,
    lead: (
      <Text bold color={tone(m, statusHue(letter))}>
        {letter}
      </Text>
    ),
    title: fit(name, Math.max(12, m.width - 24)),
    sub: folder === '' ? false : fitStart(folder, Math.max(8, m.width - name.length - 20)),
    inline: true,
    trail: [
      claude !== undefined && icon(kit, m, 'sparkle', claude.isAsLeft ? 'purple' : 'gray', 12),
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
        <kit.Button key="branch-menu" plain onPress={() => act.toggleMenu('branches')}>
          <Text bold>{`${fit(repo.branch, 30)} ${m.menu === 'branches' ? G.down : '⌄'}`}</Text>
        </kit.Button>
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

/** The branches to switch to, latest first, a field for a new one, and the repository's other worktrees. */
function branchMenu(kit: Kit, m: Model, repo: Repo, act: Actions): RenderElement {
  const { Box, Text, Input } = kit
  const held: Branches | null = m.branches !== null && m.branches.root === repo.root ? m.branches : null
  const isBusy = m.busy !== ''
  const others = held?.worktrees.filter(one => !one.isCurrent) ?? []
  const dirty = repo.files.filter(one => one.index !== '?').length

  return (
    <Box flexDirection="column">
      {section(kit, m, 'Switch branch', held === null ? undefined : held.items.length, press(kit, 'branch-menu-close', 'close', () => act.toggleMenu('branches')))}
      {card(
        kit,
        m,
        [
          Input !== undefined && (
            <Box paddingY={m.isGrid ? 0 : 0.25}>
              <Input key={`new-branch-${repo.root}`} placeholder={`New branch from ${fit(repo.branch, 24)}`} submitLabel="create" onSubmit={text => act.createBranch(repo.root, text)} />
            </Box>
          ),
          dirty > 0 && <Text dimColor wrap="wrap">{`${dirty} uncommitted change${dirty === 1 ? '' : 's'} come along, unless they clash with the branch: then git says so and nothing moves.`}</Text>,
          held === null && <Text dimColor>Reading the branches…</Text>,
          ...(held?.items ?? []).slice(0, 30).map(one => {
            const track = [one.ahead > 0 ? `${G.up}${one.ahead}` : '', one.behind > 0 ? `${G.down}${one.behind}` : ''].filter(Boolean).join(' ')
            const sub = [one.when, track, one.isRemote ? 'remote' : ''].filter(part => part !== '').join(` ${G.dot} `)

            return row(kit, m, {
              key: `branch:${one.isRemote ? 'r' : 'l'}:${one.name}`,
              lead: icon(kit, m, one.isCurrent ? 'check' : one.isRemote ? 'globe' : 'branch', one.isCurrent ? 'green' : one.isRemote ? 'gray' : 'blue', 13),
              title: fit(one.name, Math.max(12, m.width - 26)),
              isBold: one.isCurrent,
              sub,
              inline: true,
              ...(one.isCurrent || isBusy ? {} : { onPress: () => act.switchBranch(repo.root, one.name, one.isRemote) }),
            })
          }),
          held !== null && held.items.length > 30 && <Text dimColor>{`+${held.items.length - 30} older`}</Text>,
        ],
        { dense: true },
      )}
      {others.length > 0 && section(kit, m, 'Worktrees', others.length)}
      {others.length > 0 &&
        card(
          kit,
          m,
          others.map(one =>
            row(kit, m, {
              key: `worktree:${one.path}`,
              lead: icon(kit, m, 'folder', 'teal', 13),
              title: one.branch === '' ? base(one.path) : one.branch,
              sub: short(one.path, m.home, Math.max(16, m.width - 30)),
              inline: true,
              trail: [press(kit, `worktree-term:${one.path}`, 'terminal', () => act.openWorktree(one.path), tone(m, 'blue'))],
            }),
          ),
          { dense: true },
        )}
    </Box>
  )
}

/** Claude's share of the changes: how many, the way to see only those, and the way to put them all back. */
function claudeStrip(kit: Kit, m: Model, repo: Repo, act: Actions): RenderElement | false {
  const { Box, Text } = kit
  const mine = repo.files.map(file => byClaude(m, repo, file)).filter((one): one is Touched => one !== undefined)
  if (mine.length === 0) return false
  const undoable = mine.filter(one => one.canUndo)
  const isAsking = m.confirming === `undo-all:${repo.root}`
  const edited = undoable.filter(one => !one.isAsLeft).length

  return card(
    kit,
    m,
    [
      <Box flexDirection="row" alignItems="center" columnGap={1}>
        {icon(kit, m, 'sparkle', 'purple', 13)}
        <Text color={tone(m, 'purple')}>{`Claude changed ${mine.length} of these`}</Text>
        <Box flexGrow={1} />
        {press(kit, 'claude-only', m.claudeOnly ? 'show all' : "only Claude's", () => act.setClaudeOnly(!m.claudeOnly), tone(m, 'blue'))}
        {undoable.length > 0 && !isAsking && press(kit, 'claude-undo-all', 'undo all', () => act.ask(`undo-all:${repo.root}`), tone(m, 'red'))}
      </Box>,
      isAsking && (
        <Box flexDirection="row" alignItems="center" columnGap={1} flexWrap="wrap">
          {icon(kit, m, 'warning', 'red', 13)}
          <Text color={tone(m, 'red')} wrap="wrap">
            {`Put ${undoable.length} file${undoable.length === 1 ? '' : 's'} back as before Claude's first edit?${edited > 0 ? ` ${edited} also changed since; that goes too.` : ''}`}
          </Text>
          <kit.Button key="claude-undo-all-yes" variant="primary" label="Undo" onPress={() => act.undoClaude(undoable.map(one => one.path))} />
          <kit.Button key="claude-undo-all-no" plain dimColor label="Cancel" onPress={() => act.cancel()} />
        </Box>
      ),
    ],
    { dense: true },
  )
}

function repoView(kit: Kit, m: Model, repo: Repo, act: Actions): RenderElement {
  const { Box, Text, Input } = kit
  // With nothing of Claude's left in the changes, the filter has nothing to keep: everything shows.
  const isOnly = m.claudeOnly && repo.files.some(file => byClaude(m, repo, file) !== undefined)
  const isShown = (file: GitFile): boolean => !isOnly || byClaude(m, repo, file) !== undefined
  const staged = repo.files.filter(isStaged).filter(isShown)
  const changed = repo.files.filter(isChanged).filter(isShown)

  return (
    <Box flexDirection="column">
      {branchCard(kit, m, repo, act)}
      {m.menu === 'branches' && branchMenu(kit, m, repo, act)}
      {claudeStrip(kit, m, repo, act)}
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

/** Under a diff of a file Claude wrote: how often, whether it is as Claude left it, and the way back. */
function claudeNote(kit: Kit, m: Model, claude: Touched, act: Actions): RenderElement {
  const { Box, Text } = kit
  const isAsking = m.confirming === `undo:${claude.path}`
  const says = [
    `Claude ${claude.isNew ? 'made this file' : `edited this ${claude.edits === 1 ? 'once' : `${claude.edits} times`}`} ${ago(m.now, claude.at)}`,
    claude.isAsLeft ? '' : 'changed since',
  ].filter(Boolean)

  return (
    <Box flexDirection="column" rowGap={0.25}>
      <Box flexDirection="row" alignItems="center" columnGap={1}>
        {icon(kit, m, 'sparkle', 'purple', 13)}
        <Text color={tone(m, 'purple')}>{says.join(` ${G.dot} `)}</Text>
        <Box flexGrow={1} />
        {claude.canUndo && !isAsking && press(kit, 'diff-undo-claude', claude.isNew ? 'delete it' : "undo Claude's edits", () => act.ask(`undo:${claude.path}`), tone(m, 'red'))}
        {!claude.canUndo && <Text dimColor>too large to undo here</Text>}
      </Box>
      {isAsking && (
        <Box flexDirection="row" alignItems="center" columnGap={1} flexWrap="wrap">
          {icon(kit, m, 'warning', 'red', 13)}
          <Text color={tone(m, 'red')} wrap="wrap">
            {claude.isNew
              ? `Delete ${base(claude.path)}? Claude made it this session.`
              : `Put ${base(claude.path)} back as it was before Claude's first edit?${claude.isAsLeft ? '' : ' Changes made since go too.'}`}
          </Text>
          <kit.Button key="diff-undo-claude-yes" variant="primary" label={claude.isNew ? 'Delete' : 'Undo'} onPress={() => act.undoClaude([claude.path])} />
          <kit.Button key="diff-undo-claude-no" plain dimColor label="Cancel" onPress={() => act.cancel()} />
        </Box>
      )}
    </Box>
  )
}

function diffView(kit: Kit, m: Model, diff: Diff, act: Actions): RenderElement {
  const { Box, Text, Code } = kit
  const file = m.repos.find(one => one.root === diff.root)?.files.find(one => one.path === diff.path)
  const letter = file === undefined ? 'M' : letterOf(file, diff.isStaged)
  const claude = findTouched(m.touched, join(diff.root, diff.path))

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
        claude !== undefined && claudeNote(kit, m, claude, act),
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
