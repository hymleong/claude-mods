import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Entry, FileChange, GitSnapshot, Listing, Tab, Viewer } from '../types'
import { firstLines, githubRepo, isStaged, isUnstaged, isUntracked, mark, parseStatus } from './git'
import { failure, runLook, toPull, toRuns } from './github'

// A side pane for the repository Claude is working in: Git review, a file
// browser and the branch's GitHub pull request and Actions runs. Everything
// goes through git (already on the machine) and GitHub's REST API: there is
// no daemon and no other program to install.

type $ = EngineInterface

const PANE = 'workbench'
const MAX_LINES = 3000
const MAX_ENTRIES = 500
const MAX_FILE_BYTES = 1_000_000

const EMPTY_GIT: GitSnapshot = {
  isRepo: false,
  root: '',
  branch: '',
  upstream: '',
  ahead: 0,
  behind: 0,
  files: [],
  commits: [],
  remote: '',
}

const tab = atom({ plugin: 'workbench', key: 'tab' } as const, 'git' as Tab)
const git = atom({ plugin: 'workbench', key: 'git' } as const, EMPTY_GIT)
const viewer = atom({ plugin: 'workbench', key: 'viewer' } as const, null as Viewer | null)
const listing = atom({ plugin: 'workbench', key: 'listing' } as const, { root: '', dir: '', entries: [] } as Listing)
const github = atom({ plugin: 'workbench', key: 'github' } as const, null)
const note = atom({ plugin: 'workbench', key: 'note' } as const, '')
const busy = atom({ plugin: 'workbench', key: 'busy' } as const, '')
const commitSeq = atom({ plugin: 'workbench', key: 'commitSeq' } as const, 0)

const TABS: { id: Tab; label: string; hotkey: string }[] = [
  { id: 'git', label: 'Git', hotkey: '1' },
  { id: 'files', label: 'Files', hotkey: '2' },
  { id: 'github', label: 'GitHub', hotkey: '3' },
]

const clip = (s: string, n: number) => (n <= 1 ? '' : s.length > n ? `…${s.slice(s.length - n + 1)}` : s)
const firstLine = (s: string) => s.trim().split('\n')[0] ?? ''

// ---------- git ----------

type Ran = { exitCode: number; stdout: string; stderr: string }

async function runGit($: $, args: string[], cwd: string, timeoutMs = 30_000): Promise<Ran> {
  try {
    // No terminal prompt: a push that needs credentials fails rather than hangs.
    return await $.process.run(['git', ...args], { cwd, timeoutMs, env: { GIT_TERMINAL_PROMPT: '0' } })
  } catch (error) {
    return { exitCode: -1, stdout: '', stderr: error instanceof Error ? error.message : String(error) }
  }
}

async function refreshGit($: $): Promise<GitSnapshot> {
  const cwd = await $.session.cwd()
  const top = await runGit($, ['rev-parse', '--show-toplevel'], cwd)
  if (top.exitCode !== 0) {
    const snapshot = { ...EMPTY_GIT, root: cwd, error: top.exitCode === -1 ? 'git is not on PATH.' : '' }
    await update($, git, () => snapshot)
    return snapshot
  }

  const root = top.stdout.trim()
  const [status, log, remote] = await Promise.all([
    runGit($, ['status', '--porcelain=v1', '-b', '-z'], root),
    runGit($, ['log', '-6', '--pretty=format:%h %s'], root),
    runGit($, ['remote', 'get-url', 'origin'], root),
  ])
  const parsed = parseStatus(status.stdout)
  const snapshot: GitSnapshot = {
    isRepo: true,
    root,
    ...parsed,
    commits: log.exitCode === 0 ? log.stdout.split('\n').filter(Boolean) : [],
    remote: remote.exitCode === 0 ? remote.stdout.trim() : '',
    ...(status.exitCode === 0 ? {} : { error: firstLine(status.stderr) }),
  }
  await update($, git, () => snapshot)

  return snapshot
}

