import type { Elements, RenderElement } from 'claude-code'

import type {
  Block,
  BranchPull,
  Counts,
  Diff,
  GitSection,
  History,
  Listing,
  OpenCommit,
  OpenFile,
  OpenRun,
  Ports,
  PullList,
  Repo,
  Runs,
  Script,
  Search,
  Tab,
  Term,
} from '../../types'
import type { EditorProps } from '../editor'
import type { InputProps } from '../terminal-input'

/** The elements a pane draws with; `Input` and `Svg` where the surface has them, surface modules where it runs them. */
export type Kit = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Code'> &
  Partial<Pick<Elements['terminal'], 'Input'>> &
  Partial<Pick<Elements['desktop'], 'Svg'>> & {
    termInput?: (props: InputProps) => RenderElement
    editor?: (props: EditorProps) => RenderElement
  }

/** Everything a drawing draws from, read once per draw. */
export type Model = {
  /** A grid of character cells (the terminal), or a surface that sets type (desktop, an editor). */
  isGrid: boolean
  /** The person's theme: what the pictures are coloured for. */
  scheme: 'light' | 'dark'
  /** Cells across, inside the padding. */
  width: number
  /** Rows of the room when docked, so the footer sits at the bottom; 0 inline. */
  rows: number
  isFocused: boolean
  isWindows: boolean
  now: number
  home: string
  tab: Tab
  workspace: string
  counts: Counts
  confirming: string
  busy: string

  repos: readonly Repo[]
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

  terms: readonly Term[]
  activeTerm: string
  blocks: readonly Block[]
  blockOpen: string
  termHistory: readonly string[]
  inputFill: { seq: number; text: string } | null
  scripts: readonly Script[]

  ports: Ports
  portFilter: 'dev' | 'all'
  portOpen: string
}

export type SyncVerb = 'fetch' | 'pull' | 'push'

/** What a press does. Each rereads what it acts on: a drawing can be stale. */
export type Actions = {
  setTab: (tab: Tab) => void
  openPane: () => void

  setGitSection: (section: GitSection) => void
  openRepo: (root: string) => void
  closeRepo: () => void
  openDiff: (root: string, path: string, staged: boolean) => void
  closeDiff: () => void
  moreDiff: () => void
  stage: (root: string, paths: readonly string[] | 'all', toStaged: boolean) => void
  commit: (root: string, message: string) => void
  sync: (root: string, verb: SyncVerb) => void
  mention: (path: string) => void
  draft: (text: string) => void
  openDir: (path: string) => void
  openFile: (path: string, line?: number) => void
  closeFile: () => void
  pageFile: (by: number) => void
  toggleEdit: () => void
  searchFiles: (query: string) => void
  clearSearch: () => void
  openCommit: (root: string, sha: string) => void
  closeCommit: () => void
  openCommitFile: (path: string) => void
  openRun: (id: number) => void
  closeRun: () => void
  rerun: (id: number) => void
  runToPrompt: (id: number) => void
  openUrl: (url: string) => void
  ask: (key: string) => void
  cancel: () => void

  newTerm: () => void
  pickTerm: (id: string) => void
  closeTerm: (id: string) => void
  restartTerm: (id: string) => void
  stopTerm: (id: string) => void
  clearTerm: (id: string) => void
  runLine: (id: string, text: string) => void
  runScript: (script: Script) => void
  openBlock: (id: string) => void
  copyBlock: (id: string, surface: string) => void
  editAgain: (cmd: string) => void

  setPortFilter: (filter: 'dev' | 'all') => void
  openPort: (key: string) => void
  browse: (key: string) => void
  copyUrl: (key: string, surface: string) => void
  killPort: (key: string) => void
  rescan: () => void
}
