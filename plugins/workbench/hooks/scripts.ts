import type { Script } from '../types'

// The tasks a project already declares, found from its own files: what the
// person would otherwise type into a terminal by hand.

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

/** A folder as read for scripts: its file names, and the text of the few files that declare tasks. */
export type Folder = { path: string; rel: string; names: readonly string[]; files: Readonly<Record<string, string>> }

/** The files whose text `detect` reads, when a folder has them. */
export const TASK_FILES = ['package.json', 'Makefile', 'makefile', 'justfile', 'Justfile', 'deno.json', 'deno.jsonc'] as const

/** Which package manager a project uses: its `packageManager` field, else its lockfile. */
export function packageManager(names: readonly string[], packageJson = ''): PackageManager {
  const declared = /"packageManager"\s*:\s*"(npm|pnpm|yarn|bun)@/.exec(packageJson)?.[1]
  if (declared !== undefined) return declared as PackageManager
  if (names.includes('pnpm-lock.yaml')) return 'pnpm'
  if (names.includes('bun.lockb') || names.includes('bun.lock')) return 'bun'
  if (names.includes('yarn.lock')) return 'yarn'

  return 'npm'
}

/** A task name as one shell word. */
const word = (name: string): string => (/^[\w:.@/-]+$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`)

export function runCommand(pm: PackageManager, name: string): string {
  if (pm === 'yarn') return `yarn ${word(name)}`

  return `${pm} run ${word(name)}`
}

const FIRST = ['dev', 'start', 'serve', 'watch', 'build', 'test', 'lint', 'preview']

const rank = (name: string): number => {
  const at = FIRST.indexOf(name.split(':')[0] ?? name)

  return at < 0 ? FIRST.length : at
}

/** `package.json`'s scripts, the everyday ones first. */
export function fromPackageJson(text: string): string[] {
  let scripts: unknown
  try {
    scripts = (JSON.parse(text) as { scripts?: unknown }).scripts
  } catch {
    return []
  }
  if (typeof scripts !== 'object' || scripts === null) return []
  const names = Object.keys(scripts).filter(name => !/^(pre|post)/.test(name) || !(name.replace(/^(pre|post)/, '') in scripts))

  return names.map((name, at) => ({ name, at })).sort((a, b) => rank(a.name) - rank(b.name) || a.at - b.at).map(one => one.name)
}

/** A Makefile's targets: plain names, not special (`.PHONY`), patterns (`%.o`) or variables. */
export function fromMakefile(text: string): string[] {
  const found: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9][A-Za-z0-9_.-]*)\s*:(?![:=])/.exec(line)
    if (match?.[1] !== undefined && !found.includes(match[1])) found.push(match[1])
  }

  return found
}

/** A justfile's recipes: unindented `name args:` lines, private (`_name`) ones left out. */
export function fromJustfile(text: string): string[] {
  const found: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = /^@?([A-Za-z0-9][A-Za-z0-9_-]*)(?:\s+[^:]*?)?:(?![:=])/.exec(line)
    if (match?.[1] !== undefined && !found.includes(match[1])) found.push(match[1])
  }

  return found
}

/** `deno.json`'s tasks (comments in a `.jsonc` are dropped first). */
export function fromDenoJson(text: string): string[] {
  try {
    const tasks = (JSON.parse(text.replace(/^\s*\/\/.*$/gm, '')) as { tasks?: unknown }).tasks

    return typeof tasks === 'object' && tasks !== null ? Object.keys(tasks) : []
  } catch {
    return []
  }
}

const MAX_PER_KIND = 12

/** Every task a folder declares, as one-click scripts. */
export function detect(folder: Folder): Script[] {
  const { names, files } = folder
  const found: Script[] = []
  const add = (kind: string, label: string, cmd: string): void => {
    found.push({ id: `${folder.rel}|${kind}|${label}`, label, cmd, cwd: folder.path, kind, folder: folder.rel })
  }
  const pkg = files['package.json']
  if (pkg !== undefined) {
    const pm = packageManager(names, pkg)
    for (const name of fromPackageJson(pkg).slice(0, MAX_PER_KIND)) add(pm, name, runCommand(pm, name))
  }
  const deno = files['deno.json'] ?? files['deno.jsonc']
  if (deno !== undefined) for (const name of fromDenoJson(deno).slice(0, MAX_PER_KIND)) add('deno', name, `deno task ${word(name)}`)
  const make = files.Makefile ?? files.makefile
  if (make !== undefined) for (const name of fromMakefile(make).slice(0, MAX_PER_KIND)) add('make', name, `make ${name}`)
  const just = files.justfile ?? files.Justfile
  if (just !== undefined) for (const name of fromJustfile(just).slice(0, MAX_PER_KIND)) add('just', name, `just ${name}`)
  if (names.includes('Cargo.toml')) {
    add('cargo', 'run', 'cargo run')
    add('cargo', 'test', 'cargo test')
    add('cargo', 'build', 'cargo build')
  }
  if (names.includes('go.mod')) {
    add('go', 'run', 'go run .')
    add('go', 'test', 'go test ./...')
  }
  if (names.some(name => /^(docker-)?compose\.ya?ml$/.test(name))) add('compose', 'up', 'docker compose up')
  if (names.some(name => /\.(csproj|fsproj|sln)$/.test(name))) {
    add('dotnet', 'run', 'dotnet run')
    add('dotnet', 'watch', 'dotnet watch')
    add('dotnet', 'test', 'dotnet test')
  }
  if (names.includes('manage.py')) add('django', 'runserver', 'python manage.py runserver')

  return found
}

/** Folders under a project worth looking in for scripts of their own (a monorepo's packages). */
export const isProjectDir = (name: string): boolean =>
  !name.startsWith('.') && !['node_modules', 'dist', 'build', 'target', 'vendor', 'out', 'coverage', 'bin', 'obj'].includes(name)
