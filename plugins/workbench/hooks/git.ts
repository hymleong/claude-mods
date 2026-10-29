import type { BranchInfo, Checks, CommitFile, GitFile, Job, LogRow, Pull, Run, Worktree } from '../types'

// git's and gh's output, read. The hooks module runs the commands; nothing
// here touches the engine, so all of it can be tested on fixtures.

export type Status = {
  branch: string
  upstream: string
  ahead: number
  behind: number
  isDetached: boolean
  files: GitFile[]
}

/** `git status --porcelain=v1 --branch -z`. */
export function parseStatus(out: string): Status {
  const entries = out.split('\0')
  const status: Status = { branch: '', upstream: '', ahead: 0, behind: 0, isDetached: false, files: [] }
  let at = 0
  const head = entries[0] ?? ''
  if (head.startsWith('## ')) {
    at = 1
    let rest = head.slice(3)
    const bracket = /\s\[([^\]]*)\]$/.exec(rest)
    if (bracket !== null) {
      rest = rest.slice(0, bracket.index)
      status.ahead = Number(/ahead (\d+)/.exec(bracket[1] ?? '')?.[1] ?? 0)
      status.behind = Number(/behind (\d+)/.exec(bracket[1] ?? '')?.[1] ?? 0)
    }
    if (rest.startsWith('HEAD (no branch)')) {
      status.isDetached = true
      status.branch = 'HEAD'
    } else {
      const named = rest.replace(/^(No commits yet on |Initial commit on )/, '')
      const [branch, upstream] = named.split('...')
      status.branch = branch ?? ''
      status.upstream = upstream ?? ''
    }
  }
  for (; at < entries.length; at += 1) {
    const entry = entries[at] ?? ''
    if (entry.length < 4) continue
    const index = entry[0] ?? ' '
    const tree = entry[1] ?? ' '
    const path = entry.slice(3)
    let from = ''
    if (index === 'R' || index === 'C' || tree === 'R' || tree === 'C') {
      at += 1
      from = entries[at] ?? ''
    }
    status.files.push({ path, from, index, tree })
  }

  return status
}

export const isUntracked = (file: GitFile): boolean => file.index === '?' && file.tree === '?'
export const isStaged = (file: GitFile): boolean => !' ?!'.includes(file.index)
export const isChanged = (file: GitFile): boolean => file.tree !== ' ' && file.tree !== '!'
export const isConflict = (file: GitFile): boolean =>
  file.index === 'U' || file.tree === 'U' || (file.index === 'A' && file.tree === 'A') || (file.index === 'D' && file.tree === 'D')

/** The letter that best says what happened to a file on one side. */
export function letterOf(file: GitFile, staged: boolean): string {
  if (isUntracked(file)) return 'U'
  if (isConflict(file)) return '!'

  return (staged ? file.index : file.tree).trim() || 'M'
}

/** The diff of one file on one side; untracked files against nothing. */
export function diffArgs(file: GitFile, staged: boolean): string[] {
  const base = ['diff', '--no-color', '--no-ext-diff']
  if (staged) return [...base, '--cached', '-M', '--', ...(file.from === '' ? [] : [file.from]), file.path]
  if (isUntracked(file)) return [...base, '--no-index', '--', '/dev/null', file.path]

  return [...base, '--', file.path]
}

export type Fitted = { text: string; shown: number; total: number; isBinary: boolean }

/** A hunk's header with its line counts set to what its body now holds. */
function recount(header: string, body: readonly string[]): string {
  const old = body.filter(line => line.startsWith(' ') || line.startsWith('-')).length
  const now = body.filter(line => line.startsWith(' ') || line.startsWith('+')).length

  return header.replace(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/, (_, a: string, c: string) => `@@ -${a},${old} +${c},${now} @@`)
}

/**
 * A unified diff cut to about `max` lines without breaking a hunk: whole
 * hunks while they fit, and a first hunk longer than that cut short with its
 * header recounted, so the result still parses as a diff.
 */
