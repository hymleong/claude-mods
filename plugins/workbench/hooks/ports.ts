import type { PortKind, PortRow, Probe } from '../types'

// What is listening on this machine, read from the platform's own tools and
// sorted into what a developer started and what the system did.

export type Listener = { address: string; port: number; pid: number; name?: string }

export type Proc = { pid: number; ppid: number; name: string; cmd: string; startedAt: number; memBytes: number }

/** The address and port of `0.0.0.0:3000`, `[::1]:5173`, `*:8080`. */
function splitEndpoint(endpoint: string): { address: string; port: number } | undefined {
  const cut = endpoint.lastIndexOf(':')
  if (cut <= 0) return undefined
  const port = Number(endpoint.slice(cut + 1))
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return undefined
  const address = endpoint.slice(0, cut).replace(/^\[|\]$/g, '')

  return { address: address === '*' ? '0.0.0.0' : address, port }
}

/**
 * `netstat -ano`: the TCP rows that listen. A listening socket has no peer,
 * which netstat prints as `0.0.0.0:0` or `[::]:0`: that, not the state's
 * name, is read, since the name is in the system's language.
 */
export function parseNetstat(text: string): Listener[] {
  const found: Listener[] = []
  for (const raw of text.split(/\r?\n/)) {
    const cols = raw.trim().split(/\s+/)
    if (cols[0]?.toUpperCase() !== 'TCP' || cols.length < 5) continue
    const local = splitEndpoint(cols[1] ?? '')
    const remote = cols[2] ?? ''
    const pid = Number(cols[cols.length - 1])
    if (local === undefined || !/:0$/.test(remote) || !Number.isInteger(pid)) continue
    found.push({ ...local, pid })
  }

  return found
}

/** `lsof -nP -iTCP -sTCP:LISTEN -F pcn`: a `p` line per process, then its `c` name and `n` endpoints. */
export function parseLsof(text: string): Listener[] {
  const found: Listener[] = []
  let pid = 0
  let name = ''
  for (const line of text.split(/\r?\n/)) {
    const tag = line[0]
    const value = line.slice(1)
    if (tag === 'p') pid = Number(value)
    else if (tag === 'c') name = value
    else if (tag === 'n') {
      const local = splitEndpoint(value.split('->')[0] ?? '')
      if (local !== undefined && pid > 0) found.push({ ...local, pid, name })
    }
  }

  return found
}

const field = (row: unknown, at: number): unknown => (Array.isArray(row) ? row[at] : undefined)
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
const str = (value: unknown): string => (typeof value === 'string' ? value : '')

/** The hidden host's process table (`processScript`): `[pid, ppid, name, cmd, startedAt, memBytes]` rows. */
export function parseProcessJson(text: string): Map<number, Proc> {
  const procs = new Map<number, Proc>()
  let rows: unknown
  try {
    rows = JSON.parse(text)
  } catch {
    return procs
  }
  // One row alone comes back unwrapped.
  const list = Array.isArray(rows) && rows.length > 0 && !Array.isArray(rows[0]) ? [rows] : rows
  if (!Array.isArray(list)) return procs
  for (const row of list) {
    const pid = num(field(row, 0))
    procs.set(pid, {
      pid,
      ppid: num(field(row, 1)),
      name: str(field(row, 2)),
      cmd: str(field(row, 3)),
      startedAt: num(field(row, 4)),
      memBytes: num(field(row, 5)),
    })
  }

  return procs
}

/** `tasklist /fo csv /nh`: names and memory only, for when no PowerShell can be asked. */
export function parseTasklist(text: string): Map<number, Proc> {
  const procs = new Map<number, Proc>()
  for (const line of text.split(/\r?\n/)) {
    const cells = [...line.matchAll(/"([^"]*)"/g)].map(match => match[1] ?? '')
    const pid = Number(cells[1])
    if (cells.length < 5 || !Number.isInteger(pid)) continue
    const kb = Number((cells[4] ?? '').replace(/[^\d]/g, ''))
    procs.set(pid, { pid, ppid: 0, name: cells[0] ?? '', cmd: '', startedAt: 0, memBytes: kb * 1024 })
  }

  return procs
}

