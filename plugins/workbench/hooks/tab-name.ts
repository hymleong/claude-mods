// What a terminal tab is called after the command that keeps running in it, as
// Windows Terminal names a tab after the program in it: `npm run dev` → `dev`,
// `python app.py` → `app.py`, `docker compose up` → `compose up`.

/** The longest a tab's name gets. */
export const MAX_TAB_NAME = 18

/** Plain words that, right after a tool, name what it does rather than what it works on. */
const SUBCOMMANDS = new Set(['start', 'dev', 'run', 'serve', 'server', 'build', 'watch', 'up', 'preview', 'test', 'runserver'])

const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun'])
/** What npm runs as a script without `run`. */
const NPM_SCRIPTS = new Set(['start', 'test', 'stop', 'restart'])
/** The package managers' own commands: anything else after pnpm, yarn or bun is a script's name. */
const PM_BUILTINS = new Set([
  'install', 'i', 'ci', 'add', 'remove', 'rm', 'uninstall', 'update', 'up', 'upgrade', 'outdated', 'audit', 'init', 'create',
  'publish', 'pack', 'link', 'unlink', 'login', 'logout', 'config', 'cache', 'list', 'ls', 'info', 'view', 'why', 'version',
  'help', 'store', 'prune', 'dedupe', 'rebuild', 'setup', 'env', 'global', 'workspace', 'workspaces',
])
/** Runners of a package's own command: npx vite, pnpm dlx, bunx. */
const RUNNERS = new Set(['npx', 'bunx', 'pnpx'])
/** Interpreters that run a file named after them. */
const INTERPRETERS = new Set(['python', 'python3', 'py', 'node', 'deno', 'ruby', 'php', 'perl', 'tsx', 'ts-node'])
/** npx options that take a value. */
const RUNNER_VALUED = new Set(['-p', '--package', '-c', '--call'])

/** A command's words, quotes kept together and removed. */
function words(text: string): string[] {
  return (text.match(/"[^"]*"?|'[^']*'?|\S+/g) ?? []).map(word => word.replace(/^["']|["']$/g, ''))
}

/** A program's name without its folder, extension or version: `C:\tools\ngrok.exe` → `ngrok`, `@scope/pkg@1` → `pkg`. */
function bare(word: string): string {
  const last = word.replace(/\\/g, '/').split('/').pop() ?? word
  const noVersion = last.replace(/(.)@.*$/, '$1')

  return noVersion.replace(/\.(exe|cmd|bat|ps1)$/i, '')
}

/** A file's name without its folder: `src/server.js` → `server.js`. */
const fileName = (word: string): string => word.replace(/\\/g, '/').split('/').pop() ?? word

const isFlag = (word: string): boolean => word.startsWith('-')

/** A word that reads as a subcommand: a plain lowercase word, no path or extension. */
const isPlainWord = (word: string | undefined): word is string => word !== undefined && /^[a-z][a-z0-9:-]*$/.test(word)

/** `tool sub` when the next word is one of the known subcommands, else the tool. */
function withSub(tool: string, next: string | undefined): string {
  return isPlainWord(next) && SUBCOMMANDS.has(next) ? `${tool} ${next}` : tool
}

/** What `npx <tool> ...` is called: the tool, and its subcommand if it has one. */
function runnerName(args: readonly string[]): string {
  let at = 0
  while (at < args.length && isFlag(args[at]!)) at += RUNNER_VALUED.has(args[at]!) ? 2 : 1
  const tool = args[at]
  if (tool === undefined) return ''

  return withSub(bare(tool), args[at + 1])
}

