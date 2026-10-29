import type { Touched } from '../types'
import { norm, same } from './paths'

// The files Claude writes with its own file tools, followed so the pane can
// say which changes are Claude's and put a file back as it was before.
// Writes made from a shell (Bash, PowerShell) are not seen here.

/** The tools that write a file, and the argument naming it. */
const WRITERS: Readonly<Record<string, string>> = { Edit: 'file_path', Write: 'file_path', NotebookEdit: 'notebook_path' }

/** The file a tool call writes, `''` for a call that writes none. */
export function writtenPath(tool: string, input: object): string {
  const key = WRITERS[tool]
  const path = key === undefined ? undefined : (input as Record<string, unknown>)[key]

  return typeof path === 'string' && path !== '' ? norm(path) : ''
}

/** The most text kept to put a file back: a larger file is followed but cannot be undone. */
export const MAX_ORIGINAL_CHARS = 400_000
/** The most kept in all; the oldest files' originals are let go first. */
export const MAX_ORIGINALS_CHARS = 4_000_000
export const MAX_TOUCHED = 200

/** A short fingerprint of a text (FNV-1a), to tell whether a file is still as Claude left it. */
export function hash(text: string): string {
  let h = 0x811c9dc5
  for (let at = 0; at < text.length; at += 1) {
    h ^= text.charCodeAt(at)
    h = Math.imul(h, 0x01000193)
  }

  return `${text.length}:${(h >>> 0).toString(36)}`
}

export const key = (path: string): string => norm(path).toLowerCase()

/** The list after Claude wrote `path` once more, the latest first. */
export function touch(list: readonly Touched[], path: string, at: number, isNew: boolean, canUndo: boolean): Touched[] {
  const held = list.find(one => same(one.path, path))
  const next: Touched = held === undefined ? { path, edits: 1, at, isNew, isAsLeft: true, canUndo } : { ...held, edits: held.edits + 1, at, isAsLeft: true }

  return [next, ...list.filter(one => one !== held)].slice(0, MAX_TOUCHED)
}

export const findTouched = (list: readonly Touched[], path: string): Touched | undefined => list.find(one => same(one.path, path))

/** Originals kept under the budget: the files Claude wrote last keep theirs. */
export function trimOriginals<T extends { text: string | null }>(originals: Readonly<Record<string, T>>, order: readonly Touched[]): Record<string, T> {
  const kept: Record<string, T> = {}
  let used = 0
  for (const one of order) {
    const k = key(one.path)
    const held = originals[k]
    if (held === undefined) continue
    used += held.text?.length ?? 0
    if (used > MAX_ORIGINALS_CHARS) break
    kept[k] = held
  }

  return kept
}