/** `ps -axo pid=,ppid=,rss=,command=` (rss in KB). */
export function parsePs(text: string): Map<number, Proc> {
  const procs = new Map<number, Proc>()
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line)
    if (match === null) continue
    const pid = Number(match[1])
    const cmd = match[4] ?? ''
    const program = (cmd.split(/\s+/)[0] ?? '').split('/').pop() ?? ''
    procs.set(pid, { pid, ppid: Number(match[2]), name: program, cmd, startedAt: 0, memBytes: Number(match[3]) * 1024 })
  }

  return procs
}

/** A process name as people say it: no `.exe`, lower case. */
export const bare = (name: string): string => name.replace(/\.exe$/i, '').toLowerCase()

const DEV = new Set([
  'node', 'nodemon', 'bun', 'deno', 'python', 'python3', 'pythonw', 'py', 'uvicorn', 'gunicorn', 'hypercorn',
  'flask', 'java', 'javaw', 'dotnet', 'ruby', 'rails', 'puma', 'php', 'php-cgi', 'go', 'air', 'cargo',
  'nginx', 'httpd', 'caddy', 'traefik', 'postgres', 'mysqld', 'mariadbd', 'redis-server', 'memurai',
  'mongod', 'mongos', 'clickhouse', 'docker', 'dockerd', 'com.docker.backend', 'com.docker.proxy',
  'wslrelay', 'vpnkit', 'hugo', 'jekyll', 'ngrok', 'cloudflared', 'esbuild', 'iisexpress', 'jupyter',
  'streamlit', 'gradle', 'mvn', 'elixir', 'beam.smp', 'erl', 'dart', 'flutter', 'zola', 'livereload',
])

const SYSTEM = new Set([
  'system', 'idle', 'system idle process', 'svchost', 'lsass', 'wininit', 'services', 'spoolsv', 'smss',
  'csrss', 'winlogon', 'searchindexer', 'searchhost', 'msmpeng', 'nissrv', 'securityhealthservice',
  'launchd', 'mdnsresponder', 'rapportd', 'controlce', 'controlcenter', 'sharingd', 'systemd',
  'systemd-resolved', 'cupsd', 'avahi-daemon', 'sshd', 'remoted', 'identityservicesd',
])

// Command lines that say "a developer started this" whatever runs them.
const DEV_HINTS = /node_modules|[\\/]\.venv[\\/]|manage\.py|\b(vite|next|nuxt|astro|webpack|serve|dev|runserver|--port)\b/i

// Desktop apps that listen for their own helpers: never what a developer means by a server.
const APPS = new Set(['claude', 'code', 'cursor', 'windsurf', 'electron', 'slack', 'discord', 'spotify', 'teams', 'msedgewebview2', 'chrome', 'msedge', 'firefox'])

export function classify(name: string, cmd: string): PortKind {
  const program = bare(name)
  if (SYSTEM.has(program)) return 'system'
  if (APPS.has(program)) return 'other'
  if (DEV.has(program) || /^python\d/.test(program) || /^php\d/.test(program)) return 'dev'

  return DEV_HINTS.test(cmd) ? 'dev' : 'other'
}

const FROM_COMMAND: readonly [RegExp, string][] = [
  [/\bvite\b/i, 'Vite'],
  [/\bnext(\.js)?[\\/ ]|[\\/]next[\\/]dist|\bnext (dev|start)\b/i, 'Next.js'],
  [/\bnuxt/i, 'Nuxt'],
  [/\bastro\b/i, 'Astro'],
  [/\bremix\b/i, 'Remix'],
  [/svelte-kit|sveltekit/i, 'SvelteKit'],
  [/react-scripts/i, 'Create React App'],
  [/@angular|\bng serve\b/i, 'Angular'],
  [/storybook/i, 'Storybook'],
  [/webpack/i, 'webpack'],
  [/@nestjs|\bnest start\b/i, 'NestJS'],
  [/manage\.py\s+runserver/i, 'Django'],
  [/\buvicorn\b/i, 'Uvicorn'],
  [/\bgunicorn\b/i, 'Gunicorn'],
  [/\bflask\b/i, 'Flask'],
  [/\bstreamlit\b/i, 'Streamlit'],
  [/\bjupyter/i, 'Jupyter'],
  [/http\.server/i, 'http.server'],
  [/\brails\b/i, 'Rails'],
  [/\bpuma\b/i, 'Puma'],
  [/artisan\s+serve/i, 'Laravel'],
  [/\bphp\b.*\s-S\s/i, 'PHP server'],
  [/\bhugo\b/i, 'Hugo'],
  [/\bjekyll\b/i, 'Jekyll'],
  [/\bnodemon\b/i, 'nodemon'],
]