/** Runs one git action from a button, says how it went, then re-reads the status. */
async function act($: $, label: string, args: string[], timeoutMs?: number) {
  if (await read($, busy)) return
  const { root } = await read($, git)
  await update($, busy, () => label)
  const ran = await runGit($, args, root, timeoutMs)
  const said = firstLine(ran.exitCode === 0 ? ran.stdout || ran.stderr : ran.stderr || ran.stdout)
  await update($, note, () => (ran.exitCode === 0 ? `${label}: done${said ? ` (${said})` : ''}` : `${label} failed: ${said}`))
  await update($, busy, () => '')
  await refreshGit($)
}

/** Strips git's file headers, so the viewer gets hunks it can draw as a diff. */
const hunksOf = (diff: string) => {
  const at = diff.indexOf('\n@@')
  return diff.startsWith('@@') ? diff : at < 0 ? '' : diff.slice(at + 1)
}

async function showChange($: $, file: FileChange, side: 'staged' | 'unstaged') {
  const { root } = await read($, git)
  if (isUntracked(file)) {
    await openFile($, root, file.path, `New file ${file.path}`)
    return
  }
  const args = side === 'staged' ? ['diff', '--cached', '--', file.path] : ['diff', '--', file.path]
  const ran = await runGit($, args, root)
  const hunks = hunksOf(ran.stdout)
  const cut = firstLines(hunks || firstLine(ran.stdout) || 'No textual changes.', MAX_LINES)
  await update($, viewer, () => ({
    title: `${side === 'staged' ? 'Staged' : 'Unstaged'} ${file.path}`,
    source: cut.text,
    format: hunks ? 'diff' : 'source',
    path: file.path,
    isCut: cut.isCut,
  }))
}

// ---------- files ----------

const join = (root: string, rel: string) => (rel ? `${root.replace(/[\\/]+$/, '')}/${rel}` : root)

async function listDir($: $, dir: string) {
  const snapshot = await read($, git)
  const root = snapshot.root || (await $.session.cwd())
  try {
    const raw = await $.fs.list(join(root, dir))
    const entries: Entry[] = raw
      .filter(one => one.name !== '.git')
      .map(one => ({ name: one.name, isDir: one.kind === 'dir' }))
      .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .slice(0, MAX_ENTRIES)
    await update($, listing, () => ({ root, dir, entries }))
  } catch (error) {
    await update($, listing, () => ({ root, dir, entries: [], error: error instanceof Error ? error.message : String(error) }))
  }
}

async function openFile($: $, root: string, rel: string, title = rel) {
  const path = join(root, rel)
  try {
    const stat = await $.fs.stat(path)
    if (stat.kind === 'dir') {
      await update($, tab, () => 'files')
      await update($, viewer, () => null)
      await listDir($, rel)
      return
    }
    if (stat.size > MAX_FILE_BYTES) {
      await update($, note, () => `${rel} is ${Math.round(stat.size / 1024)} KB, too large to show.`)
      return
    }
    const cut = firstLines(await $.fs.read(path), MAX_LINES)
    await update($, viewer, () => ({ title, source: cut.text, format: 'source', path: rel, isCut: cut.isCut }))
  } catch (error) {
    await update($, note, () => `Cannot open ${rel}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// ---------- github ----------

async function refreshGitHub($: $, token: string) {
  const snapshot = await read($, git)
  const repo = githubRepo(snapshot.remote)
  const now = await $.clock.now()
  if (!repo) {
    await update($, github, () => ({
      repo: '',
      branch: snapshot.branch,
      pull: null,
      runs: [],
      error: snapshot.isRepo ? 'The origin remote is not a GitHub repository.' : 'Not a git repository.',
      checkedAt: now,
    }))
    return
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'claude-mods-workbench',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  const [owner = ''] = repo.split('/')
  const branch = encodeURIComponent(snapshot.branch)
  try {
    const [pulls, runs] = await Promise.all([
      $.http.fetch(`https://api.github.com/repos/${repo}/pulls?state=open&per_page=1&head=${owner}:${branch}`, { headers }),
      $.http.fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=8&branch=${branch}`, { headers }),
    ])
    const bad = !pulls.ok ? pulls : !runs.ok ? runs : undefined
    await update($, github, () => ({
      repo,
      branch: snapshot.branch,
      pull: pulls.ok ? toPull(pulls.text) : null,
      runs: runs.ok ? toRuns(runs.text) : [],
      ...(bad ? { error: failure(bad.status, bad.text, Boolean(token)) } : {}),
      checkedAt: now,
    }))
  } catch (error) {
    await update($, github, () => ({
      repo,
      branch: snapshot.branch,
      pull: null,
      runs: [],
      error: `Cannot reach GitHub: ${error instanceof Error ? error.message : String(error)}`,
      checkedAt: now,
    }))
  }
}

async function rerunFailed($: $, token: string, repo: string, id: number) {
  try {
    const sent = await $.http.fetch(`https://api.github.com/repos/${repo}/actions/runs/${id}/rerun-failed-jobs`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'claude-mods-workbench',
        Authorization: `Bearer ${token}`,
      },
    })
    await update($, note, () => (sent.ok ? `Re-running the failed jobs of run ${id}.` : failure(sent.status, sent.text, true)))
  } catch (error) {
    await update($, note, () => `Cannot reach GitHub: ${error instanceof Error ? error.message : String(error)}`)
  }
  await refreshGitHub($, token)
}

