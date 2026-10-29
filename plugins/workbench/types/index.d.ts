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

/** A branch as the switcher lists it; a remote one has no local branch of its name yet. */
export type BranchInfo = {
  name: string
  upstream: string
  ahead: number
  behind: number
  /** When its tip was committed, as git says it (`3 days ago`). */
  when: string
  isCurrent: boolean
  isRemote: boolean
}
export type Worktree = { path: string; branch: string; isCurrent: boolean }
export type Branches = { root: string; items: BranchInfo[]; worktrees: Worktree[] }
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

// ── what Claude touched ────────────────────────────────────────────────────

/** A file Claude wrote this session, with Edit, Write or NotebookEdit. */
export type Touched = {
  /** Absolute, as `paths.norm` spells it. */
  path: string
  edits: number
  /** When Claude last wrote it. */
  at: number
  /** The file did not exist before Claude wrote it. */
  isNew: boolean
  /** The file is as Claude left it: nobody has written it since. */
  isAsLeft: boolean
  /** The file as it was before Claude's first edit can be put back. */
  canUndo: boolean
}

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
  /** The person named the tab (`title frontend`): commands that keep running no longer rename it. */
  isNamed?: boolean
}

export type Tone = 'out' | 'err' | 'info'
/** A run of a line in one style, as the program's colour codes set it. */
export type Styled = { text: string; color?: string; isBold?: boolean; isDim?: boolean; isUnderline?: boolean }
/** One line of output; `runs` where the program coloured it, `text` the same line plain. */
export type Line = { text: string; tone: Tone; runs?: Styled[] }

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

/** A dev server that stopped listening, kept a while so it can be started again. */
export type GonePort = {
  key: string
  port: number
  name: string
  framework: string
  /** The terminal it ran in, and the command that started it; `''` when unknown. */
  termId: string
  cmd: string
  cwd: string
  at: number
}

/**
 * What the mascot is doing, after what Claude is doing: asleep when idle, thinking between
 * steps, reading, at work on files, running a command, on the web, with helpers (subagents),
 * compacting, waiting on the person, just done, or knocked over (stopped or failed).
 */
export type Mood = 'sleep' | 'think' | 'read' | 'work' | 'run' | 'web' | 'helpers' | 'compact' | 'wait' | 'done' | 'oops'

export type Counts ={ changed: number; running: number; ports: number }

// ── what a turn went on ─────────────────────────────────────────────────────

/**
 * What a stretch of a turn went on: a kind of tool at work, the person being
 * asked, the model writing (its reply, code, a call's arguments) or thinking.
 */
export type Spend = 'search' | 'read' | 'run' | 'write' | 'agents' | 'other' | 'wait' | 'think'

/** What a model loop is doing, as its row in the card says: a kind of work, or done or stopped. */
export type Phase = Spend | 'done' | 'stopped'

/** A model loop at work in the turn: the main one (`id` `''`) or a subagent. */
export type Worker = {
  id: string
  /** The model as the engine names it (`claude-opus-5-5`); `''` before its first request. */
  model: string
  /** The effort its requests ask for (`high`); `''` for a model without one. */
  effort: string
  /** A subagent's type and its task in a few words; `''` for the main loop. */
  type: string
  task: string
  /** A subagent's: what it is doing now, or did last. The main loop's row reads the turn's own `now`. */
  doing: Phase
  /** When it began doing that. */
  since: number
  startedAt: number
  /** 0 while it works. */
  endedAt: number
}

/** Something Claude looked at in the turn, or a file it wrote. */
export type Source = { kind: 'file' | 'search' | 'web' | 'edit'; label: string }

/** The latest turn: how long it took, what the time went on, who worked on it and what they looked at. */
export type Activity = {
  turnId: string
  startedAt: number
  /** 0 while the turn runs. */
  endedAt: number
  outcome: 'running' | 'done' | 'stopped'
  /** Tool calls made, the subagents' included. */
  steps: number
  /** Milliseconds charged to each kind of work, up to `at`; the time since goes to `now`, which began at `since`. */
  spent: Record<Spend, number>
  at: number
  now: Spend
  since: number
  /** The main loop first, then each subagent in the order they started. */
  workers: Worker[]
  /** The latest first, each once. */
  sources: Source[]
}

declare module 'claude-code' {
  interface PluginState {
    workbench: {
      isOn: boolean
      tab: Tab
      /** The person's theme, light or dark: what the pictures are coloured for. */
      scheme: 'light' | 'dark'
      /** What the mascot in the header is doing, after what Claude is doing. */
      mood: Mood
      /** The latest turn, as the card beside the mascot shows it; `null` before the first. */
      activity: Activity | null
      /** The card lists the turn's sources. */
      activityOpen: boolean
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
      /** The drop-down open in the pane (`scripts`, `branches`); `''` for none. */
      menu: string
      /** Files Claude wrote this session, the latest first. */
      touched: Touched[]
      /** Each touched file's text before Claude's first edit (`null`: it did not exist), a hash of how Claude left it, and its time then. */
      originals: Record<string, { text: string | null; left: string; mtimeMs: number }>
      /** Changes shows only the files Claude touched. */
      claudeOnly: boolean
      branches: Branches | null
      ports: Ports
      gone: GonePort[]
      portFilter: 'dev' | 'all'
      portOpen: string
      /** The press waiting on its second one; `''` for none. */
      confirming: string
      /** What a press set going and is not done yet ('push', 'commit'); `''` for nothing. */
      busy: string
    }
  }
}
