import { atom, memberOf, read, update } from 'claude-code'
import type { Elements, EngineInterface, HookStream, ProcessSpawnChunk, ProcessSpawnResult, Register, RenderSurface, Timer } from 'claude-code'

import type {
  Block,
  Styled,
  BranchPull,
  Entry,
  GitFile,
  GitSection,
  Hit,
  Listing,
  Mood,
  OpenFile,
  PortRow,
  Ports,
  PullList,
  Repo,
  Runs,
  Script,
  Search,
  Tab,
  Term,
} from '../types'
import type { EditorProps } from './editor'
import {
  LOG_ARGS,
  PULL_FIELDS,
  RUN_FIELDS,
  commitArgs,
  diffArgs,
  fitHunks,
  isChanged,
  isSha,
  isStaged,
  moreLines,
  parseCommit,
  parseJobs,
  parseLog,
  parseNameStatus,
  parsePull,
  parsePulls,
  parseRuns,
  parseStatus,
  runPrompt,
  tail,
} from './git'
import { base, dir, isUnder, join, norm, rel, same } from './paths'
import {
  isProbed,
  parseLsof,
  parseNetstat,
  parseProcessJson,
  parsePs,
  parseTasklist,
  probeHost,
  titleOf,
  toRows,
  withProbe,
} from './ports'
import type { Listener, Proc } from './ports'
import { TASK_FILES, detect, isProjectDir } from './scripts'
import { DONE_MS, OOPS_MS, moodOfTool } from './mood'
import { HOST_BOOT, HOST_SCRIPT, processScript } from './shell-host'
import { FRESH, feed, partial } from './stream'
import { tabName, typedTitle, unique } from './tab-name'
import type { StreamEvent, StreamState } from './stream'
import type { InputProps } from './terminal-input'
import { VIEW_LINES } from './views/files'
import type { Actions, Kit, Model, SyncVerb } from './views/model'
import { band, pane } from './views/pane'

type Engine = EngineInterface

// Every call on the engine lives in this file: the engine follows `$` into
// functions declared in the hooks module and never across an import, and
// `read`/`update` must name an atom declared here. What needs no engine is
// in `git.ts`, `ports.ts`, `scripts.ts`, `stream.ts` and `views/`.

const PANE = 'workbench'
const TITLE = 'Workbench'
const COLUMNS = 80
const EDITOR = 'editor'
const INPUT = 'input-'

const GIT_EVERY_MS = 3_000
const PORTS_EVERY_MS = 5_000
const PROBE_EVERY_MS = 10_000
const SLOW_EVERY_MS = 60_000
const BEAT_EVERY_MS = 30_000
const FLUSH_MS = 150
const ROOTS_EVERY = 10
const MAX_REPOS = 8
const MAX_TERMS = 8
/** Lines a block keeps in memory, and in the session's state (the open or latest block, and the others). */
const KEPT_LINES = 5_000
const STATE_LINES = 400
const OLD_STATE_LINES = 40
const STATE_BLOCKS = 12
const MAX_LINE = 1_000
const MAX_FILE_BYTES = 1_000_000
/** The most of a file the editor takes: its text rides in the editor's props, which have a size limit. */
const MAX_EDIT_CHARS = 90_000
const MAX_FOUND = 200
const HISTORY_KEPT = 200
const HISTORY_KEY = 'history'
/** How long a command runs before its tab takes its name: long enough that ls and cd never rename one. */
const RENAME_AFTER_MS = 2_000
const SECTIONS: readonly GitSection[] = ['changes', 'files', 'history', 'pulls', 'actions']
const TABS: readonly Tab[] = ['git', 'term', 'ports']

// ── what the pane draws from: the host keeps these for the session ─────────

const isOn = atom({ plugin: 'workbench', key: 'isOn' } as const, false)
const tab = atom({ plugin: 'workbench', key: 'tab' } as const, 'git')
const scheme = atom({ plugin: 'workbench', key: 'scheme' } as const, 'dark')
const mood = atom({ plugin: 'workbench', key: 'mood' } as const, 'sleep')
const workspace = atom({ plugin: 'workbench', key: 'workspace' } as const, '')
const counts = atom({ plugin: 'workbench', key: 'counts' } as const, { changed: 0, running: 0, ports: 0 })
const repos = atom({ plugin: 'workbench', key: 'repos' } as const, [])
const repo = atom({ plugin: 'workbench', key: 'repo' } as const, '')
const gitSection = atom({ plugin: 'workbench', key: 'gitSection' } as const, 'changes')
const diff = atom({ plugin: 'workbench', key: 'diff' } as const, null)
const listing = atom({ plugin: 'workbench', key: 'listing' } as const, null)
const file = atom({ plugin: 'workbench', key: 'file' } as const, null)
const search = atom({ plugin: 'workbench', key: 'search' } as const, null)
const history = atom({ plugin: 'workbench', key: 'history' } as const, null)
const commit = atom({ plugin: 'workbench', key: 'commit' } as const, null)
const pullList = atom({ plugin: 'workbench', key: 'pullList' } as const, null)
const branchPull = atom({ plugin: 'workbench', key: 'branchPull' } as const, null)
const runs = atom({ plugin: 'workbench', key: 'runs' } as const, null)
const run = atom({ plugin: 'workbench', key: 'run' } as const, null)
const terms = atom({ plugin: 'workbench', key: 'terms' } as const, [])
const activeTerm = atom({ plugin: 'workbench', key: 'activeTerm' } as const, '')
const screen = atom({ plugin: 'workbench', key: 'screen' } as const, [])
const termHistory = atom({ plugin: 'workbench', key: 'termHistory' } as const, [])
// `screen` and `termHistory` hold one value per terminal (memberOf by its id), so one terminal's output redraws only its own view.
const blockOpen = atom({ plugin: 'workbench', key: 'blockOpen' } as const, '')
const inputFill = atom({ plugin: 'workbench', key: 'inputFill' } as const, null)
const scripts = atom({ plugin: 'workbench', key: 'scripts' } as const, [])
const ports = atom({ plugin: 'workbench', key: 'ports' } as const, { rows: [], at: 0, note: '' })
const portFilter = atom({ plugin: 'workbench', key: 'portFilter' } as const, 'dev')
const portOpen = atom({ plugin: 'workbench', key: 'portOpen' } as const, '')
const confirming = atom({ plugin: 'workbench', key: 'confirming' } as const, '')
const busy = atom({ plugin: 'workbench', key: 'busy' } as const, '')


// ── the module's own: work in flight, never what is drawn ───────────────────

/** One PowerShell host as this module holds it. */
type Live = {
  id: string
  token: string
  port: number
  pid: number
  isSystem: boolean
  stream?: HookStream<ProcessSpawnChunk, ProcessSpawnResult>
  parse: StreamState
  blocks: Block[]
  /** The block whose output is arriving; `''` between commands. */
  current: string
  /** A command typed before the shell was up: sent once it is. */
  pending: { id: string; cmd: string } | undefined
  flushTimer: Timer | undefined
  isClosed: boolean
  isEnded: boolean
  ready: Promise<boolean>
  settle: (isUp: boolean) => void
}

let isWindows = true
let home = ''
let shellOption = ''
let shellExe = ''
let loadProfile = false
const lives = new Map<string, Live>()
let system: Live | undefined
let timers: Timer[] = []
let beat: Timer | undefined
let isBegun = false
let gitRun: Promise<void> | undefined
let isGitQueued = false
let portsRun: Promise<void> | undefined
let extrasRun: Promise<void> | undefined
let scriptsRun: Promise<void> | undefined
let scriptsFor = ''
let roots: string[] = []
let rootsFor = ''
let rootsAge = ROOTS_EVERY
let recalledFor = ''
let probedAt = 0
let knownPorts: Set<string> | undefined
let termColumns = 100
let openBlockId = ''
const readAt = new Map<string, number>()
/** The input line's props as last drawn, by terminal: a reply to its Tab hands them back with the matches. */
const inputDrawn = new Map<string, InputProps>()
// The desktop app gives a pane the keyboard on the first click in it and
// raises that click as a focus move only, never a press. Each button's press
// is kept by key as it is drawn, so such a click can be answered as the press
// it was, and the press the app may send after it is not run twice.
let presses = new Map<string, () => void>()
let isDesktopFocused: boolean | undefined
let hasGrid = false
let answered = { key: '', at: 0 }
const ECHO_MS = 600

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))
const differs = (a: unknown, b: unknown): boolean => JSON.stringify(a) !== JSON.stringify(b)
const newId = (): string => crypto.randomUUID().replace(/-/g, '').slice(0, 12)
const obj = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
const str = (value: unknown): string => (typeof value === 'string' ? value : '')
const toast = ($: Engine, text: string, isBad = false): void => $.ui.toast(text, isBad ? { timeoutMs: 8_000 } : undefined)

/** Whether `what` was read long enough ago to read again; saying yes marks it read now. */
function isDue(what: string, force: boolean, every = SLOW_EVERY_MS): boolean {
  const at = readAt.get(what)
  if (!force && at !== undefined && Date.now() - at < every) return false
  readAt.set(what, Date.now())

  return true
}

/** A promise that settles with `fallback` after `ms`, its timer cancelled as soon as `work` settles. */
function within<T, F>($: Engine, work: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  let timer: Timer | undefined
  const timeout = new Promise<F>(resolve => {
    timer = $.clock.after(ms, () => resolve(fallback))
  })

  return Promise.race([work, timeout]).finally(() => timer?.cancel())
}

// ── processes ───────────────────────────────────────────────────────────────

type Ran = { code: number; out: string; err: string }