const FROM_PROGRAM: Record<string, string> = {
  postgres: 'PostgreSQL',
  mysqld: 'MySQL',
  mariadbd: 'MariaDB',
  'redis-server': 'Redis',
  memurai: 'Redis',
  mongod: 'MongoDB',
  nginx: 'nginx',
  httpd: 'Apache',
  caddy: 'Caddy',
  wslrelay: 'WSL',
  'com.docker.backend': 'Docker',
  dockerd: 'Docker',
  iisexpress: 'IIS Express',
}

export type Answer = { server: string; poweredBy: string; body: string }

/** What serves a port, from its command line and, where it answered HTTP, its headers and page. */
export function frameworkOf(name: string, cmd: string, answer?: Answer): string {
  if (answer !== undefined) {
    if (answer.body.includes('/@vite/client')) return 'Vite'
    if (answer.body.includes('__NEXT_DATA__') || answer.body.includes('/_next/') || /next\.js/i.test(answer.poweredBy)) return 'Next.js'
    if (answer.body.includes('__nuxt')) return 'Nuxt'
  }
  for (const [pattern, label] of FROM_COMMAND) if (pattern.test(cmd)) return label
  const program = FROM_PROGRAM[bare(name)]
  if (program !== undefined) return program
  if (answer !== undefined) {
    const server = answer.server.toLowerCase()
    if (/express/i.test(answer.poweredBy)) return 'Express'
    if (server.includes('werkzeug')) return 'Flask'
    if (server.includes('wsgiserver')) return 'Django'
    if (server.includes('uvicorn')) return 'Uvicorn'
    if (server.includes('simplehttp')) return 'http.server'
    if (server.includes('kestrel')) return 'ASP.NET'
    if (/php/i.test(answer.poweredBy)) return 'PHP'
  }

  return ''
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** A page's `<title>`, decoded and cut to fit a row. */
export function titleOf(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  if (match === null) return ''
  const text = (match[1] ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&(\w+);/g, (whole, name: string) => ENTITIES[name] ?? whole)
    .replace(/\s+/g, ' ')
    .trim()

  return text.length > 80 ? `${text.slice(0, 79)}…` : text
}

const SECRET = /((?:^|\s|--?)[\w.-]*?(?:token|secret|passw(?:or)?d|pwd|api[-_]?key|access[-_]?key|private[-_]?key|auth|credentials?)\s*(?:=|:|\s+))("[^"]*"|'[^']*'|[^\s"']+)/gi
const URL_PASSWORD = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi

/** A command line fit to show: values of anything named like a secret, and passwords in URLs, masked. */
export function maskArgs(cmd: string): string {
  const masked = cmd.replace(URL_PASSWORD, '$1***@').replace(SECRET, '$1***')

  return masked.length > 400 ? `${masked.slice(0, 399)}…` : masked
}

const LOOPBACK = /^(127\.|::1$|localhost$)/

export const isExposed = (addresses: readonly string[]): boolean =>
  addresses.some(address => !LOOPBACK.test(address))

/** The host a probe of the port should ask, by what it is bound to. */
export function probeHost(addresses: readonly string[]): string {
  if (addresses.some(a => a === '127.0.0.1' || a === '0.0.0.0')) return '127.0.0.1'
  if (addresses.some(a => a === '::1' || a === '::')) return '[::1]'
  const first = addresses[0] ?? '127.0.0.1'

  return first.includes(':') ? `[${first}]` : first
}

/** Ports that speak something other than HTTP: asking them for a page only makes noise in their logs. */
const NOT_HTTP = new Set([21, 22, 25, 53, 135, 139, 445, 1433, 1521, 3306, 3389, 5432, 5672, 6379, 9042, 11211, 27017, 27018, 5900])

const DATABASES = new Set(['postgres', 'mysqld', 'mariadbd', 'redis-server', 'memurai', 'mongod', 'mongos'])

export const isProbed = (row: Pick<PortRow, 'port' | 'kind' | 'name'>): boolean =>
  row.kind === 'dev' && !NOT_HTTP.has(row.port) && !DATABASES.has(bare(row.name))

/** Which workbench terminal's process tree a process belongs to; `''` for none. */
export function termOf(pid: number, procs: ReadonlyMap<number, Proc>, hosts: ReadonlyMap<number, string>): string {
  let at = pid
  for (let depth = 0; depth < 16 && at > 4; depth += 1) {
    const term = hosts.get(at)
    if (term !== undefined) return term
    const next = procs.get(at)?.ppid ?? 0
    if (next === at) break
    at = next
  }

  return ''
}

const HISTORY = 24

/**
 * The listeners as the view's rows: one per process and port, its IPv4 and
 * IPv6 sockets together, what each process is, and what the last scan knew
 * of it (its probes) carried over.
 */
export function toRows(
  listeners: readonly Listener[],
  procs: ReadonlyMap<number, Proc>,
  hosts: ReadonlyMap<number, string>,
  previous: readonly PortRow[],
): PortRow[] {
  const byKey = new Map<string, { port: number; pid: number; addresses: string[]; name: string }>()
  for (const one of listeners) {
    const key = `${one.pid}:${one.port}`
    const held = byKey.get(key)
    if (held === undefined) byKey.set(key, { port: one.port, pid: one.pid, addresses: [one.address], name: one.name ?? '' })
    else if (!held.addresses.includes(one.address)) held.addresses.push(one.address)
  }
  const before = new Map(previous.map(row => [row.key, row]))
  const rows: PortRow[] = []
  for (const [key, one] of byKey) {
    const proc = procs.get(one.pid)
    const name = bare(proc?.name || one.name || (one.pid === 4 ? 'System' : `pid ${one.pid}`))
    const cmd = proc?.cmd ?? ''
    const termId = termOf(one.pid, procs, hosts)
    const kind = termId !== '' ? 'dev' : classify(name, cmd)
    const held = before.get(key)
    rows.push({
      key,
      port: one.port,
      addresses: one.addresses.sort(),
      pid: one.pid,
      name,
      kind,
      cmd: maskArgs(cmd),
      startedAt: proc?.startedAt ?? 0,
      memMb: Math.round((proc?.memBytes ?? 0) / 1048576),
      termId,
      framework: frameworkOf(name, cmd) || held?.framework || '',
      probe: held?.probe ?? null,
      history: held?.history ?? [],
      isExposed: isExposed(one.addresses),
    })
  }
  const rank = (row: PortRow): number => (row.termId !== '' ? 0 : row.kind === 'dev' ? 1 : row.kind === 'other' ? 2 : 3)

  return rows.sort((a, b) => rank(a) - rank(b) || a.port - b.port || a.pid - b.pid)
}

/** A row with a probe's answer folded in: its latest, its history, and the framework it gave away. */
export function withProbe(row: PortRow, probe: Probe | null, answer?: Answer): PortRow {
  const history = probe === null ? row.history : [...row.history, probe.ms].slice(-HISTORY)
  const framework = answer === undefined ? row.framework : frameworkOf(row.name, row.cmd, answer) || row.framework

  return { ...row, probe, history, framework }
}

/** Which rows a filter shows. */
export const shown = (rows: readonly PortRow[], filter: 'dev' | 'all'): PortRow[] =>
  filter === 'all' ? [...rows] : rows.filter(row => row.kind === 'dev')

/** How long a process has run, said briefly. */
export function age(now: number, since: number): string {
  if (since <= 0 || now < since) return ''
  const s = Math.floor((now - since) / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ${m % 60}m`

  return `${Math.floor(h / 24)}d`
}