export function fitHunks(out: string, max = 400): Fitted {
  if (/^Binary files .* differ$/m.test(out)) return { text: '', shown: 0, total: 0, isBinary: true }
  const lines = out.replace(/\r\n/g, '\n').split('\n')
  const hunks: string[][] = []
  for (const line of lines) {
    if (line.startsWith('@@')) hunks.push([line])
    else if (hunks.length > 0 && (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-') || line.startsWith('\\'))) {
      hunks[hunks.length - 1]!.push(line)
    }
  }
  const total = hunks.reduce((sum, hunk) => sum + hunk.length, 0)
  const kept: string[] = []
  for (const hunk of hunks) {
    if (kept.length + hunk.length <= max) {
      kept.push(...hunk)
      continue
    }
    if (kept.length === 0) {
      const body = hunk.slice(1, Math.max(2, max))
      kept.push(recount(hunk[0]!, body), ...body)
    }
    break
  }

  return { text: kept.join('\n'), shown: kept.length, total, isBinary: false }
}

/** The next size a diff grows to when the person asks for more. */
export const moreLines = (shown: number): number => Math.max(800, shown * 2)

const SEP = '\u001f'

export const LOG_ARGS = [
  'log',
  '--graph',
  '--all',
  '--color=never',
  '--date=relative',
  `--format=${SEP}%h${SEP}%p${SEP}%D${SEP}%s${SEP}%an${SEP}%ad`,
  '-n',
  '300',
] as const

/** `git log --graph` in LOG_ARGS's format: a row per line, graph-only lines with no commit. */
export function parseLog(out: string): LogRow[] {
  return out
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter(line => line !== '')
    .map(line => {
      const cut = line.indexOf(SEP)
      if (cut < 0) return { graph: line.trimEnd(), sha: '', parents: [], refs: '', subject: '', author: '', when: '' }
      const [sha = '', parents = '', refs = '', subject = '', author = '', when = ''] = line.slice(cut + 1).split(SEP)

      return { graph: line.slice(0, cut).trimEnd(), sha, parents: parents.split(' ').filter(one => one !== ''), refs, subject, author, when }
    })
}

/** One commit's place in the drawn graph: its lane, and the lines through, into and out of its row. */
export type GraphRow = {
  lane: number
  colour: number
  /** The commit's lane comes down from the row above. */
  isFromAbove: boolean
  /** Its first parent goes on down its lane. */
  isToBelow: boolean
  /** Lanes passing straight through the row, with their colours. */
  through: { lane: number; colour: number }[]
  /** Lanes from above that end in this commit (other children's lines joining it). */
  joins: { lane: number; colour: number }[]
  /** Lanes this commit's other parents leave by, down to the next row. */
  forks: { lane: number; colour: number }[]
}

/**
 * Lays the commits out in lanes from their parents, newest first, as a graph
 * viewer does: a commit sits in the lane that was waiting for it, its first
 * parent goes on in that lane, each other parent takes a lane of its own (or
 * joins the one already waiting for it), and freed lanes are used again.
 * Lanes keep their places, so lines never shift sideways between rows.
 */
export function layoutGraph(rows: readonly Pick<LogRow, 'sha' | 'parents'>[]): { rows: GraphRow[]; lanes: number } {
  const waiting: (string | null)[] = []
  const colours: number[] = []
  let nextColour = 0
  let widest = 1
  const free = (): number => {
    const at = waiting.indexOf(null)

    return at < 0 ? waiting.length : at
  }
  const out = rows.map(row => {
    let lane = waiting.indexOf(row.sha)
    const isFromAbove = lane >= 0
    if (!isFromAbove) {
      lane = free()
      colours[lane] = nextColour++
    }
    const colour = colours[lane] ?? 0
    const joins: GraphRow['joins'] = []
    waiting.forEach((sha, at) => {
      if (at !== lane && sha === row.sha) {
        joins.push({ lane: at, colour: colours[at] ?? 0 })
        waiting[at] = null
      }
    })
    const through = waiting.flatMap((sha, at) => (at !== lane && sha !== null ? [{ lane: at, colour: colours[at] ?? 0 }] : []))
    const [first, ...others] = row.parents
    waiting[lane] = first ?? null
    const forks: GraphRow['forks'] = []
    for (const parent of others) {
      const held = waiting.indexOf(parent)
      if (held >= 0) {
        forks.push({ lane: held, colour: colours[held] ?? 0 })
        continue
      }
      const at = free()
      waiting[at] = parent
      colours[at] = nextColour++
      forks.push({ lane: at, colour: colours[at] ?? 0 })
    }
    while (waiting.length > 0 && waiting[waiting.length - 1] === null) waiting.pop()
    widest = Math.max(widest, lane + 1, ...through.map(one => one.lane + 1), ...forks.map(one => one.lane + 1), ...joins.map(one => one.lane + 1))

    return { lane, colour, isFromAbove, isToBelow: first !== undefined, through, joins, forks }
  })

  return { rows: out, lanes: widest }
}

export const commitArgs = (sha: string): string[] => [
  'show',
  '--no-patch',
  '--color=never',
  '--date=relative',
  `--format=%H${SEP}%an${SEP}%ad${SEP}%s${SEP}%b`,
  sha,
]

export function parseCommit(out: string): { sha: string; author: string; when: string; subject: string; body: string } | undefined {
  const [sha = '', author = '', when = '', subject = '', ...body] = out.split(SEP)

  return /^[0-9a-f]{7,40}$/.test(sha.trim())
    ? { sha: sha.trim(), author, when, subject, body: body.join(SEP).trim() }
    : undefined
}

/** `git show --name-status --format=`: renames and copies named by where they went. */
export function parseNameStatus(out: string): CommitFile[] {
  return out
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.split('\t'))
    .filter(cols => cols.length >= 2 && cols[0] !== '')
    .map(cols => ({ status: (cols[0] ?? 'M').slice(0, 1), path: cols[cols.length - 1] ?? '' }))
}