async function exec($: Engine, argv: readonly string[], cwd?: string, timeoutMs = 20_000): Promise<Ran> {
  try {
    const ran = await $.process.run(argv, {
      ...(cwd === undefined ? {} : { cwd }),
      timeoutMs,
      env: { GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1', NO_COLOR: '1' },
    })

    return { code: ran.exitCode, out: ran.stdout, err: ran.stderr }
  } catch (error) {
    return { code: -1, out: '', err: reasonOf(error) }
  }
}

const git = ($: Engine, cwd: string, args: readonly string[], timeoutMs = 20_000): Promise<Ran> =>
  exec($, ['git', ...args], cwd, timeoutMs)

/** A read from a timer must never hold the index lock: the person's own git, or Claude's, would fail on it. */
const peek = ($: Engine, cwd: string, args: readonly string[]): Promise<Ran> => git($, cwd, ['--no-optional-locks', ...args])

/** The text on the person's clipboard, `''` when there is none or it cannot be read. */
async function readClipboard($: Engine): Promise<string> {
  if (isWindows) {
    // The system PowerShell answers fast; a fresh one is the fallback.
    const host = await systemHost($)
    if (host !== undefined) {
      const answer = await call($, host, '/eval', { script: '[string](Get-Clipboard -Raw) | ConvertTo-Json -Compress' }, 5_000)
      if (answer.ok) {
        try {
          const text: unknown = JSON.parse(answer.text)
          if (typeof text === 'string') return text
        } catch {
          // Fall through to a fresh PowerShell.
        }
      }
    }

    return (await exec($, ['powershell', '-NoProfile', '-NonInteractive', '-Command', 'Get-Clipboard -Raw'], undefined, 8_000)).out.replace(/\r?\n$/, '')
  }
  const isMac = home.startsWith('/Users/')
  const argv = isMac ? ['pbpaste'] : (await $.env.get('WAYLAND_DISPLAY')) ? ['wl-paste', '--no-newline'] : ['xclip', '-selection', 'clipboard', '-o']

  return (await exec($, argv, undefined, 5_000)).out
}

/** Opens a web address in the person's browser. */
async function browse($: Engine, url: string): Promise<boolean> {
  if (!/^https?:\/\/[^\s"]+$/.test(url)) return false
  const argv = isWindows ? ['rundll32', 'url.dll,FileProtocolHandler', url] : [(await $.env.get('WSL_DISTRO_NAME')) ? 'wslview' : 'xdg-open', url]
  const isMac = !isWindows && home.startsWith('/Users/')
  const ran = await exec($, isMac ? ['open', url] : argv, undefined, 10_000)

  return ran.code === 0
}

// ── PowerShell hosts ────────────────────────────────────────────────────────

/** The PowerShell to run: the person's choice, else pwsh, else Windows PowerShell. */
async function resolveShell($: Engine): Promise<string> {
  if (shellExe !== '') return shellExe
  const candidates = shellOption !== '' ? [shellOption] : isWindows ? ['pwsh', 'powershell'] : ['pwsh']
  for (const exe of candidates) {
    const ran = await exec($, [exe, '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.Major'], undefined, 20_000)
    if (ran.code === 0) {
      shellExe = exe

      return exe
    }
  }

  return ''
}

function makeLive(id: string, isSystemHost: boolean, blocks: Block[] = []): Live {
  let settle: (isUp: boolean) => void = () => undefined
  const ready = new Promise<boolean>(resolve => {
    settle = resolve
  })

  return {
    id,
    token: crypto.randomUUID(),
    port: 0,
    pid: 0,
    isSystem: isSystemHost,
    parse: FRESH,
    blocks,
    current: '',
    pending: undefined,
    flushTimer: undefined,
    isClosed: false,
    isEnded: false,
    ready,
    settle,
  }
}

async function call(
  $: Engine,
  live: Live,
  path: string,
  body: unknown = {},
  timeoutMs = 5_000,
): Promise<{ ok: boolean; status: number; text: string }> {
  if (live.port === 0) return { ok: false, status: 0, text: 'PowerShell is not up yet.' }
  try {
    const answer = await within(
      $,
      $.http.fetch(`http://127.0.0.1:${live.port}${path}`, {
        method: 'POST',
        headers: { 'x-wb-token': live.token, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      timeoutMs,
      undefined,
    )
    if (answer === undefined) return { ok: false, status: 0, text: 'PowerShell did not answer in time.' }

    return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, text: answer.text }
  } catch (error) {
    return { ok: false, status: 0, text: reasonOf(error) }
  }
}

/** Starts a host for `live` in `cwd` and reads what it writes until it exits. */
async function startHost($: Engine, live: Live, cwd: string): Promise<void> {
  const exe = await resolveShell($)
  if (exe === '') {
    live.settle(false)
    await endLive($, live, 'PowerShell was not found. Install PowerShell 7 (https://aka.ms/powershell) or set the Shell option.')

    return
  }
  try {
    const stream = $.process.spawn({
      argv: [exe, '-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', HOST_BOOT],
      cwd,
      env: {
        WB_HOST: HOST_SCRIPT,
        WB_TOKEN: live.token,
        WB_CWD: cwd,
        WB_PROFILE: loadProfile && !live.isSystem ? '1' : '0',
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
      },
    })
    live.stream = stream
    void (async () => {
      let reason = 'PowerShell exited.'
      try {
        for await (const chunk of stream) hear($, live, chunk)
        const ended = await stream.result.catch(() => undefined)
        if (ended?.code !== null && ended?.code !== undefined && ended.code !== 0) reason = `PowerShell exited with code ${ended.code}.`
      } catch (error) {
        reason = `PowerShell could not start: ${reasonOf(error)}`
      }
      live.settle(false)
      await endLive($, live, reason)
    })()
  } catch (error) {
    live.settle(false)
    await endLive($, live, `PowerShell could not start: ${reasonOf(error)}`)
  }
}

/** One piece of what a host wrote. */
function hear($: Engine, live: Live, chunk: ProcessSpawnChunk): void {
  const fed = feed(live.parse, chunk.stream, chunk.text)
  live.parse = fed.state
  for (const event of fed.events) take($, live, event)
  if (!live.isSystem) scheduleFlush($, live)
}

function blockFor(live: Live): Block {
  const current = live.blocks.find(one => one.id === live.current)
  if (current !== undefined) return current
  const last = live.blocks[live.blocks.length - 1]
  if (last !== undefined) return last
  const shell: Block = { id: newId(), cmd: '', cwd: '', lines: [], dropped: 0, state: 'ok', exit: null, startedAt: Date.now(), endedAt: Date.now() }
  live.blocks.push(shell)

  return shell
}

function addLine(block: Block, text: string, tone: Block['lines'][number]['tone'], runs?: Styled[]): void {
  const plain = text.length > MAX_LINE ? `${text.slice(0, MAX_LINE)}…` : text
  // Coloured runs are kept to the same length as the plain line.
  let room = MAX_LINE
  const kept = runs?.flatMap(run => {
    if (room <= 0) return []
    const piece = run.text.slice(0, room)
    room -= piece.length

    return [{ ...run, text: piece }]
  })
  block.lines.push(kept === undefined ? { text: plain, tone } : { text: plain, tone, runs: kept })
  if (block.lines.length > KEPT_LINES) {
    const cut = block.lines.length - KEPT_LINES
    block.lines.splice(0, cut)
    block.dropped += cut
  }
}

function take($: Engine, live: Live, event: StreamEvent): void {
  if (event.kind === 'ready') {
    live.port = event.port
    live.pid = event.pid
    live.settle(true)
    if (live.isSystem) return
    void setTerm($, live.id, term => ({ ...term, pid: event.pid, state: live.pending === undefined ? 'idle' : 'busy', note: '' }))
    const waiting = live.pending
    live.pending = undefined
    if (waiting !== undefined) void send($, live, waiting.id, waiting.cmd)

    return
  }
  if (live.isSystem) return
  if (event.kind === 'start') {
    const block = live.blocks.find(one => one.id === event.id)
    if (block !== undefined) block.state = 'running'
    live.current = event.id

    return
  }
  if (event.kind === 'end') {
    const block = live.blocks.find(one => one.id === event.id)
    // What a progress line left unfinished is still output.
    for (const left of partial(live.parse)) if (block !== undefined) addLine(block, left.text, left.tone, left.runs)
    live.parse = FRESH
    if (block !== undefined) {
      block.state = event.state
      block.exit = event.exit
      block.endedAt = Date.now()
    }
    live.current = ''
    void setTerm($, live.id, term => ({ ...term, state: 'idle', cwd: event.cwd === '' ? term.cwd : norm(event.cwd) }))
    // A command can change files and free or take ports: look again soon.
    void refreshGit($)
    void refreshPorts($)

    return
  }
  if (event.kind === 'info') {
    if (event.text !== '') addLine(blockFor(live), event.text, 'info')

    return
  }
  addLine(blockFor(live), event.text, event.tone, event.runs)
}

async function setTerm($: Engine, id: string, change: (term: Term) => Term): Promise<void> {
  await update($, terms, list => list.map(one => (one.id === id ? change(one) : one)))
  await recount($)
}

function scheduleFlush($: Engine, live: Live): void {
  if (live.flushTimer !== undefined) return
  live.flushTimer = $.clock.after(FLUSH_MS, () => {
    live.flushTimer = undefined
    void flush($, live)
  })
}

/** Writes a terminal's blocks to the session's state, cut to what the view can show. */
async function flush($: Engine, live: Live): Promise<void> {
  const list = live.blocks.slice(-STATE_BLOCKS)
  const snapshot = list.map((block, at) => {
    const room = block.id === openBlockId || at >= list.length - 3 ? STATE_LINES : OLD_STATE_LINES
    const lines = block.lines.slice(-room)
    if (block.id === live.current) lines.push(...partial(live.parse))

    return { ...block, lines, dropped: block.dropped + Math.max(0, block.lines.length - room) }
  })
  if (differs(await read($, memberOf(screen, { requestId: live.id })), snapshot)) await update($, memberOf(screen, { requestId: live.id }), () => snapshot)
}

/** The host is gone: its tab says so and keeps what it printed. */
async function endLive($: Engine, live: Live, reason: string): Promise<void> {
  if (live.isEnded) return
  live.isEnded = true
  if (live.isSystem) {
    if (system === live) system = undefined

    return
  }
  if (lives.get(live.id) === live) lives.delete(live.id)
  if (live.isClosed) return
  for (const block of live.blocks) {
    if (block.state === 'running' || block.state === 'stopping') {
      block.state = 'stopped'
      block.endedAt = Date.now()
    }
  }
  live.current = ''
  await flush($, live)
  await setTerm($, live.id, term => ({ ...term, state: 'ended', pid: 0, note: reason }))
}

/** The hidden host that answers the Ports view's questions about processes. */
async function systemHost($: Engine): Promise<Live | undefined> {
  if (system === undefined || system.isEnded) {
    system = makeLive('system', true)
    void startHost($, system, await $.session.cwd())
  }
  const held = system

  return (await within($, held.ready, 15_000, false)) ? held : undefined
}

async function send($: Engine, live: Live, blockId: string, cmd: string): Promise<void> {
  const sent = await call($, live, '/run', { id: blockId, cmd, width: Math.max(40, Math.min(250, termColumns)) })
  if (sent.ok) return
  const block = live.blocks.find(one => one.id === blockId)
  if (block !== undefined) {
    block.state = 'fail'
    block.endedAt = Date.now()
    addLine(block, sent.status === 409 ? 'Another command is still running.' : `Could not run it: ${sent.text}`, 'err')
  }
  live.current = ''
  await flush($, live)
  await setTerm($, live.id, term => ({ ...term, state: term.state === 'ended' ? 'ended' : 'idle' }))
}

/** The folder a new terminal opens in: the repository in view, else the session's. */
async function startFolder($: Engine): Promise<string> {
  const cwd = norm(await $.session.cwd())
  const held = await read($, repos)
  const picked = await read($, repo)
  const inView = held.length === 1 ? held[0] : held.find(one => one.root === picked)

  return inView?.root ?? cwd
}

async function recentCommands($: Engine): Promise<string[]> {
  const kept = await $.store.get(HISTORY_KEY).catch(() => undefined)

  return Array.isArray(kept) ? kept.filter((one): one is string => typeof one === 'string').slice(-HISTORY_KEPT) : []
}

async function newTerm($: Engine, options: { cwd?: string; title?: string; script?: string; cmd?: string } = {}): Promise<void> {
  const list = await read($, terms)
  if (list.length >= MAX_TERMS) {
    toast($, `${MAX_TERMS} terminals is the most: close one first.`, true)

    return
  }
  const cwd = norm(options.cwd ?? (await startFolder($)))
  const id = newId()
  let n = 1
  while (list.some(one => one.title === `pwsh ${n}`)) n += 1
  const term: Term = { id, title: options.title ?? `pwsh ${n}`, cwd, state: 'starting', pid: 0, script: options.script ?? '', note: '' }
  await update($, terms, held => [...held, term])
  await update($, memberOf(screen, { requestId: id }), () => [])
  await update($, memberOf(termHistory, { requestId: id }), () => [])
  await update($, activeTerm, () => id)
  await update($, tab, () => 'term')
  const recent = await recentCommands($)
  if (recent.length > 0) await update($, memberOf(termHistory, { requestId: id }), () => recent)
  const live = makeLive(id, false)
  lives.set(id, live)
  if (options.cmd !== undefined) await runLine($, id, options.cmd)
  void startHost($, live, cwd)
  await recount($)
}

async function remember($: Engine, id: string, cmd: string): Promise<void> {
  const add = (list: readonly string[]): string[] => [...list.filter(one => one !== cmd), cmd].slice(-HISTORY_KEPT)
  await update($, memberOf(termHistory, { requestId: id }), add)
  const kept = await recentCommands($)
  await $.store.set(HISTORY_KEY, add(kept)).catch(() => undefined)
}

async function runLine($: Engine, id: string, text: string): Promise<void> {
  const cmd = text.replace(/\s+$/, '')
  if (cmd.trim() === '') return
  const word = cmd.trim().toLowerCase()
  if (word === 'cls' || word === 'clear' || word === 'clear-host') return clearTerm($, id)
  if (word === 'exit') return closeTerm($, id)
  const named = typedTitle(cmd)
  if (named !== undefined) return renameTerm($, id, named, cmd)
  const term = (await read($, terms)).find(one => one.id === id)
  const live = lives.get(id)
  if (term === undefined) return
  if (live === undefined || term.state === 'ended') {
    toast($, 'This terminal has ended: restart it first.', true)

    return
  }
  if (term.state === 'busy' || live.current !== '' || live.pending !== undefined) {
    toast($, 'A command is still running here: stop it, or open another terminal.', true)

    return
  }
  await remember($, id, cmd)
  const block: Block = { id: newId(), cmd, cwd: term.cwd, lines: [], dropped: 0, state: 'running', exit: null, startedAt: Date.now(), endedAt: 0 }
  live.blocks.push(block)
  if (live.blocks.length > 200) live.blocks.splice(0, live.blocks.length - 200)
  live.current = block.id
  await setTerm($, id, one => ({ ...one, state: 'busy' }))
  await flush($, live)
  // Still running after a moment: a server, a watcher. The tab takes its name, as Windows Terminal's does.
  $.clock.after(RENAME_AFTER_MS, () => {
    if (live.current === block.id && !live.isEnded) void autoName($, id, cmd, term.cwd)
  })
  if (live.port === 0) {
    live.pending = { id: block.id, cmd }

    return
  }
  await send($, live, block.id, cmd)
}

/**
 * The folder a command ran in, as a tab names it: `client` when that is a folder inside
 * the repository or the session's folder, `''` at their top or outside them.
 */
async function subfolder($: Engine, cwd: string, cdTo: string | undefined): Promise<string> {
  if (cdTo !== undefined) {
    const target = cdTo.replace(/[\\/]+$/, '')
    return target === '' || target === '.' || target === '..' || target.startsWith('~') ? '' : base(target)
  }
  const roots = [...(await read($, repos)).map(one => one.root), await read($, workspace)].filter(root => root !== '' && isUnder(cwd, root))
  const root = roots.sort((a, b) => b.length - a.length)[0]

  return root === undefined || same(root, cwd) ? '' : base(cwd)
}

/** Names a tab after the command that keeps running in it, unless the person named it. */
async function autoName($: Engine, id: string, cmd: string, cwd: string): Promise<void> {
  const term = (await read($, terms)).find(one => one.id === id)
  if (term === undefined || term.isNamed === true) return
  const found = tabName(cmd)
  if (found.name === '') return
  const folder = await subfolder($, cwd, found.cdTo)
  const wanted = folder === '' ? found.name : `${folder}: ${found.name}`
  // A tab already called this keeps its name; another running the same thing is numbered.
  if (term.title === wanted) return
  const taken = (await read($, terms)).filter(one => one.id !== id).map(one => one.title)
  const title = unique(wanted, taken)
  await setTerm($, id, one => (one.isNamed === true ? one : { ...one, title }))
}

/**
 * The person named the tab (`title frontend`, `$Host.UI.RawUI.WindowTitle = "frontend"`):
 * it keeps that name. `title` alone hands naming back to the commands. Echoed on the
 * screen as a command, as the shell would have shown it.
 */
async function renameTerm($: Engine, id: string, name: string, cmd: string): Promise<void> {
  const term = (await read($, terms)).find(one => one.id === id)
  if (term === undefined) return
  await remember($, id, cmd)
  const title = name.slice(0, 40)
  if (title === '') {
    const list = await read($, terms)
    let n = 1
    while (list.some(one => one.id !== id && one.title === `pwsh ${n}`)) n += 1
    await setTerm($, id, one => ({ ...one, title: `pwsh ${n}`, isNamed: false }))
  } else {
    await setTerm($, id, one => ({ ...one, title, isNamed: true }))
  }
  const live = lives.get(id)
  if (live === undefined) return
  const now = Date.now()
  live.blocks.push({ id: newId(), cmd, cwd: term.cwd, lines: [], dropped: 0, state: 'ok', exit: null, startedAt: now, endedAt: now })
  await flush($, live)
}

async function stopTerm($: Engine, id: string): Promise<void> {
  const live = lives.get(id)
  if (live === undefined) return
  if (live.pending !== undefined) {
    const waiting = live.pending
    live.pending = undefined
    const block = live.blocks.find(one => one.id === waiting.id)
    if (block !== undefined) {
      block.state = 'stopped'
      block.endedAt = Date.now()
    }
    live.current = ''
    await flush($, live)
    await setTerm($, id, term => ({ ...term, state: term.state === 'busy' ? 'starting' : term.state }))

    return
  }
  const block = live.blocks.find(one => one.id === live.current)
  if (block !== undefined && block.state === 'running') block.state = 'stopping'
  await flush($, live)
  await call($, live, '/stop')
}

async function clearTerm($: Engine, id: string): Promise<void> {
  const live = lives.get(id)
  if (live !== undefined) live.blocks = live.blocks.filter(one => one.id === live.current)
  await update($, memberOf(screen, { requestId: id }), list => list.filter(one => one.state === 'running' || one.state === 'stopping'))
}

/** Asks a host to leave; ends it by force if it has not gone within a few seconds. */
function dismiss($: Engine, live: Live): void {
  live.isClosed = true
  if (live.flushTimer !== undefined) live.flushTimer.cancel()
  void call($, live, '/exit', {}, 2_000).finally(() => {
    $.clock.after(3_000, () => {
      if (!live.isEnded) void live.stream?.return({ code: null, signal: null }).catch(() => undefined)
    })
  })
}

async function closeTerm($: Engine, id: string): Promise<void> {
  const live = lives.get(id)
  if (live !== undefined) {
    lives.delete(id)
    dismiss($, live)
  }
  const list = await read($, terms)
  const at = list.findIndex(one => one.id === id)
  const rest = list.filter(one => one.id !== id)
  await update($, terms, () => rest)
  await update($, memberOf(screen, { requestId: id }), () => [])
  if ((await read($, activeTerm)) === id) await update($, activeTerm, () => rest[Math.min(Math.max(0, at), rest.length - 1)]?.id ?? '')
  await recount($)
}

async function restartTerm($: Engine, id: string): Promise<void> {
  const term = (await read($, terms)).find(one => one.id === id)
  if (term === undefined) return
  const old = lives.get(id)
  const blocks = old?.blocks ?? (await read($, memberOf(screen, { requestId: id }))).map(block => ({ ...block, lines: [...block.lines] }))
  if (old !== undefined) {
    lives.delete(id)
    dismiss($, old)
  }
  const notice: Block = {
    id: newId(),
    cmd: '',
    cwd: term.cwd,
    lines: [{ text: 'A new PowerShell session started here.', tone: 'info' }],
    dropped: 0,
    state: 'ok',
    exit: null,
    startedAt: Date.now(),
    endedAt: Date.now(),
  }
  const live = makeLive(id, false, [...blocks, notice])
  lives.set(id, live)
  await setTerm($, id, one => ({ ...one, state: 'starting', pid: 0, note: '' }))
  await flush($, live)
  void startHost($, live, term.cwd)
}

/** The shell's completions for the word at `cursor`. */
async function complete($: Engine, id: string, text: string, cursor: number): Promise<{ start: number; length: number; items: string[] }> {
  const none = { start: cursor, length: 0, items: [] }
  const live = lives.get(id)
  if (live === undefined || text.length > 2_000) return none
  const answer = await call($, live, '/complete', { text, cursor: Math.max(0, Math.min(text.length, cursor)) }, 4_000)
  if (!answer.ok) return none
  const said = obj(JSON.parse(answer.text) as unknown)
  const items = Array.isArray(said.items) ? said.items.filter((one): one is string => typeof one === 'string') : typeof said.items === 'string' ? [said.items] : []

  return {
    start: typeof said.start === 'number' ? said.start : cursor,
    length: typeof said.length === 'number' ? said.length : 0,
    items: items.slice(0, 60),
  }
}

/** Keeps every host alive while this session is: a host left alone for two minutes ends itself. */
function heartbeat($: Engine): void {
  for (const live of [...lives.values(), ...(system === undefined ? [] : [system])]) {
    if (live.port > 0 && !live.isEnded) void call($, live, '/ping', {}, 3_000)
  }
}

async function runScript($: Engine, script: Script): Promise<void> {
  const list = await read($, terms)
  const held = list.find(one => one.script === script.id && one.state !== 'ended')
  if (held !== undefined) {
    await update($, activeTerm, () => held.id)
    await update($, tab, () => 'term')
    if (held.state === 'busy') {
      toast($, `${script.label} is already running in "${held.title}".`)

      return
    }
    await runLine($, held.id, script.cmd)

    return
  }
  await newTerm($, { cwd: script.cwd, title: script.label, script: script.id, cmd: script.cmd })
}

// What the mascot follows: whether a turn runs, how many subagents are out, and the
// looks of the tools running now, the latest last.
let inTurn = false
let helpers = 0
const acting: Mood[] = []
let settle: Timer | undefined

/** The mascot's look for what is happening now: a question first, then helpers, then the latest tool. */
function moodNow(): Mood {
  if (acting.includes('wait')) return 'wait'
  if (helpers > 0) return 'helpers'

  return acting[acting.length - 1] ?? (inTurn ? 'think' : 'sleep')
}

/** Sets what the mascot is doing; writes only a change, so the header redraws once. */
async function setMood($: Engine, next: Mood): Promise<void> {
  if ((await read($, mood)) !== next) await update($, mood, () => next)
}

async function recount($: Engine): Promise<void> {
  const running = (await read($, terms)).filter(one => one.state === 'busy').length
  if ((await read($, counts)).running !== running) await update($, counts, held => ({ ...held, running }))
}

// ── ports ───────────────────────────────────────────────────────────────────

async function probe($: Engine, row: PortRow): Promise<PortRow> {
  const started = Date.now()
  try {
    const answer = await within(
      $,
      $.http.fetch(`http://${probeHost(row.addresses)}:${row.port}/`, { headers: { 'user-agent': 'workbench-probe', accept: 'text/html,*/*' } }),
      2_500,
      undefined,
    )
    if (answer === undefined) return withProbe(row, { status: 0, title: '', ms: 0, server: '' })
    const header = (name: string): string => answer.headers[name] ?? answer.headers[name.toLowerCase()] ?? ''

    return withProbe(
      row,
      { status: answer.status, title: titleOf(answer.text.slice(0, 50_000)), ms: Date.now() - started, server: header('server') },
      { server: header('server'), poweredBy: header('x-powered-by'), body: answer.text.slice(0, 50_000) },
    )
  } catch {
    // Not HTTP: the port takes connections and says something else, or nothing.
    return withProbe(row, null)
  }
}

async function loadPorts($: Engine, force: boolean): Promise<void> {
  let listeners: Listener[] = []
  let procs: Map<number, Proc> = new Map()
  let note = ''
  if (isWindows) {
    const listed = await exec($, ['netstat', '-ano'], undefined, 15_000)
    if (listed.code !== 0) note = `netstat did not answer: ${tail(listed.err || listed.out, 1)}`
    listeners = parseNetstat(listed.out)
    const host = await systemHost($)
    const pids = [...new Set(listeners.map(one => one.pid))]
    if (host !== undefined) {
      const answer = await call($, host, '/eval', { script: processScript(pids) }, 10_000)
      if (answer.ok) procs = parseProcessJson(answer.text)
    }
    if (procs.size === 0) procs = parseTasklist((await exec($, ['tasklist', '/fo', 'csv', '/nh'], undefined, 15_000)).out)
  } else {
    const listed = await exec($, ['lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pcn'], undefined, 15_000)
    if (listed.code !== 0 && listed.out === '') note = 'lsof is needed to list ports on this system.'
    listeners = parseLsof(listed.out)
    procs = parsePs((await exec($, ['ps', '-axo', 'pid=,ppid=,rss=,command='], undefined, 15_000)).out)
  }
  // The hosts' own control ports are the workbench's, not the person's.
  const hostPorts = new Set([...lives.values(), ...(system === undefined ? [] : [system])].map(live => `${live.pid}:${live.port}`))
  listeners = listeners.filter(one => !hostPorts.has(`${one.pid}:${one.port}`))
  const hosts = new Map([...lives.values()].filter(live => live.pid > 0).map(live => [live.pid, live.id] as const))
  const before = await read($, ports)
  let rows = toRows(listeners, procs, hosts, before.rows)
  if (force || Date.now() - probedAt >= PROBE_EVERY_MS) {
    probedAt = Date.now()
    rows = await Promise.all(rows.map(row => (isProbed(row) ? probe($, row) : Promise.resolve(row))))
  }
  const next: Ports = { rows, at: Date.now(), note }
  await update($, ports, () => next)
  const dev = rows.filter(row => row.kind === 'dev')
  if ((await read($, counts)).ports !== dev.length) await update($, counts, held => ({ ...held, ports: dev.length }))
  // Say what came up and what went away, once the first look has said what was already there.
  const now = new Set(dev.map(row => `${row.port}:${row.name}`))
  if (knownPorts !== undefined) {
    const known = knownPorts
    const up = dev.filter(row => !known.has(`${row.port}:${row.name}`))
    const gone = [...known].filter(key => !now.has(key))
    if (up.length > 0) toast($, `Listening: ${up.map(row => `:${row.port} ${row.name}${row.framework === '' ? '' : ` (${row.framework})`}`).join(', ')}`)
    else if (gone.length > 0) toast($, `Stopped listening: ${gone.map(key => `:${key.split(':')[0]}`).join(', ')}`)
  }
  knownPorts = now
}

function refreshPorts($: Engine, force = false): Promise<void> {
  portsRun ??= (async () => {
    try {
      await loadPorts($, force)
    } catch {
      // The next poll is the retry.
    } finally {
      portsRun = undefined
    }
  })()

  return portsRun
}

async function killPort($: Engine, key: string): Promise<void> {
  const row = (await read($, ports)).rows.find(one => one.key === key)
  await update($, confirming, () => '')
  if (row === undefined || row.kind === 'system' || row.pid <= 4) return
  const argv = isWindows ? ['taskkill', '/PID', String(row.pid), '/T', '/F'] : ['kill', '-TERM', String(row.pid)]
  const ran = await exec($, argv, undefined, 15_000)
  toast($, ran.code === 0 ? `Ended ${row.name} (pid ${row.pid}).` : `Could not end ${row.name}: ${tail(ran.err || ran.out, 2)}`, ran.code !== 0)
  await refreshPorts($, true)
}

// ── git ─────────────────────────────────────────────────────────────────────

/** The repositories a folder stands for: the one it is in, or each child that holds a `.git`. */
async function findRepos($: Engine, cwd: string): Promise<string[]> {
  const top = await peek($, cwd, ['rev-parse', '--show-toplevel'])
  if (top.code === 0 && top.out.trim() !== '') return [norm(top.out.trim())]
  const found: string[] = []
  try {
    for (const entry of await $.fs.list(cwd)) {
      if (entry.kind !== 'dir' || !isProjectDir(entry.name)) continue
      if (await $.fs.exists(join(cwd, entry.name, '.git'))) found.push(join(cwd, entry.name))
      if (found.length >= MAX_REPOS) break
    }
  } catch {
    return []
  }

  return found.sort()
}

async function readRepo($: Engine, root: string): Promise<Repo | null> {
  const ran = await peek($, root, ['status', '--porcelain=v1', '--branch', '-z', '--untracked-files=all'])
  if (ran.code !== 0) return null

  return { root, name: base(root), ...parseStatus(ran.out) }
}

async function readDiff($: Engine, root: string, gitFile: GitFile, staged: boolean, max?: number) {
  const out = (await peek($, root, diffArgs(gitFile, staged))).out

  return { root, path: gitFile.path, isStaged: staged, ...fitHunks(out, max) }
}

const pickKey = (cwd: string): string => `repo:${norm(cwd).toLowerCase()}`

async function loadGit($: Engine): Promise<void> {
  const cwd = norm(await $.session.cwd())
  if ((await read($, workspace)) !== cwd) await update($, workspace, () => cwd)
  if (rootsAge >= ROOTS_EVERY || rootsFor !== cwd) {
    roots = await findRepos($, cwd)
    rootsFor = cwd
    rootsAge = 0
  } else {
    rootsAge += 1
  }
  const loaded = (await Promise.all(roots.map(root => readRepo($, root)))).filter((one): one is Repo => one !== null)
  if (differs(await read($, repos), loaded)) await update($, repos, () => loaded)
  // A folder of several repositories opens on the one picked there last time.
  if (recalledFor !== cwd) {
    recalledFor = cwd
    const kept = await $.store.get(pickKey(cwd)).catch(() => undefined)
    if (typeof kept === 'string' && (await read($, repo)) === '' && loaded.some(one => one.root === kept)) await update($, repo, () => kept)
  }
  const changed = loaded.reduce((sum, one) => sum + one.files.length, 0)
  if ((await read($, counts)).changed !== changed) await update($, counts, held => ({ ...held, changed }))
  // The diff on screen follows its file, and closes once the file has left that side.
  const open = await read($, diff)
  if (open !== null) {
    const held = loaded.find(one => one.root === open.root)?.files.find(one => one.path === open.path && (open.isStaged ? isStaged(one) : isChanged(one)))
    const fresh = held === undefined ? null : await readDiff($, open.root, held, open.isStaged, Math.max(400, open.shown))
    if (differs(await read($, diff), fresh)) await update($, diff, () => fresh)
  }
  void refreshScripts($)
}

function refreshGit($: Engine): Promise<void> {
  if (gitRun !== undefined) {
    isGitQueued = true

    return gitRun
  }
  gitRun = (async () => {
    try {
      do {
        isGitQueued = false
        await loadGit($)
      } while (isGitQueued)
    } catch {
      // The next poll is the retry.
    } finally {
      gitRun = undefined
    }
  })()

  return gitRun
}

async function inViewRepo($: Engine): Promise<Repo | undefined> {
  const held = await read($, repos)
  const picked = await read($, repo)

  return held.length === 1 ? held[0] : held.find(one => one.root === picked)
}

async function readPullList($: Engine, root: string): Promise<PullList> {
  const ran = await exec($, ['gh', 'pr', 'list', '--state', 'open', '--limit', '30', '--json', PULL_FIELDS], root, 25_000)
  if (ran.code === 0) return { root, items: parsePulls(ran.out), note: '' }

  return { root, items: [], note: tail(ran.err || ran.out, 2) || 'gh could not list the pull requests.' }
}

async function readBranchPull($: Engine, root: string, branch: string): Promise<BranchPull> {
  const ran = await exec($, ['gh', 'pr', 'view', '--json', PULL_FIELDS], root, 25_000)

  return { root, branch, pull: ran.code === 0 ? parsePull(ran.out) : null }
}

async function readRuns($: Engine, root: string, branch: string): Promise<Runs> {
  const ran = await exec($, ['gh', 'run', 'list', '--branch', branch, '--limit', '15', '--json', RUN_FIELDS], root, 25_000)
  if (ran.code === 0) return { root, branch, items: parseRuns(ran.out), note: '' }

  return { root, branch, items: [], note: tail(ran.err || ran.out, 2) || 'gh could not list the runs.' }
}

async function readJobs($: Engine, root: string, id: number) {
  const ran = await exec($, ['gh', 'run', 'view', String(id), '--json', 'jobs'], root, 25_000)

  return ran.code === 0 ? parseJobs(ran.out) : []
}

/** The reads only one view shows, for the view in front, no oftener than a minute apart. */
async function loadExtras($: Engine, force: boolean): Promise<void> {
  if ((await read($, tab)) !== 'git') return
  const part = await read($, gitSection)
  const inView = await inViewRepo($)
  if (part === 'files') {
    const open = await read($, file)
    if (open === null) {
      const found = await listDir($, (await read($, listing))?.path ?? (await filesRoot($)))
      if (found !== null && differs(await read($, listing), found)) await update($, listing, () => found)
    } else if (!open.isEditing && open.note === '') {
      // Someone else wrote the file (Claude, an editor): what is shown follows.
      const mtimeMs = await $.fs.stat(open.path).then(stat => stat.mtimeMs).catch(() => 0)
      if (mtimeMs !== open.mtimeMs) {
        const fresh = await readFile($, open.path)
        await update($, file, now => (now === null || now.path !== fresh.path ? now : { ...fresh, top: now.top, isEditing: now.isEditing }))
      }
    }
  }
  if (inView === undefined) return
  if (part === 'history' && isDue(`log:${inView.root}`, force, 15_000)) {
    const found = { root: inView.root, rows: parseLog((await peek($, inView.root, LOG_ARGS)).out) }
    if (differs(await read($, history), found)) await update($, history, () => found)
  }
  if (part === 'pulls' && isDue(`pulls:${inView.root}`, force)) {
    const found = await readPullList($, inView.root)
    if (differs(await read($, pullList), found)) await update($, pullList, () => found)
  }
  if (part === 'changes' && inView.upstream !== '' && isDue(`pull:${inView.root}:${inView.branch}`, force)) {
    const found = await readBranchPull($, inView.root, inView.branch)
    if (differs(await read($, branchPull), found)) await update($, branchPull, () => found)
  }
  if (part === 'actions' && isDue(`runs:${inView.root}:${inView.branch}`, force)) {
    const found = await readRuns($, inView.root, inView.branch)
    if (differs(await read($, runs), found)) await update($, runs, () => found)
    const open = await read($, run)
    if (open !== null && found.items.some(one => one.id === open.id)) {
      const fresh = { id: open.id, jobs: await readJobs($, inView.root, open.id) }
      if (differs(await read($, run), fresh)) await update($, run, () => fresh)
    }
  }
}

function refreshExtras($: Engine, force = false): Promise<void> {
  extrasRun ??= (async () => {
    try {
      await loadExtras($, force)
    } catch {
      // The next poll is the retry.
    } finally {
      extrasRun = undefined
    }
  })()

  return extrasRun
}

async function reloadExtras($: Engine): Promise<void> {
  if (extrasRun !== undefined) await extrasRun
  await refreshExtras($, true)
}

/** The scripts of the repository in view (or the session's folder), and of the folders right under it. */
async function loadScripts($: Engine): Promise<void> {
  const root = await startFolder($)
  if (root === scriptsFor) return
  scriptsFor = root
  const readFolder = async (path: string): Promise<Script[]> => {
    try {
      const entries = await $.fs.list(path)
      const names = entries.map(one => one.name)
      const files: Record<string, string> = {}
      for (const name of TASK_FILES) {
        if (names.includes(name)) files[name] = await $.fs.read(join(path, name)).catch(() => '')
      }

      return detect({ path, rel: rel(path, root), names, files })
    } catch {
      return []
    }
  }
  const found = await readFolder(root)
  try {
    const children = (await $.fs.list(root)).filter(one => one.kind === 'dir' && isProjectDir(one.name)).slice(0, 40)
    let added = 0
    for (const child of children) {
      const names = (await $.fs.list(join(root, child.name)).catch(() => [])).map(one => one.name)
      if (!names.some(name => (TASK_FILES as readonly string[]).includes(name) || name === 'Cargo.toml' || name === 'go.mod')) continue
      found.push(...(await readFolder(join(root, child.name))))
      added += 1
      if (added >= 8) break
    }
  } catch {
    // The root alone, then.
  }
  if (differs(await read($, scripts), found)) await update($, scripts, () => found)
}

function refreshScripts($: Engine): Promise<void> {
  scriptsRun ??= (async () => {
    try {
      await loadScripts($)
    } catch {
      scriptsFor = ''
    } finally {
      scriptsRun = undefined
    }
  })()

  return scriptsRun
}

// ── files ───────────────────────────────────────────────────────────────────

async function filesRoot($: Engine): Promise<string> {
  return (await inViewRepo($))?.root ?? norm(await $.session.cwd())
}

async function listDir($: Engine, path: string): Promise<Listing | null> {
  const root = await filesRoot($)
  const at = norm(path)
  if (!isUnder(at, root) && !isUnder(at, norm(await $.session.cwd()))) return null
  try {
    const entries: Entry[] = (await $.fs.list(at))
      .filter(one => one.name !== '.git' && one.kind !== 'other')
      .map(one => ({ name: one.name, isDir: one.kind === 'dir', size: one.size }))
      .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : a.isDir ? -1 : 1))

    return { path: at, entries }
  } catch {
    return null
  }
}

async function readFile($: Engine, path: string): Promise<OpenFile> {
  const opened = (text: string, note: string, mtimeMs: number): OpenFile => ({ path, text, note, mtimeMs, top: 0, isEditing: false })
  try {
    const stat = await $.fs.stat(path)
    if (stat.kind !== 'file') return opened('', 'Not a file.', stat.mtimeMs)
    if (stat.size > MAX_FILE_BYTES) return opened('', `Too large to show here: ${Math.round(stat.size / 1024)} KB.`, stat.mtimeMs)
    const text = await $.fs.read(path)

    return text.includes('\0') ? opened('', 'Not a text file.', stat.mtimeMs) : opened(text.replace(/\r\n/g, '\n'), '', stat.mtimeMs)
  } catch (error) {
    return opened('', reasonOf(error), 0)
  }
}

/** File names and lines matching `query`: git's index where there is a repository, the folder's names elsewhere. */
async function searchFolder($: Engine, query: string): Promise<Search> {
  const root = await filesRoot($)
  const names: string[] = []
  const hits: Hit[] = []
  const needle = query.toLowerCase()
  const inRepo = (await peek($, root, ['rev-parse', '--is-inside-work-tree'])).out.trim() === 'true'
  if (inRepo) {
    const listed = (await peek($, root, ['ls-files', '--cached', '--others', '--exclude-standard'])).out
    names.push(...listed.split('\n').filter(path => path !== '' && base(path).toLowerCase().includes(needle)))
    const grep = (await peek($, root, ['grep', '-n', '-I', '-i', '-F', '--untracked', '-e', query])).out
    for (const line of grep.split('\n')) {
      const match = /^(.+?):(\d+):(.*)$/.exec(line)
      if (match !== null) hits.push({ path: match[1] ?? '', line: Number(match[2]), text: (match[3] ?? '').slice(0, 300) })
      if (hits.length > MAX_FOUND) break
    }
  } else {
    // No index to ask: walk a few levels of names.
    const walk = async (path: string, depth: number): Promise<void> => {
      if (depth > 3 || names.length > MAX_FOUND) return
      const entries = await $.fs.list(path).catch(() => [])
      for (const entry of entries) {
        const at = join(path, entry.name)
        if (entry.kind === 'dir' && isProjectDir(entry.name)) await walk(at, depth + 1)
        else if (entry.kind === 'file' && entry.name.toLowerCase().includes(needle)) names.push(rel(at, root))
      }
    }
    await walk(root, 0)
  }

  return { query, names: names.slice(0, MAX_FOUND), hits: hits.slice(0, MAX_FOUND), isCut: names.length > MAX_FOUND || hits.length > MAX_FOUND }
}

/** What the editor posted. Input, not fact: the path must be the file on screen, and nobody may have written it since. */
async function hearEditor($: Engine, data: Record<string, unknown>): Promise<void> {
  const open = await read($, file)
  if (data.type !== 'save' || open === null || open.note !== '' || !same(str(data.path), open.path) || typeof data.text !== 'string') return
  const text = data.text
  const cwd = norm(await $.session.cwd())
  if (!isUnder(open.path, cwd) && !isUnder(open.path, await filesRoot($))) {
    toast($, "That file is outside this session's folder.", true)

    return
  }
  try {
    const disk = (await $.fs.read(open.path)).replace(/\r\n/g, '\n')
    if (disk !== open.text) {
      toast($, 'The file changed on disk while you were editing, so nothing was written. Copy what you need, then press done to see the new text.', true)

      return
    }
    // A file that had Windows line endings keeps them.
    const raw = await $.fs.read(open.path)
    await $.fs.write(open.path, raw.includes('\r\n') ? text.replace(/\n/g, '\r\n') : text)
    const mtimeMs = (await $.fs.stat(open.path)).mtimeMs
    await update($, file, now => (now === null ? now : { ...now, text, mtimeMs }))
    toast($, `Saved ${base(open.path)}.`)
  } catch (error) {
    toast($, reasonOf(error), true)
  }
  await refreshGit($)
}

// ── keeping it current ──────────────────────────────────────────────────────

/** Whether the person's theme is light or dark: the pictures are coloured for it. */
async function readTheme($: Engine): Promise<void> {
  try {
    const theme = (await $.config.list()).find(one => one.key === 'theme')?.value
    const next = typeof theme === 'string' && theme.includes('light') ? 'light' : 'dark'
    if ((await read($, scheme)) !== next) await update($, scheme, () => next)
  } catch {
    // No theme to read: the dark look stands.
  }
}

function begin($: Engine): void {
  if (isBegun) return
  isBegun = true
  timers = [
    $.clock.every(GIT_EVERY_MS, () => {
      void refreshGit($)
      void refreshExtras($)
    }),
    $.clock.every(PORTS_EVERY_MS, () => void refreshPorts($)),
    // The theme can change under a long session.
    $.clock.every(SLOW_EVERY_MS, () => void readTheme($)),
  ]
  void readTheme($)
  void refreshGit($).then(() => refreshExtras($))
  void refreshPorts($)
}

function rest(): void {
  for (const timer of timers) timer.cancel()
  timers = []
  isBegun = false
}

async function openPane($: Engine, focus: boolean) {
  if (!(await read($, isOn))) await update($, isOn, () => true)
  begin($)
  const placed = await $.ui.open(focus ? { id: PANE, title: TITLE, columns: COLUMNS, focus: true } : { id: PANE, title: TITLE, columns: COLUMNS })
  $.ui.invalidate('ui.render')

  return placed
}

async function mention($: Engine, path: string): Promise<void> {
  const cwd = norm(await $.session.cwd())
  const target = isUnder(path, cwd) ? rel(path, cwd) : norm(path)
  const filled = await $.prompt.fill({ text: /\s/.test(target) ? `@"${target}" ` : `@${target} `, mode: 'insert' })
  toast($, filled.isFilled ? 'In the prompt. Press Esc to go back to it.' : 'The prompt box is busy; try again in a moment.', !filled.isFilled)
}

async function draft($: Engine, text: string): Promise<void> {
  const filled = await $.prompt.fill({ text, mode: 'insert' })
  toast($, filled.isFilled ? 'Drafted in the prompt, not sent. Press Esc to go to it.' : 'The prompt box is busy; try again in a moment.', !filled.isFilled)
}

/** What a press does. Each rereads what it acts on: a drawing can be stale. */
function actions($: Engine): Actions {
  const guard =
    <A extends unknown[]>(work: (...args: A) => Promise<void>) =>
    (...args: A): void => {
      void work(...args).catch((error: unknown) => toast($, reasonOf(error), true))
    }
  const fileOf = async (root: string, path: string): Promise<GitFile | undefined> =>
    (await read($, repos)).find(one => one.root === root)?.files.find(one => one.path === path)

  return {
    setTab: guard(async (id: Tab) => {
      if ((await read($, tab)) === id && id === 'git') {
        // The open view pressed again is the way back to its list.
        await update($, diff, () => null)
        await update($, file, () => null)
        await update($, commit, () => null)
        await update($, run, () => null)
      }
      await update($, tab, () => id)
      await update($, confirming, () => '')
      if (id === 'ports') void refreshPorts($, true)
      await reloadExtras($)
    }),
    openPane: guard(async () => {
      await openPane($, true)
    }),

    setGitSection: guard(async (id: GitSection) => {
      if ((await read($, gitSection)) === id) {
        await update($, diff, () => null)
        await update($, file, () => null)
        await update($, commit, () => null)
        await update($, run, () => null)
      }
      await update($, gitSection, () => id)
      await update($, confirming, () => '')
      if (id === 'files' && (await read($, listing)) === null) {
        const found = await listDir($, await filesRoot($))
        await update($, listing, () => found)
      }
      await reloadExtras($)
    }),
    openRepo: guard(async (root: string) => {
      await update($, repo, () => root)
      await update($, listing, () => null)
      await $.store.set(pickKey(await $.session.cwd()), root).catch(() => undefined)
      scriptsFor = ''
      void refreshScripts($)
      await reloadExtras($)
    }),
    closeRepo: guard(async () => {
      await update($, repo, () => '')
      await update($, diff, () => null)
      await update($, listing, () => null)
      await $.store.delete(pickKey(await $.session.cwd())).catch(() => undefined)
      scriptsFor = ''
      void refreshScripts($)
    }),
    openDiff: guard(async (root: string, path: string, staged: boolean) => {
      const held = await fileOf(root, path)
      if (held === undefined) return
      const loaded = await readDiff($, root, held, staged)
      if ((await read($, repo)) !== root && (await read($, repos)).length > 1) await update($, repo, () => root)
      await update($, diff, () => loaded)
    }),
    closeDiff: guard(async () => {
      await update($, diff, () => null)
    }),
    moreDiff: guard(async () => {
      const shown = await read($, commit)
      if ((await read($, gitSection)) === 'history' && shown !== null && shown.diff !== null) {
        const { path } = shown.diff
        const out = (await peek($, shown.root, ['show', '--format=', '--no-color', shown.sha, '--', path])).out
        await update($, commit, now =>
          now === null || now.sha !== shown.sha || now.diff?.path !== path ? now : { ...now, diff: { path, ...fitHunks(out, moreLines(shown.diff?.shown ?? 0)) } },
        )

        return
      }
      const open = await read($, diff)
      if (open === null) return
      const held = await fileOf(open.root, open.path)
      if (held === undefined) return
      const loaded = await readDiff($, open.root, held, open.isStaged, moreLines(open.shown))
      await update($, diff, now => (now === null || now.path !== open.path ? now : loaded))
    }),
    stage: guard(async (root: string, paths: readonly string[] | 'all', toStaged: boolean) => {
      const named = paths === 'all' ? [] : ['--', ...paths]
      let ran = toStaged
        ? await git($, root, paths === 'all' ? ['add', '--all'] : ['add', ...named])
        : await git($, root, paths === 'all' ? ['reset', '-q'] : ['restore', '--staged', ...named])
      // Before the first commit there is no HEAD to restore the index from.
      if (ran.code !== 0 && !toStaged) ran = await git($, root, ['rm', '--cached', '-r', '-q', ...(paths === 'all' ? ['.'] : named)])
      if (ran.code !== 0) toast($, tail(ran.err || ran.out) || 'git did not take that.', true)
      else {
        await update($, diff, open =>
          open !== null && open.root === root && (paths === 'all' || paths.includes(open.path)) ? { ...open, isStaged: toStaged } : open,
        )
      }
      await refreshGit($)
    }),
    commit: guard(async (root: string, message: string) => {
      const text = message.trim()
      if (text === '') {
        toast($, 'Write a commit message first.', true)

        return
      }
      await update($, busy, () => 'committing')
      try {
        // The repository's own hooks run here, and a slow one is still a commit.
        const ran = await git($, root, ['commit', '-m', text], 180_000)
        toast($, ran.code === 0 ? (ran.out.trim().split('\n')[0] ?? 'Committed.') : tail(ran.err || ran.out) || 'git commit failed.', ran.code !== 0)
      } finally {
        await update($, busy, () => '')
      }
      await refreshGit($)
    }),
    sync: guard(async (root: string, verb: SyncVerb) => {
      const held = (await read($, repos)).find(one => one.root === root)
      if (held === undefined) return
      const args =
        verb === 'fetch' ? ['fetch', '--prune'] : verb === 'pull' ? ['pull', '--ff-only'] : held.upstream === '' ? ['push', '-u', 'origin', held.branch] : ['push']
      await update($, busy, () => (verb === 'fetch' ? 'fetching' : verb === 'pull' ? 'pulling' : 'pushing'))
      try {
        const ran = await git($, root, args, 180_000)
        toast(
          $,
          ran.code === 0 ? (verb === 'fetch' ? 'Fetched.' : verb === 'pull' ? 'Pulled.' : 'Pushed.') : tail(ran.err || ran.out) || `git ${verb} failed.`,
          ran.code !== 0,
        )
      } finally {
        await update($, busy, () => '')
      }
      await refreshGit($)
      await reloadExtras($)
    }),
    mention: guard(async (path: string) => mention($, path)),
    draft: guard(async (text: string) => draft($, text)),
    openDir: guard(async (path: string) => {
      const found = await listDir($, path)
      if (found === null) toast($, 'That folder cannot be read from here.', true)
      else await update($, listing, () => found)
    }),
    openFile: guard(async (path: string, line?: number) => {
      const loaded = await readFile($, norm(path))
      const lines = loaded.text.split('\n').length
      const top = line === undefined ? 0 : Math.max(0, Math.min(lines - 1, line - 1 - Math.floor(VIEW_LINES / 4)))
      await update($, tab, () => 'git')
      await update($, gitSection, () => 'files')
      await update($, file, () => ({ ...loaded, top }))
    }),
    closeFile: guard(async () => {
      const open = await read($, file)
      await update($, file, () => null)
      if (open !== null) {
        const found = await listDir($, dir(open.path))
        if (found !== null) await update($, listing, () => found)
      }
    }),
    pageFile: guard(async (by: number) => {
      await update($, file, open => {
        if (open === null) return open
        const last = Math.max(0, open.text.split('\n').length - VIEW_LINES)

        return { ...open, top: Math.max(0, Math.min(last, open.top + by * VIEW_LINES)) }
      })
    }),
    toggleEdit: guard(async () => {
      const open = await read($, file)
      if (open === null) return
      if (!open.isEditing && open.text.length > MAX_EDIT_CHARS) {
        toast($, `Files over ${Math.round(MAX_EDIT_CHARS / 1000)} KB open read-only here.`, true)

        return
      }
      // Leaving the editor shows the file as it is on disk now.
      const fresh = open.isEditing ? await readFile($, open.path) : open
      await update($, file, () => ({ ...fresh, top: open.top, isEditing: !open.isEditing }))
    }),
    searchFiles: guard(async (query: string) => {
      const wanted = query.trim()
      if (wanted.length < 2) {
        toast($, 'Search for two characters or more.', true)

        return
      }
      await update($, search, () => ({ query: wanted, names: [], hits: [], isCut: false }))
      const found = await searchFolder($, wanted)
      await update($, search, () => found)
    }),
    clearSearch: guard(async () => {
      await update($, search, () => null)
    }),
    openCommit: guard(async (root: string, sha: string) => {
      if (!isSha(sha)) return
      const [own, files] = await Promise.all([peek($, root, commitArgs(sha)), peek($, root, ['show', '--name-status', '--format=', '--no-color', sha])])
      const found = parseCommit(own.out)
      if (found === undefined) {
        toast($, 'git does not know that commit any more.', true)

        return
      }
      await update($, commit, () => ({ root, ...found, files: parseNameStatus(files.out), diff: null }))
    }),
    closeCommit: guard(async () => {
      await update($, commit, () => null)
    }),
    openCommitFile: guard(async (path: string) => {
      const open = await read($, commit)
      if (open === null) return
      if (path === '' || !open.files.some(one => one.path === path)) {
        await update($, commit, now => (now === null ? now : { ...now, diff: null }))

        return
      }
      const out = (await peek($, open.root, ['show', '--format=', '--no-color', open.sha, '--', path])).out
      await update($, commit, now => (now === null || now.sha !== open.sha ? now : { ...now, diff: { path, ...fitHunks(out) } }))
    }),
    openRun: guard(async (id: number) => {
      const held = await read($, runs)
      if (held === null) return
      await update($, run, () => ({ id, jobs: [] }))
      const jobs = await readJobs($, held.root, id)
      await update($, run, now => (now === null || now.id !== id ? now : { id, jobs }))
    }),
    closeRun: guard(async () => {
      await update($, run, () => null)
    }),
    rerun: guard(async (id: number) => {
      const held = await read($, runs)
      const one = held?.items.find(item => item.id === id)
      if (held === null || one === undefined) return
      const ran = await exec($, ['gh', 'run', 'rerun', String(id), ...(one.conclusion === 'failure' ? ['--failed'] : [])], held.root, 30_000)
      toast($, ran.code === 0 ? 'Asked GitHub to run it again.' : tail(ran.err || ran.out, 2) || 'gh could not re-run it.', ran.code !== 0)
      await reloadExtras($)
    }),
    runToPrompt: guard(async (id: number) => {
      const held = await read($, runs)
      const failed = held?.items.find(one => one.id === id)
      if (held === null || failed === undefined) return
      const open = await read($, run)
      const jobs = open !== null && open.id === id && open.jobs.length > 0 ? open.jobs : await readJobs($, held.root, id)
      await draft($, runPrompt(failed, held.branch, jobs))
    }),
    openUrl: guard(async (url: string) => {
      if (!(await browse($, url))) toast($, 'The browser did not open.', true)
    }),
    ask: guard(async (key: string) => {
      await update($, confirming, () => key)
    }),
    cancel: guard(async () => {
      await update($, confirming, () => '')
    }),

    newTerm: guard(async () => newTerm($)),
    pickTerm: guard(async (id: string) => {
      await update($, activeTerm, () => id)
      await update($, tab, () => 'term')
    }),
    closeTerm: guard(async (id: string) => closeTerm($, id)),
    restartTerm: guard(async (id: string) => restartTerm($, id)),
    stopTerm: guard(async (id: string) => stopTerm($, id)),
    clearTerm: guard(async (id: string) => clearTerm($, id)),
    runLine: guard(async (id: string, text: string) => runLine($, id, text)),
    runScript: guard(async (script: Script) => runScript($, script)),
    openBlock: guard(async (id: string) => {
      openBlockId = id
      await update($, blockOpen, () => id)
      const live = lives.get(await read($, activeTerm))
      if (live !== undefined) await flush($, live)
    }),
    copyBlock: guard(async (id: string, surface: string) => {
      const live = lives.get(await read($, activeTerm))
      const block = live?.blocks.find(one => one.id === id) ?? (await read($, memberOf(screen, { requestId: await read($, activeTerm) }))).find(one => one.id === id)
      if (block === undefined) return
      const text = block.lines.map(line => line.text).join('\n')
      const copied = await $.ui.copy({ text, surface: surface as RenderSurface })
      toast($, copied.isCopied ? `Copied ${block.lines.length} lines.` : 'This surface has no clipboard to copy to.', !copied.isCopied)
    }),
    editAgain: guard(async (cmd: string) => {
      await update($, inputFill, now => ({ seq: (now?.seq ?? 0) + 1, text: cmd }))
    }),

    setPortFilter: guard(async (filter: 'dev' | 'all') => {
      await update($, portFilter, () => filter)
    }),
    openPort: guard(async (key: string) => {
      await update($, portOpen, now => (now === key ? '' : key))
      await update($, confirming, () => '')
    }),
    browse: guard(async (key: string) => {
      const row = (await read($, ports)).rows.find(one => one.key === key)
      if (row !== undefined && !(await browse($, `http://localhost:${row.port}/`))) toast($, 'The browser did not open.', true)
    }),
    copyUrl: guard(async (key: string, surface: string) => {
      const row = (await read($, ports)).rows.find(one => one.key === key)
      if (row === undefined) return
      const copied = await $.ui.copy({ text: `http://localhost:${row.port}/`, surface: surface as RenderSurface })
      toast($, copied.isCopied ? `Copied http://localhost:${row.port}/` : 'This surface has no clipboard to copy to.', !copied.isCopied)
    }),
    killPort: guard(async (key: string) => killPort($, key)),
    rescan: guard(async () => refreshPorts($, true)),
  }
}

// ── drawing ─────────────────────────────────────────────────────────────────

/**
 * What a drawing draws from. Each read subscribes the drawing, so a view
 * reads only what it shows: a terminal printing in the background does not
 * redraw the Git view someone is about to click in.
 */
async function model($: Engine, width: number, rows: number, isFocused: boolean, isGrid: boolean, wants: 'pane' | 'band'): Promise<Model> {
  const held = await read($, tab)
  const shownTab: Tab = TABS.includes(held) ? held : 'git'
  const isPane = wants === 'pane'
  const isGit = isPane && shownTab === 'git'
  const isTerm = isPane && shownTab === 'term'
  const isPorts = isPane && shownTab === 'ports'
  const part = isGit ? await read($, gitSection) : 'changes'
  const section: GitSection = SECTIONS.includes(part) ? part : 'changes'
  const active = await read($, activeTerm)
  const termList = await read($, terms)
  const activeId = termList.some(one => one.id === active) ? active : (termList[0]?.id ?? '')

  return {
    isGrid,
    scheme: await read($, scheme),
    mood: await read($, mood),
    width,
    rows,
    isFocused,
    isWindows,
    now: Date.now(),
    home,
    tab: shownTab,
    workspace: await read($, workspace),
    counts: await read($, counts),
    confirming: await read($, confirming),
    busy: isGit ? await read($, busy) : '',
    repos: await read($, repos),
    repo: await read($, repo),
    gitSection: section,
    diff: isGit && section === 'changes' ? await read($, diff) : null,
    listing: isGit && section === 'files' ? await read($, listing) : null,
    file: isGit && section === 'files' ? await read($, file) : null,
    search: isGit && section === 'files' ? await read($, search) : null,
    history: isGit && section === 'history' ? await read($, history) : null,
    commit: isGit && section === 'history' ? await read($, commit) : null,
    pullList: isGit && section === 'pulls' ? await read($, pullList) : null,
    branchPull: isGit && section === 'changes' ? await read($, branchPull) : null,
    runs: isGit && section === 'actions' ? await read($, runs) : null,
    run: isGit && section === 'actions' ? await read($, run) : null,
    terms: termList,
    activeTerm: activeId,
    blocks: isTerm && activeId !== '' ? await read($, memberOf(screen, { requestId: activeId })) : [],
    blockOpen: isTerm ? await read($, blockOpen) : '',
    termHistory: isTerm && activeId !== '' ? await read($, memberOf(termHistory, { requestId: activeId })) : [],
    inputFill: isTerm ? await read($, inputFill) : null,
    scripts: isTerm ? await read($, scripts) : [],
    ports: isPorts || isTerm || !isPane ? await read($, ports) : { rows: [], at: 0, note: '' },
    portFilter: isPorts ? await read($, portFilter) : 'dev',
    portOpen: isPorts ? await read($, portOpen) : '',
  }
}

/** The surface's elements, with each Button's press kept by its key as it is drawn. */
function remembering(kit: Kit, surface: RenderSurface): Kit {
  const drawn = new Map<string, () => void>()
  presses = drawn

  return {
    ...kit,
    Button: props => {
      const key = props.key ?? props.label
      if (key !== undefined) drawn.set(key, () => props.onPress({ surface } as Parameters<typeof props.onPress>[0]))

      return kit.Button(props)
    },
  }
}

export const register: Register = (on, options) => {
  shellOption = typeof options.shell === 'string' ? options.shell.trim() : ''
  loadProfile = options.loadProfile === true

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'workbench',
      description: 'Open the workbench pane: git, PowerShell terminals and the ports listening on this machine',
      argumentHint: '[git|files|history|prs|actions|term|new|ports|run <script>]',
    })
    // DEV-ONLY, remove before release: a tool whose call makes the engine reload this module mid-turn.
    await $.tool.register({ name: 'dev_reload', description: 'Development only: reloads the workbench mod so its latest files take effect.', inputSchema: { type: 'object', properties: {} }, isDeferred: false })
    const cwd = await $.session.cwd()
    isWindows = (await $.env.get('OS')) === 'Windows_NT' || /^[A-Za-z]:[\\/]/.test(cwd)
    const profile = await $.env.get('USERPROFILE')
    const unixHome = await $.env.get('HOME')
    home = norm((isWindows ? profile : unixHome) ?? unixHome ?? profile ?? '')
    beat?.cancel()
    beat = $.clock.every(BEAT_EVERY_MS, () => heartbeat($))
    // A reload ended every PowerShell this module held: their tabs say so and keep their output.
    const held = await read($, terms)
    if (held.some(one => one.state !== 'ended' && !lives.has(one.id))) {
      await update($, terms, list =>
        list.map(one =>
          one.state === 'ended' || lives.has(one.id)
            ? one
            : { ...one, state: 'ended' as const, pid: 0, note: 'The plugin reloaded, which ended this PowerShell. Restart it to go on.' },
        ),
      )
      await recount($)
    }
    void read($, isOn)
      .then(isOpen => (isOpen ? openPane($, false) : undefined))
      .catch(() => undefined)

    return next(e)
  })

  // DEV-ONLY, remove before release.
  on('tool.call', { tool: 'mcp__workbench__dev_reload' }, async () => ({ result: 'Reloaded the workbench mod.', text: 'Reloaded the workbench mod.' }))

  // The mascot follows Claude: thinking through a turn, a look for each tool it calls,
  // waiting while a call is put to the person, then done (or knocked over) and back to sleep.
  on('turn.start', async ($, e, next) => {
    inTurn = true
    helpers = 0
    acting.length = 0
    settle?.cancel()
    await setMood($, 'think')

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && inTurn) await setMood($, moodNow())

    return yield* next(e)
  })

  on('tool.call', async ($, e, next) => {
    const look = moodOfTool(e.tool)
    if (look === 'helpers') helpers += 1
    else acting.push(look)
    if (inTurn) await setMood($, moodNow())
    try {
      return await next(e)
    } finally {
      if (look === 'helpers') helpers = Math.max(0, helpers - 1)
      else acting.splice(acting.lastIndexOf(look), 1)
      if (inTurn) await setMood($, moodNow())
    }
  })

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (e.tool_use_id !== undefined && verdict.decision === 'ask') await setMood($, 'wait')

    return verdict
  })

  on('session.compact', async ($, e, next) => {
    if (e.trigger === 'precompute' || e.agentId !== undefined) return next(e)
    await setMood($, 'compact')
    try {
      return await next(e)
    } finally {
      await setMood($, inTurn ? moodNow() : 'sleep')
    }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      inTurn = false
      helpers = 0
      acting.length = 0
      const isOk = e.reason === 'answer' && !e.isAborted
      await setMood($, isOk ? 'done' : 'oops')
      settle?.cancel()
      settle = $.clock.after(isOk ? DONE_MS : OOPS_MS, () => void setMood($, 'sleep'))
    }

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    for (const live of [...lives.values(), ...(system === undefined ? [] : [system])]) dismiss($, live)

    return next(e)
  })

  on('command.run', { command: 'workbench' }, async ($, e) => {
    const [first = '', ...restArgs] = e.args.trim().split(/\s+/)
    const asked = first.toLowerCase()
    const show = async (id: Tab, section?: GitSection): Promise<void> => {
      await update($, tab, () => id)
      if (section !== undefined) await update($, gitSection, () => section)
    }
    if (asked === '' || asked === 'git' || asked === 'changes') await show('git', asked === '' ? undefined : 'changes')
    else if (asked === 'files') await show('git', 'files')
    else if (asked === 'history' || asked === 'log') await show('git', 'history')
    else if (/^(prs?|pulls?)$/.test(asked)) await show('git', 'pulls')
    else if (asked === 'actions' || asked === 'runs' || asked === 'ci') await show('git', 'actions')
    else if (/^(term|terms|terminal|terminals|shell|pwsh)$/.test(asked)) await show('term')
    else if (asked === 'ports' || asked === 'servers' || asked === 'services') await show('ports')
    else if (asked === 'new') await newTerm($)
    else if (asked === 'run') {
      await refreshGit($)
      await refreshScripts($)
      const name = restArgs.join(' ').toLowerCase()
      const list = await read($, scripts)
      const script = list.find(one => one.label.toLowerCase() === name) ?? list.find(one => one.label.toLowerCase().startsWith(name))
      if (name === '' || script === undefined) {
        const known = list.slice(0, 20).map(one => one.label).join(', ')

        return { text: name === '' ? `Name a script to run. ${known === '' ? 'None found here.' : `Found: ${known}.`}` : `No script "${name}". ${known === '' ? 'None found here.' : `Found: ${known}.`}` }
      }
      await runScript($, script)
    } else {
      return { text: `No "${asked}" view. Try git, files, history, prs, actions, term, new, ports, or run <script>.` }
    }
    void refreshGit($)
    const placed = await openPane($, true)
    void reloadExtras($).catch(() => undefined)

    return placed.isPlaced ? {} : { text: `The workbench pane is waiting: ${placed.reason}` }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    // Closed by hand: no more polling until it is opened again. Terminals keep running.
    if (e.origin.kind === 'person') {
      await update($, isOn, () => false)
      rest()
    }

    return next(e)
  })

  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    const isFirstClick = isDesktopFocused === false && !hasGrid && e.origin.kind === 'person' && e.element !== undefined
    const press = e.element === undefined ? undefined : presses.get(e.element)
    const moved = await next(e)
    if (isFirstClick && press !== undefined && moved.deny === undefined) {
      answered = { key: e.element ?? '', at: Date.now() }
      press()
    }

    return moved
  })

  on('ui.press', { requestId: PANE }, async ($, e, next) => {
    // Should the app raise the press too, it is not done twice.
    if (answered.key !== '' && e.element === answered.key && Date.now() - answered.at < ECHO_MS) return { element: e.element }

    return next(e)
  })

  on('ui.message', async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const data = obj(e.data)
    if (e.element === EDITOR) {
      await hearEditor($, data)

      return {}
    }
    if (!e.element.startsWith(INPUT)) return next(e)
    const id = str(data.termId)
    if (id === '' || e.element !== `${INPUT}${id}`) return {}
    if (data.type === 'run') void runLine($, id, str(data.text)).catch((error: unknown) => toast($, reasonOf(error), true))
    else if (data.type === 'stop') void stopTerm($, id)
    else if (data.type === 'clear') void clearTerm($, id)
    else if (data.type === 'restart') void restartTerm($, id)
    else if (data.type === 'copy') {
      // The line selected with ctrl+a, copied with ctrl+c, as in a PowerShell window.
      const copied = await $.ui.copy({ text: str(data.text), surface: e.surface })
      if (!copied.isCopied) toast($, 'This surface has no clipboard to copy to.', true)
    }
    else if (data.type === 'paste') {
      const seq = typeof data.seq === 'number' ? data.seq : 0
      const text = await readClipboard($)
      const drawn = inputDrawn.get(id)
      if (drawn !== undefined) return { props: { ...drawn, paste: { seq, text } } }
    } else if (data.type === 'complete') {
      const seq = typeof data.seq === 'number' ? data.seq : 0
      const cursor = typeof data.cursor === 'number' ? data.cursor : 0
      const found = await complete($, id, str(data.text), cursor)
      const drawn = inputDrawn.get(id)
      if (drawn !== undefined) return { props: { ...drawn, completion: { seq, ...found } } }
    }

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const rows = e.props.placement === 'dock' ? e.props.scroll.bodyRows : 0
    const isGrid = e.surface === 'terminal'
    if (isGrid) hasGrid = true
    if (e.surface === 'desktop') isDesktopFocused = e.props.isFocused
    // As wide as the pane's terminal screen, so PowerShell's tables fit it.
    termColumns = Math.max(40, e.props.bodyColumns - 6)
    const { Box, Text, Button, Code, Input, Svg } = $.ui.resolve(e) as Kit
    const { Client } = $.ui.resolve(e) as Partial<Elements['terminal']>
    const kit: Kit = {
      Box,
      Text,
      Button,
      Code,
      ...(Input === undefined ? {} : { Input }),
      ...(Svg === undefined || isGrid ? {} : { Svg }),
      // Surface modules, named here because the engine reads their paths off this file's own source.
      ...(Client === undefined
        ? {}
        : {
            termInput: (props: InputProps) => {
              inputDrawn.set(props.termId, props)

              // The whole screen, as wide as the window and down to its foot, so a click anywhere there takes the keys.
              return <Client key={`${INPUT}${props.termId}`} module="./terminal-input.tsx" props={props} width="100%" flexGrow={1} />
            },
            editor: (props: EditorProps) => <Client key={EDITOR} module="./editor.tsx" props={props} />,
          }),
    }

    return pane(remembering(kit, e.surface), await model($, e.props.bodyColumns - 2, rows, e.props.isFocused, isGrid, 'pane'), actions($))
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const isOpen = await read($, isOn)
    const running = (await read($, counts)).running
    if (!isOpen && running === 0) return next(e)
    const panes = await $.ui.panes()
    if (panes.some(one => one.id === PANE && one.isPlaced && one.isShown)) return next(e)
    const { Box, Text, Button, Code } = $.ui.resolve(e) as Kit
    const drawn = band({ Box, Text, Button, Code }, await model($, e.props.bodyColumns, 0, false, e.surface === 'terminal', 'band'), actions($))

    return drawn ?? next(e)
  })
}
