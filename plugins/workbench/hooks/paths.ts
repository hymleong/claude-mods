// Paths as the pane keeps them: forward slashes, no trailing slash, whatever
// the platform printed. Windows hands out `C:\Users\me`, git `C:/Users/me`;
// both are `C:/Users/me` here, and a drive letter compares without case.

const DRIVE = /^[A-Za-z]:\//

/** One spelling of a path: `/` separators, no doubled or trailing slash (roots keep theirs). */
export function norm(path: string): string {
  if (path === '') return ''
  const unc = path.startsWith('\\\\') || path.startsWith('//')
  let out = path.replace(/\\/g, '/').replace(/\/{2,}/g, '/')
  if (unc) out = `/${out}`
  if (/^[A-Za-z]:$/.test(out)) out = `${out}/`
  if (out.length > 1 && out.endsWith('/') && !/^[A-Za-z]:\/$/.test(out)) out = out.slice(0, -1)

  return DRIVE.test(out) ? `${out[0]!.toUpperCase()}${out.slice(1)}` : out
}

const fold = (path: string): string => (DRIVE.test(path) || path.startsWith('//') ? path.toLowerCase() : path)

export function same(a: string, b: string): boolean {
  return fold(norm(a)) === fold(norm(b))
}

/** Whether `path` is `root` or lies inside it. */
export function isUnder(path: string, root: string): boolean {
  const p = fold(norm(path))
  const r = fold(norm(root))
  if (p === '' || r === '') return false
  if (p === r) return true

  return p.startsWith(r.endsWith('/') ? r : `${r}/`)
}

export function join(root: string, ...parts: string[]): string {
  return norm([root, ...parts.filter(part => part !== '')].join('/'))
}

export function base(path: string): string {
  const n = norm(path)
  const cut = n.lastIndexOf('/')

  return cut < 0 || cut === n.length - 1 ? n : n.slice(cut + 1)
}

export function dir(path: string): string {
  const n = norm(path)
  const cut = n.lastIndexOf('/')
  if (cut < 0) return ''
  if (cut === 0) return '/'

  return norm(n.slice(0, cut + (/^[A-Za-z]:$/.test(n.slice(0, cut)) ? 1 : 0)))
}

/** `path` relative to `root`, or `path` itself when it is not inside it. */
export function rel(path: string, root: string): string {
  const p = norm(path)
  const r = norm(root)
  if (!isUnder(p, r)) return p
  if (same(p, r)) return ''

  return p.slice(r.endsWith('/') ? r.length : r.length + 1)
}

/** A path as the person's own shell would print it. */
export function native(path: string, isWindows: boolean): string {
  return isWindows ? norm(path).replace(/\//g, '\\') : norm(path)
}

/** `~` for the home folder, and the head of a long path cut away. */
export function short(path: string, home: string, max: number): string {
  let shown = norm(path)
  if (home !== '' && isUnder(shown, home)) shown = `~${shown.slice(norm(home).length)}`
  if (shown.length <= max) return shown

  return `…${shown.slice(shown.length - max + 1)}`
}