/** Only shas git itself printed go back to git. */
// ── branches ────────────────────────────────────────────────────────────────

/** Local and remote branches, the latest committed first; a tab between fields (git allows none in a ref name). */
export const BRANCH_ARGS = [
  'for-each-ref',
  '--sort=-committerdate',
  '--format=%(refname)%09%(upstream:short)%09%(upstream:track,nobracket)%09%(committerdate:relative)%09%(HEAD)',
  'refs/heads',
  'refs/remotes',
]

/** `BRANCH_ARGS`' output: each local branch, then each remote one that has no local branch of its name. */
export function parseBranches(out: string): BranchInfo[] {
  const local: BranchInfo[] = []
  const remote: BranchInfo[] = []
  for (const line of out.split(/\r?\n/)) {
    const [ref = '', upstream = '', track = '', when = '', head = ''] = line.split('\t')
    if (ref.startsWith('refs/heads/')) {
      local.push({
        name: ref.slice('refs/heads/'.length),
        upstream,
        ahead: Number(/ahead (\d+)/.exec(track)?.[1] ?? 0),
        behind: Number(/behind (\d+)/.exec(track)?.[1] ?? 0),
        when,
        isCurrent: head.trim() === '*',
        isRemote: false,
      })
    } else if (ref.startsWith('refs/remotes/') && !ref.endsWith('/HEAD')) {
      remote.push({ name: ref.slice('refs/remotes/'.length), upstream: '', ahead: 0, behind: 0, when, isCurrent: false, isRemote: true })
    }
  }
  const tracked = new Set(local.map(one => one.upstream).filter(name => name !== ''))
  const named = new Set(local.map(one => one.name))
  const untracked = remote.filter(one => !tracked.has(one.name) && !named.has(one.name.slice(one.name.indexOf('/') + 1)))

  return [...local, ...untracked]
}

/** `git worktree list --porcelain`: each worktree's folder and the branch checked out there. */
export function parseWorktrees(out: string, current: string): Worktree[] {
  const found: Worktree[] = []
  for (const stanza of out.split(/\r?\n\r?\n/)) {
    const raw = /^worktree (.+)$/m.exec(stanza)?.[1]?.trim()
    if (raw === undefined || /^bare$/m.test(stanza)) continue
    const path = raw.replace(/\\/g, '/')
    const branch = /^branch refs\/heads\/(.+)$/m.exec(stanza)?.[1]?.trim() ?? (/^detached$/m.test(stanza) ? '(detached)' : '')
    found.push({ path, branch, isCurrent: path.toLowerCase() === current.toLowerCase() })
  }

  return found
}

/** What `git switch` takes to check a listed branch out: a remote one becomes a local branch tracking it. */
export function switchArgs(branch: Pick<BranchInfo, 'name' | 'isRemote'>): string[] {
  return branch.isRemote ? ['switch', '--track', branch.name] : ['switch', branch.name]
}