/** The name for one command, without the chain around it. */
function nameOne(segment: string): string {
  const all = words(segment.trim().replace(/^[&.]\s+/, ''))
  if (all.length === 0) return ''
  const program = bare(all[0]!).toLowerCase()
  const args = all.slice(1)
  const plain = args.filter(word => !isFlag(word))

  if (RUNNERS.has(program)) return runnerName(args)
  if (PACKAGE_MANAGERS.has(program)) {
    const [first, second] = plain
    if (first === undefined) return program
    if (first === 'run' || first === 'run-script') return second ?? program
    if (first === 'dlx' || first === 'exec' || first === 'x') return runnerName(args.slice(args.indexOf(first) + 1))
    if (program === 'npm') return NPM_SCRIPTS.has(first) ? first : `npm ${first}`
    if (PM_BUILTINS.has(first)) return `${program} ${first}`

    return first
  }
  if (INTERPRETERS.has(program)) {
    // `python -m http.server` runs a module: the module is the name.
    const module = args.indexOf('-m')
    if (module >= 0 && args[module + 1] !== undefined) return args[module + 1]!
    // deno task dev runs a task, as npm run does; deno run x.ts a file.
    if (program === 'deno' && plain[0] === 'task') return plain[1] ?? 'deno task'
    const rest = program === 'deno' && plain[0] === 'run' ? plain.slice(1) : plain
    const file = rest[0]
    if (file === undefined) return program
    // `python manage.py runserver`, `php artisan serve`: the script's subcommand says what runs.
    const next = rest[1]
    if (isPlainWord(next) && !next.includes('.')) return next

    return fileName(file)
  }
  if (program === 'docker' && plain[0] === 'compose') return withSub('compose', plain[1])
  if (program === 'docker-compose') return withSub('compose', plain[0])

  return withSub(program, plain[0])
}

/** `cd client`, `Set-Location ./client`, `pushd client`: the folder a chain moves into. */
function cdTarget(segment: string): string | undefined {
  const [verb, target] = words(segment.trim())
  if (verb === undefined || target === undefined) return undefined

  return /^(cd|chdir|sl|set-location|pushd|push-location)$/i.test(verb) ? target : undefined
}

export type TabName = {
  /** What the command is called, cut to fit a tab; `''` when nothing could be read from it. */
  name: string
  /** The folder the command line moved into first (`cd client; npm run dev`), as typed. */
  cdTo?: string
}

/**
 * What a tab running `cmd` is called. Of a chain (`;`, `&&`, `||`) the last command names
 * it, as the one left running; of a pipeline, its first stage, the one producing the output.
 */
export function tabName(cmd: string): TabName {
  const segments = cmd.split(/;|&&|\|\|/).map(one => one.trim()).filter(one => one !== '')
  let cdTo: string | undefined
  for (const segment of segments.slice(0, -1)) cdTo = cdTarget(segment) ?? cdTo
  const last = segments[segments.length - 1] ?? ''
  const first = last.split('|')[0] ?? last
  const name = nameOne(first)
  const cut = name.length > MAX_TAB_NAME ? `${name.slice(0, MAX_TAB_NAME - 1)}…` : name

  return cdTo === undefined ? { name: cut } : { name: cut, cdTo }
}

/** `name`, or `name 2`, `name 3`, ... so it differs from every one of `taken`. */
export function unique(name: string, taken: readonly string[]): string {
  if (!taken.includes(name)) return name
  let n = 2
  while (taken.includes(`${name} ${n}`)) n += 1

  return `${name} ${n}`
}

/**
 * A name the person gave the tab by typing it: `title frontend`, or PowerShell's own
 * `$Host.UI.RawUI.WindowTitle = "frontend"`. `''` for `title` alone, which hands naming
 * back to the commands; `undefined` when the line is not a rename.
 */
export function typedTitle(line: string): string | undefined {
  const text = line.trim()
  const titled = /^title(?:\s+(.*))?$/i.exec(text)
  if (titled !== null) return (titled[1] ?? '').trim().replace(/^["']|["']$/g, '')
  const host = /^\$host\.ui\.rawui\.windowtitle\s*=\s*(.+)$/i.exec(text)
  if (host !== null) return host[1]!.trim().replace(/^["']|["']$/g, '')

  return undefined
}
