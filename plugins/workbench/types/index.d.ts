// What the workbench pane draws from. The host keeps these for the session,
// so a hot reload redraws exactly where the person was.

export type Tab = 'git' | 'term' | 'ports'
export type GitSection = 'changes' | 'files' | 'history' | 'pulls' | 'actions'

// ── git ─────────────────────────────────────────────────────────────────────

/** One changed path: its index (staged) and worktree letters as `git status` prints them. */
export type GitFile = { path: string; from: string; index: string; tree: string }

export type Repo = {
  root: string
  name: string
  branch: string
  upstream: string
  ahead: number
  behind: number
  isDetached: boolean
  files: GitFile[]
}

/** A diff cut to whole hunks; `total` is how many hunk lines git had, `shown` how many are here. */
export type Diff = {
  root: string
  path: string
  isStaged: boolean
  text: string
  shown: number
  total: number
  isBinary: boolean
}

export type Entry = { name: string; isDir: boolean; size: number }
export type Listing = { path: string; entries: Entry[] }

export type OpenFile = {
  path: string
  text: string
  /** Why the text is not shown (too large, binary, unreadable); `''` when it is. */
  note: string
  mtimeMs: number
  /** The first line in view, 0-based. */
  top: number
  isEditing: boolean
}

export type Hit = { path: string; line: number; text: string }
export type Search = { query: string; names: string[]; hits: Hit[]; isCut: boolean }

/** A line of `git log --graph`; `graph` is git's own text for it, `parents` the commit's parents' hashes. */
export type LogRow = { graph: string; sha: string; parents: string[]; refs: string; subject: string; author: string; when: string }
export type History = { root: string; rows: LogRow[] }

export type CommitFile = { status: string; path: string }
export type CommitDiff = { path: string; text: string; shown: number; total: number }
export type OpenCommit = {
  root: string
  sha: string
  subject: string
  body: string
  author: string
  when: string
  files: CommitFile[]
  diff: CommitDiff | null
}

export type Checks = 'pass' | 'fail' | 'pending' | ''
export type Pull = {
  number: number
  title: string
  url: string
  state: string
  isDraft: boolean
  author: string
  branch: string
  checks: Checks
}
export type PullList = { root: string; items: Pull[]; note: string }
export type BranchPull = { root: string; branch: string; pull: Pull | null }

export type Run = {
  id: number
  name: string
  title: string
  status: string
  conclusion: string
  event: string
  createdAt: string
  url: string
}
export type Job = { name: string; status: string; conclusion: string; url: string; failed: string[] }
export type Runs = { root: string; branch: string; items: Run[]; note: string }
export type OpenRun = { id: number; jobs: Job[] }

// ── terminals ───────────────────────────────────────────────────────────────

/** `ended`: the PowerShell behind the tab is gone (closed, crashed, or the plugin reloaded). */
export type TermState = 'starting' | 'idle' | 'busy' | 'ended'

export type Term = {
  id: string
  title: string
  /** Where the shell is now, as PowerShell prints it. */
  cwd: string
  state: TermState
  /** The host PowerShell's process id; 0 before it is up. */
  pid: number
  /** The script this tab was opened to run, if any. */
  script: string
  note: string
}

export type Tone = 'out' | 'err' | 'info'
export type Line = { text: string; tone: Tone }

export type BlockState = 'running' | 'stopping' | 'ok' | 'fail' | 'stopped'

/** One command and what it printed. */
export type Block = {
  id: string
  cmd: string
  /** Where the command ran. */
  cwd: string
  lines: Line[]
  /** Lines printed before `lines`, left out to keep the drawing small. */
  dropped: number
  state: BlockState
  exit: number | null
  startedAt: number
  endedAt: number
}

/** A runnable task found in the repository: a package.json script, a make target, ... */
export type Script = { id: string; label: string; cmd: string; cwd: string; kind: string; folder: string }

// ── ports ───────────────────────────────────────────────────────────────────

export type PortKind = 'dev' | 'other' | 'system'

export type Probe = { status: number; title: string; ms: number; server: string }

export type PortRow = {
  /** `pid:port` */
  key: string
  port: number
  addresses: string[]
  pid: number
  name: string
  kind: PortKind
  /** The command line with anything that looks like a secret masked; `''` when unknown. */
  cmd: string
  startedAt: number
  memMb: number
  /** The workbench terminal whose process tree owns the port; `''` for none. */
  termId: string
  framework: string
  probe: Probe | null
  /** Recent probe times in ms, oldest first. */
  history: number[]
  /** Bound to every interface, so reachable from the network. */
  isExposed: boolean
}

export type Ports = { rows: PortRow[]; at: number; note: string }

export type Counts = { changed: number; running: number; ports: number }

declare module 'claude-code' {
  interface PluginState {
    workbench: {
      isOn: boolean
      tab: Tab
      /** The person's theme, light or dark: what the pictures are coloured for. */
      scheme: 'light' | 'dark'
      workspace: string
      counts: Counts
      repos: Repo[]
      repo: string
      gitSection: GitSection
      diff: Diff | null
      listing: Listing | null
      file: OpenFile | null
      search: Search | null
      history: History | null
      commit: OpenCommit | null
      pullList: PullList | null
      branchPull: BranchPull | null
      runs: Runs | null
      run: OpenRun | null
      terms: Term[]
      activeTerm: string
      screen: StateFamily<Block[]>
      /** Commands run in each terminal, the latest last: what ↑ walks. */
      termHistory: StateFamily<string[]>
      /** The block shown whole; `''` shows each block's tail. */
      blockOpen: string
      /** A line the pane asks the input to hold (a command to edit again), by `seq`. */
      inputFill: { seq: number; text: string } | null
      scripts: Script[]
      ports: Ports
      portFilter: 'dev' | 'all'
      portOpen: string
      /** The press waiting on its second one; `''` for none. */
      confirming: string
      /** What a press set going and is not done yet ('push', 'commit'); `''` for nothing. */
      busy: string
    }
  }
}