// ---------- hooks ----------

async function switchTo($: $, to: Tab, token: string) {
  await update($, tab, () => to)
  await update($, viewer, () => null)
  if (to === 'files') await listDir($, (await read($, listing)).dir)
  if (to === 'github') await refreshGitHub($, token)
}

async function refreshAll($: $, token: string) {
  await refreshGit($)
  const current = await read($, tab)
  if (current === 'files') await listDir($, (await read($, listing)).dir)
  if (current === 'github') await refreshGitHub($, token)
}

export const register: Register = (on, options) => {
  const token = String(options.githubToken ?? '').trim()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'workbench',
      description: 'Open the Workbench pane: Git review, files and GitHub for this repository',
    })
    void refreshGit($)
    if (options.openOnStart === true) void $.ui.open({ id: PANE, title: 'Workbench' })

    return next(e)
  })

  on('command.run', { command: 'workbench' }, async $ => {
    await refreshAll($, token)
    const opened = await $.ui.open({ id: PANE, title: 'Workbench' })

    return { text: opened.isPlaced ? 'Workbench opened.' : `Workbench could not open: ${opened.reason}` }
  })

  // Claude may have changed files during the turn: re-read the status after it.
  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) void refreshGit($)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button, Code, Link } = table
    const Input = 'Input' in table ? table.Input : undefined
    const [current, snapshot, view, dir, gh, said, working, seq] = await Promise.all([
      read($, tab),
      read($, git),
      read($, viewer),
      read($, listing),
      read($, github),
      read($, note),
      read($, busy),
      read($, commitSeq),
    ])
    const width = Math.max(20, e.props.bodyColumns ?? 60)

    const tabs = (
      <Box gap={1} flexWrap="wrap">
        {TABS.map(t => (
          <Button
            key={`tab-${t.id}`}
            hotkey={t.hotkey}
            label={t.label}
            {...(t.id === current ? { variant: 'primary' as const } : {})}
            onPress={() => void switchTo($, t.id, token)}
          />
        ))}
        <Button key="refresh" hotkey="r" label="Refresh" onPress={() => void refreshAll($, token)} />
      </Box>
    )

    const status = (working || said) && (
      <Text color={working ? 'yellow' : undefined} dimColor={!working} wrap="truncate-end">
        {working ? `${working}…` : said}
      </Text>
    )

    const viewerBox = view && (
      <Box flexDirection="column" marginTop={1}>
        <Box gap={1} flexWrap="wrap">
          <Text bold wrap="truncate-end">
            {clip(view.title, width - 24)}
          </Text>
          {view.path && (
            <Button
              key="mention"
              label="@ Mention"
              onPress={() => void $.prompt.fill({ text: `@${view.path} `, mode: 'insert' })}
            />
          )}
          <Button key="close-viewer" label="Close" onPress={() => void update($, viewer, () => null)} />
        </Box>
        <Code
          source={view.source || ' '}
          format={view.format}
          {...(view.path ? { path: view.path } : {})}
          wrap="truncate-end"
        />
        {view.isCut && <Text dimColor>Showing the first {MAX_LINES} lines.</Text>}
      </Box>
    )

    // ---------- Git tab ----------
    const gitTab = () => {
      if (!snapshot.isRepo) {
        return <Text dimColor>{snapshot.error || `${snapshot.root || 'This folder'} is not a git repository.`}</Text>
      }
      const staged = snapshot.files.filter(isStaged)
      const unstaged = snapshot.files.filter(isUnstaged)
      const row = (f: FileChange, side: 'staged' | 'unstaged') => (
        <Box key={`${side}:${f.path}`} gap={1}>
          <Button
            key={`${side}:${f.path}`}
            label={side === 'staged' ? '−' : '+'}
            onPress={() =>
              void (side === 'staged'
                ? act($, `Unstage ${f.path}`, ['reset', '-q', '--', f.path])
                : act($, `Stage ${f.path}`, ['add', '--', f.path]))
            }
          />
          <Button key={`view-${side}:${f.path}`} plain onPress={() => void showChange($, f, side)}>
            <Text color={side === 'staged' ? 'green' : isUntracked(f) ? 'cyan' : 'yellow'}>
              {mark(side === 'staged' ? f.x : f.y)}
            </Text>{' '}
            {clip(f.from ? `${f.from} → ${f.path}` : f.path, width - 12)}
          </Button>
        </Box>
      )

      return (
        <Box flexDirection="column">
          <Text wrap="truncate-end">
            <Text bold>⎇ {snapshot.branch || '?'}</Text>
            {snapshot.upstream ? (
              <Text dimColor>
                {'  '}↑{snapshot.ahead} ↓{snapshot.behind} {snapshot.upstream}
              </Text>
            ) : (
              <Text dimColor>{'  '}no upstream</Text>
            )}
          </Text>
          <Box gap={1} flexWrap="wrap">
            <Button key="fetch" hotkey="f" label="Fetch" onPress={() => void act($, 'Fetch', ['fetch', '--prune'], 120_000)} />
            <Button key="pull" hotkey="p" label="Pull" onPress={() => void act($, 'Pull', ['pull', '--ff-only'], 120_000)} />
            <Button
              key="push"
              hotkey="u"
              label="Push"
              onPress={() =>
                void act($, 'Push', snapshot.upstream ? ['push'] : ['push', '-u', 'origin', 'HEAD'], 120_000)
              }
            />
          </Box>

          <Box marginTop={1} gap={1}>
            <Text bold>Staged ({staged.length})</Text>
            {staged.length > 0 && (
              <Button key="unstage-all" plain dimColor label="unstage all" onPress={() => void act($, 'Unstage all', ['reset', '-q'])} />
            )}
          </Box>
          {staged.map(f => row(f, 'staged'))}

          <Box marginTop={1} gap={1}>
            <Text bold>Changes ({unstaged.length})</Text>
            {unstaged.length > 0 && (
              <Button key="stage-all" plain dimColor label="stage all" onPress={() => void act($, 'Stage all', ['add', '-A'])} />
            )}
          </Box>
          {unstaged.map(f => row(f, 'unstaged'))}
          {snapshot.files.length === 0 && <Text dimColor>Working tree clean.</Text>}

          {staged.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              {Input && (
                <Input
                  key={`commit-${seq}`}
                  label="Commit message"
                  placeholder="Describe the staged changes, then Enter"
                  submitLabel="Commit"
                  onSubmit={value => {
                    if (!value.trim()) return void update($, note, () => 'Write a commit message first.')
                    void act($, 'Commit', ['commit', '-m', value]).then(() => update($, commitSeq, n => n + 1))
                  }}
                />
              )}
              <Button
                key="review"
                plain
                dimColor
                label="Ask Claude to review the staged changes"
                onPress={() =>
                  void $.prompt.fill({
                    text: 'Review my staged changes (git diff --cached) for bugs and suggest a commit message.',
                    mode: 'replace',
                  })
                }
              />
            </Box>
          )}

          {snapshot.commits.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold>Recent commits</Text>
              {snapshot.commits.map(c => (
                <Text key={c} dimColor wrap="truncate-end">
                  {c}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      )
    }

    // ---------- Files tab ----------
    const filesTab = () => {
      if (view) return null
      const parent = dir.dir.includes('/') ? dir.dir.slice(0, dir.dir.lastIndexOf('/')) : ''

      return (
        <Box flexDirection="column">
          <Box gap={1}>
            <Text bold wrap="truncate-start">
              {clip(dir.dir ? `${dir.root}/${dir.dir}` : dir.root, width - 10)}
            </Text>
            {dir.dir && <Button key="up" hotkey="u" label="Up" onPress={() => void listDir($, parent)} />}
          </Box>
          {dir.error && <Text color="red">{dir.error}</Text>}
          {dir.entries.length === 0 && !dir.error && <Text dimColor>Empty folder.</Text>}
          {dir.entries.map(entry => {
            const rel = dir.dir ? `${dir.dir}/${entry.name}` : entry.name
            return (
              <Button
                key={`entry:${rel}`}
                plain
                onPress={() => void (entry.isDir ? listDir($, rel) : openFile($, dir.root, rel))}
              >
                {entry.isDir ? <Text color="cyan">{clip(entry.name, width - 4)}/</Text> : clip(entry.name, width - 4)}
              </Button>
            )
          })}
        </Box>
      )
    }

    // ---------- GitHub tab ----------
    const githubTab = () => {
      if (!gh) return <Text dimColor>Loading…</Text>
      return (
        <Box flexDirection="column">
          {gh.repo && (
            <Text bold wrap="truncate-end">
              {gh.repo} <Text dimColor>· {gh.branch}</Text>
            </Text>
          )}
          {gh.error && <Text color="red">{gh.error}</Text>}
          {gh.repo && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold>Pull request</Text>
              {gh.pull ? (
                <Link
                  href={gh.pull.url}
                  label={clip(`#${gh.pull.number} ${gh.pull.isDraft ? '[draft] ' : ''}${gh.pull.title}`, width - 2)}
                />
              ) : (
                <Text dimColor>No open pull request for this branch.</Text>
              )}
            </Box>
          )}
          {gh.repo && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold>Actions runs</Text>
              {gh.runs.length === 0 && !gh.error && <Text dimColor>No workflow runs on this branch.</Text>}
              {gh.runs.map(run => {
                const look = runLook(run)
                return (
                  <Box key={`run-${run.id}`} gap={1}>
                    <Text color={look.color}>{look.glyph}</Text>
                    <Link href={run.url} label={clip(`${run.name} · ${run.title}`, width - 22)} />
                    {token && run.status === 'completed' && run.conclusion === 'failure' && (
                      <Button
                        key={`rerun-${run.id}`}
                        plain
                        dimColor
                        label="re-run"
                        onPress={() => void rerunFailed($, token, gh.repo, run.id)}
                      />
                    )}
                  </Box>
                )
              })}
            </Box>
          )}
          {!token && (
            <Text dimColor>
              No token: public repositories only, 60 requests an hour, no re-runs. Set githubToken in the plugin options.
            </Text>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        {tabs}
        {status}
        {current === 'git' && gitTab()}
        {current === 'files' && filesTab()}
        {current === 'github' && githubTab()}
        {viewerBox}
      </Box>
    )
  })
}
