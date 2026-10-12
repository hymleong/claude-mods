export type Tab = 'git' | 'files' | 'github'

/** One line of `git status`: `x` is the staged column, `y` the working tree's. */
export type FileChange = { path: string; x: string; y: string; from?: string }

export type GitSnapshot = {
  isRepo: boolean
  root: string
  branch: string
  upstream: string
  ahead: number
  behind: number
  files: FileChange[]
  commits: string[]
  remote: string
  error?: string
}

/** What the lower half of a tab shows: a diff or a file's text. */
export type Viewer = {
  title: string
  source: string
  format: 'diff' | 'source'
  path?: string
  isCut?: boolean
}

export type Entry = { name: string; isDir: boolean }

export type Listing = { root: string; dir: string; entries: Entry[]; error?: string }

export type Run = {
  id: number
  name: string
  status: string
  conclusion: string
  url: string
  event: string
  title: string
}

export type Pull = { number: number; title: string; url: string; isDraft: boolean }

export type GitHubInfo = {
  repo: string
  branch: string
  pull: Pull | null
  runs: Run[]
  error?: string
  checkedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    workbench: {
      tab: Tab
      git: GitSnapshot
      viewer: Viewer | null
      listing: Listing
      github: GitHubInfo | null
      note: string
      busy: string
      commitSeq: number
    }
  }
}