/** Whether git takes `name` as a new branch's name (`git check-ref-format --branch`, roughly). */
export const isBranchName = (name: string): boolean =>
  name !== '' && name !== '@' && !/[\s~^:?*[\\\x00-\x1f\x7f]|\.\.|@\{|\/\/|^[-/.]|[/.]$|\.lock$|\/\./.test(name)

export const isSha = (text: string): boolean => /^[0-9a-f]{4,40}$/.test(text)

/** The last few lines of a command's complaint: enough to say what went wrong in a toast. */
export function tail(text: string, lines = 3): string {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '' && !line.startsWith('hint:'))
    .slice(-lines)
    .join(' ')
}

// ── gh ──────────────────────────────────────────────────────────────────────

const obj = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
const str = (value: unknown): string => (typeof value === 'string' ? value : '')
const int = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
const parse = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

export const PULL_FIELDS = 'number,title,url,state,isDraft,author,headRefName,statusCheckRollup'

/** One verdict over a pull request's checks. */
export function checksOf(rollup: unknown): Checks {
  if (!Array.isArray(rollup) || rollup.length === 0) return ''
  const states = rollup.map(one => {
    const check = obj(one)

    return (str(check.conclusion) || str(check.state) || str(check.status)).toUpperCase()
  })
  if (states.some(state => ['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ERROR', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(state))) return 'fail'
  if (states.some(state => ['', 'PENDING', 'EXPECTED', 'QUEUED', 'IN_PROGRESS', 'WAITING'].includes(state))) return 'pending'

  return 'pass'
}

function toPull(value: unknown): Pull | null {
  const pull = obj(value)
  const number = int(pull.number)

  return number === 0
    ? null
    : {
        number,
        title: str(pull.title),
        url: str(pull.url),
        state: str(pull.state),
        isDraft: pull.isDraft === true,
        author: str(obj(pull.author).login),
        branch: str(pull.headRefName),
        checks: checksOf(pull.statusCheckRollup),
      }
}

export const parsePull = (text: string): Pull | null => toPull(parse(text))

export function parsePulls(text: string): Pull[] {
  const list = parse(text)

  return Array.isArray(list) ? list.map(toPull).filter((one): one is Pull => one !== null) : []
}

export const RUN_FIELDS = 'databaseId,name,displayTitle,status,conclusion,event,createdAt,url'

export function parseRuns(text: string): Run[] {
  const list = parse(text)

  return Array.isArray(list)
    ? list
        .map(one => {
          const run = obj(one)

          return {
            id: int(run.databaseId),
            name: str(run.name),
            title: str(run.displayTitle),
            status: str(run.status),
            conclusion: str(run.conclusion),
            event: str(run.event),
            createdAt: str(run.createdAt),
            url: str(run.url),
          }
        })
        .filter(run => run.id !== 0)
    : []
}

export function parseJobs(text: string): Job[] {
  const jobs = obj(parse(text)).jobs

  return Array.isArray(jobs)
    ? jobs.map(one => {
        const job = obj(one)
        const steps = Array.isArray(job.steps) ? job.steps.map(obj) : []

        return {
          name: str(job.name),
          status: str(job.status),
          conclusion: str(job.conclusion),
          url: str(job.url),
          failed: steps.filter(step => str(step.conclusion) === 'failure').map(step => str(step.name)),
        }
      })
    : []
}

/** A failed run, as a request to Claude: what failed, and how to read its logs. */
export function runPrompt(run: Run, branch: string, jobs: readonly Job[]): string {
  const failed = jobs.filter(job => job.conclusion === 'failure')
  const list = failed
    .map(job => `- ${job.name}${job.failed.length > 0 ? ` (failed at: ${job.failed.join(', ')})` : ''}`)
    .join('\n')

  return [
    `The GitHub Actions run "${run.title || run.name}" (workflow ${run.name}) failed on branch ${branch}: ${run.url}`,
    failed.length > 0 ? `Failed jobs:\n${list}` : '',
    `Read its logs with \`gh run view ${run.id} --log-failed\`, find the cause, and fix it.`,
  ]
    .filter(part => part !== '')
    .join('\n\n')
}

/** A request to Claude for a commit message over what is staged. */
export const COMMIT_PROMPT =
  'Read the staged changes (`git diff --cached`) and write a short, specific commit message for them. Show me the message before committing.'
