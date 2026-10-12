import type { FileChange } from '../types'

// Plain parsing of git's own output, so it can be tested without a repository.

export type Status = {
  branch: string
  upstream: string
  ahead: number
  behind: number
  files: FileChange[]
}

/** `git status --porcelain=v1 -b -z`: the branch header, then one entry per path. */
export function parseStatus(out: string): Status {
  const parts = out.split('\0')
  const status: Status = { branch: '', upstream: '', ahead: 0, behind: 0, files: [] }

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? ''
    if (part === '') continue
    if (part.startsWith('## ')) {
      Object.assign(status, parseBranch(part.slice(3)))
      continue
    }
    const x = part[0] ?? ' '
    const y = part[1] ?? ' '
    const path = part.slice(3)
    // A rename or copy names its old path in the next entry.
    if (x === 'R' || x === 'C') {
      status.files.push({ path, x, y, from: parts[i + 1] ?? '' })
      i++
    } else {
      status.files.push({ path, x, y })
    }
  }

  return status
}

function parseBranch(head: string): Pick<Status, 'branch' | 'upstream' | 'ahead' | 'behind'> {
  const unborn = /^No commits yet on (.+)$/.exec(head) ?? /^Initial commit on (.+)$/.exec(head)
  if (unborn) return { branch: unborn[1] ?? '', upstream: '', ahead: 0, behind: 0 }
  if (head.startsWith('HEAD (no branch)')) return { branch: 'detached HEAD', upstream: '', ahead: 0, behind: 0 }

  const [names = '', counts = ''] = head.split(' [')
  const [branch = '', upstream = ''] = names.split('...')

  return {
    branch,
    upstream,
    ahead: Number(/ahead (\d+)/.exec(counts)?.[1] ?? 0),
    behind: Number(/behind (\d+)/.exec(counts)?.[1] ?? 0),
  }
}

export const isStaged = (f: FileChange) => f.x !== ' ' && f.x !== '?' && f.x !== '!'
export const isUnstaged = (f: FileChange) => f.y !== ' ' && f.y !== '!'
export const isUntracked = (f: FileChange) => f.x === '?'

/** A one-letter mark for a column, as `git status -s` shows it. */
export const mark = (c: string) => (c === '?' ? 'U' : c)

/** `owner/repo` of a GitHub remote URL, https or ssh; empty for any other host. */
export function githubRepo(url: string): string {
  const found = /github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url.trim())
  return found ? `${found[1]}/${found[2]}` : ''
}

/** Keeps the first `max` lines of a long text and says whether it cut. */
export function firstLines(text: string, max: number): { text: string; isCut: boolean } {
  const lines = text.split('\n')
  return lines.length > max
    ? { text: lines.slice(0, max).join('\n'), isCut: true }
    : { text, isCut: false }
}
