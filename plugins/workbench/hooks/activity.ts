import type { Activity, Source, Spend, Worker } from '../types'
import { norm } from './paths'
import { writtenPath } from './touched'

// What a turn's time went on, for the card beside the mascot. The time is
// split as it passes, so the parts always add up to the whole: each stretch
// goes to the latest tool call at work, else to the person while a dialog or
// a question waits on them, else to a call whose permission is being
// decided, else to what the model is streaming (thinking, or writing a reply
// or a call's arguments). Nothing here calls the engine; `register.tsx`
// feeds it.

const SEARCHING = new Set(['Grep', 'Glob', 'LS', 'ToolSearch', 'WebSearch', 'WebFetch'])
const READING = new Set(['Read', 'NotebookRead', 'ListMcpResourcesTool', 'ReadMcpResourceTool', 'ReadMcpResourceDirTool'])
const RUNNING = new Set(['Bash', 'PowerShell', 'BashOutput', 'KillShell', 'Monitor', 'TaskStop'])
const WRITING = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit'])
const HELPERS = new Set(['Agent', 'Task'])
const ASKING = new Set(['AskUserQuestion', 'ExitPlanMode'])
const BROWSER = /^mcp__(Claude_Browser|claude-in-chrome)__/

/** The bar's order: the tools, waiting on the person, then the thinking between them. */
export const SPENDS: readonly Spend[] = ['search', 'read', 'run', 'write', 'agents', 'other', 'wait', 'think']

export function spendOfTool(tool: string): Spend {
  if (HELPERS.has(tool)) return 'agents'
  if (ASKING.has(tool)) return 'wait'
  if (READING.has(tool)) return 'read'
  if (SEARCHING.has(tool) || BROWSER.test(tool)) return 'search'
  if (RUNNING.has(tool) || tool.startsWith('mcp__terminal__')) return 'run'
  if (WRITING.has(tool)) return 'write'

  return 'other'
}

/** A tool call the turn holds: what kind of work it is, and whether it runs yet or its permission is still being decided. */
export type Call = { spend: Spend; isStarted: boolean }

/**
 * What the time goes on now, the calls the latest last: the latest call at
 * work; else the person, while `isPrompting` (a dialog is up) or a question
 * to them runs; else the latest call whose permission is being decided (the
 * auto-mode check is the call's own overhead, not the person's); else what
 * the model streams, thinking when it streams nothing yet.
 */
export function spendNow(calls: readonly Call[], isPrompting: boolean, streaming: Spend | undefined): Spend {
  const working = calls.filter(one => one.isStarted && one.spend !== 'wait')
  const last = working[working.length - 1]
  if (last !== undefined) return last.spend
  if (isPrompting || calls.some(one => one.isStarted && one.spend === 'wait')) return 'wait'
  const checking = calls.filter(one => !one.isStarted)

  return checking[checking.length - 1]?.spend ?? streaming ?? 'think'
}

/** A call the turn holds, by its id: its loop (`''` the main one), its tool, and whether a dialog about it is up. */
export type HeldCall = Call & { loop: string; tool: string; isPrompting: boolean }

/** The turn's calls in every loop, the latest last, and dialogs no call could be matched to, by loop. */
export type Ledger = { calls: Map<string, HeldCall>; strays: string[] }

export const ledger = (): Ledger => ({ calls: new Map(), strays: [] })

/** Forgets every call and dialog: a turn begins or ends. */
export function clearLedger(held: Ledger): void {
  held.calls.clear()
  held.strays.length = 0
}

/** A call's permission is being decided: held from here, not running yet. Whether it was new. */
export function checking(held: Ledger, id: string, tool: string, loop: string): boolean {
  if (held.calls.has(id)) return false
  held.calls.set(id, { spend: spendOfTool(tool), isStarted: false, loop, tool, isPrompting: false })

  return true
}

/** A dialog is put to the person about `loop`'s latest call of `tool` that waits; one matching none still counts. */
export function prompting(held: Ledger, loop: string, tool: string): void {
  const asked = [...held.calls.values()].reverse().find(one => one.loop === loop && one.tool === tool && !one.isStarted && !one.isPrompting)
  if (asked === undefined) held.strays.push(loop)
  else asked.isPrompting = true
}

/** A call runs: the latest at work from now, its own dialog over, and a stray one of its loop taken as answered. */
export function starting(held: Ledger, key: string, tool: string, loop: string): void {
  held.calls.delete(key)
  held.calls.set(key, { spend: spendOfTool(tool), isStarted: true, loop, tool, isPrompting: false })
  const stray = held.strays.indexOf(loop)
  if (stray >= 0) held.strays.splice(stray, 1)
}

/** A call is over. */
export function ending(held: Ledger, key: string): void {
  held.calls.delete(key)
}

/** A call that never ran was refused; whether one was. */
export function refusing(held: Ledger, id: string): boolean {
  return held.calls.get(id)?.isStarted === false && held.calls.delete(id)
}

/** A loop moved on (it asks its model again, or it ended): its calls that never ran were refused, its dialogs are gone. */
export function settling(held: Ledger, loop: string): void {
  for (const [id, one] of held.calls) if (one.loop === loop && !one.isStarted) held.calls.delete(id)
  for (let at = held.strays.length - 1; at >= 0; at -= 1) if (held.strays[at] === loop) held.strays.splice(at, 1)
}

/** Whether a dialog is up, waiting on the person. */
export const isPrompting = (held: Ledger): boolean => held.strays.length > 0 || [...held.calls.values()].some(one => one.isPrompting && !one.isStarted)

/** What the time goes on now, by the ledger and what the main loop's model streams. */
export const spendOfLedger = (held: Ledger, streaming: Spend | undefined): Spend => spendNow([...held.calls.values()], isPrompting(held), streaming)

/**
 * What a piece of a model's response says it is doing: reasoning is
 * thinking; the reply, a call's name and its arguments are writing;
 * anything else says nothing new.
 */
export function spendOfChunk(kind: string): Spend | undefined {
  if (kind === 'thinking') return 'think'
  if (kind === 'text' || kind === 'tool' || kind === 'input') return 'write'

  return undefined
}

const nothing = (): Record<Spend, number> => ({ search: 0, read: 0, run: 0, write: 0, agents: 0, other: 0, wait: 0, think: 0 })

export function worker(id: string, at: number, fields: Partial<Worker> = {}): Worker {
  return { id, model: '', effort: '', type: '', task: '', doing: 'think', since: at, startedAt: at, endedAt: 0, ...fields }
}

/** A turn begun at `at`, the main loop on the model it ran on last. */
export function startTurn(turnId: string, at: number, model = '', effort = ''): Activity {
  return {
    turnId,
    startedAt: at,
    endedAt: 0,
    outcome: 'running',
    steps: 0,
    spent: nothing(),
    at,
    now: 'think',
    since: at,
    workers: [worker('', at, { model, effort })],
    sources: [],
  }
}

/** The time since the last charge goes to what was going on; from `at` on it goes to `now`, from then when that is new. */
export function charge(a: Activity, at: number, now: Spend = a.now): Activity {
  if (a.outcome !== 'running') return a
  const gone = Math.max(0, at - a.at)
  const until = Math.max(a.at, at)
  // A record kept before `since` was: its stretch began when it was last charged.
  const since = now === a.now ? (a.since ?? a.at) : until

  return { ...a, spent: { ...a.spent, [a.now]: a.spent[a.now] + gone }, at: until, now, since }
}

/** Each kind's time as of `at`, the stretch still going included. */
export const totals = (a: Activity, at: number): Record<Spend, number> => charge(a, at).spent

/** The turn's length as of `at`. */
export const elapsed = (a: Activity, at: number): number => Math.max(0, (a.endedAt === 0 ? at : a.endedAt) - a.startedAt)

/** A worker's fields changed, or a new one started; the same record back when nothing did. */
export function setWorker(a: Activity, id: string, at: number, fields: Partial<Worker>): Activity {
  const held = a.workers.find(one => one.id === id)
  if (held === undefined) return { ...a, workers: [...a.workers, worker(id, at, fields)] }
  const next: Worker = { ...held, ...fields, ...(fields.doing !== undefined && fields.doing !== held.doing ? { since: at } : {}) }
  if ((Object.keys(next) as (keyof Worker)[]).every(key => next[key] === held[key])) return a

  return { ...a, workers: a.workers.map(one => (one.id === id ? next : one)) }
}

/**
 * The turn ended at `at`: the last stretch charged and the main loop done or
 * stopped. A stopped turn stops its subagents too; a finished one leaves those
 * in the background running.
 */
export function finish(a: Activity, at: number, isOk: boolean): Activity {
  const charged = charge(a, at)
  const ended = (one: Worker): Worker => ({ ...one, doing: isOk ? 'done' : 'stopped', since: at, endedAt: at })

  return {
    ...charged,
    endedAt: at,
    outcome: isOk ? 'done' : 'stopped',
    workers: charged.workers.map(one => (one.id === '' || (!isOk && one.endedAt === 0) ? ended(one) : one)),
  }
}

export const MAX_SOURCES = 60

const text = (input: Readonly<Record<string, unknown>>, key: string): string => {
  const value = input[key]

  return typeof value === 'string' ? value.trim() : ''
}

/** What a tool call looked at, or the file it wrote; `undefined` for a call that names neither. */
export function sourceOf(tool: string, given: object): Source | undefined {
  const input = given as Readonly<Record<string, unknown>>
  const written = writtenPath(tool, input)
  if (written !== '') return { kind: 'edit', label: written }
  const found = ((): Source | undefined => {
    if (tool === 'Read' || tool === 'NotebookRead') return { kind: 'file', label: norm(text(input, 'file_path') || text(input, 'notebook_path')) }
    if (tool === 'Grep' || tool === 'Glob') return { kind: 'search', label: text(input, 'pattern') }
    if (tool === 'WebSearch') return { kind: 'web', label: text(input, 'query') }
    if (tool === 'WebFetch' || (BROWSER.test(tool) && tool.endsWith('navigate'))) return { kind: 'web', label: text(input, 'url') }

    return undefined
  })()

  return found === undefined || found.label === '' ? undefined : found
}

/** `source` first, said once, the list kept short. */
export function addSource(list: readonly Source[], source: Source): Source[] {
  return [source, ...list.filter(one => one.kind !== source.kind || one.label !== source.label)].slice(0, MAX_SOURCES)
}

const capital = (word: string): string => (word === '' ? word : `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)

/**
 * A model as people say it: `claude-opus-5-5` is Opus 5.5,
 * `claude-3-5-sonnet-20241022` Sonnet 3.5, a cloud's
 * `us.anthropic.claude-haiku-4-5-20251001-v1:0` Haiku 4.5.
 */
export function modelName(id: string): string {
  const bare = id.replace(/\[[^\]]*\]$/, '').replace(/^.*?claude-/, '').split(/[@:]/)[0] ?? ''
  const parts = bare.split('-').filter(part => part !== '' && !/^\d{8}$/.test(part) && !/^v\d+$/.test(part))
  const words = parts.filter(part => !/^\d+$/.test(part)).map(capital)
  const version = parts.filter(part => /^\d+$/.test(part)).join('.')
  if (words.length === 0) return id

  return version === '' ? words.join(' ') : `${words.join(' ')} ${version}`
}

/** An effort level as its badge says it. */
export function effortName(effort: string | number | undefined): string {
  if (effort === undefined || effort === '') return ''
  if (typeof effort === 'number') return String(effort)
  if (effort === 'xhigh') return 'X-High'

  return capital(effort)
}

/**
 * `width` cells shared out among the parts by their size, largest remainder
 * first; a part too small for a cell of its own gets none.
 */
export function cells(sizes: readonly number[], width: number): number[] {
  const sum = sizes.reduce((all, one) => all + Math.max(0, one), 0)
  if (sum <= 0 || width <= 0) return sizes.map(() => 0)
  const exact = sizes.map(one => (Math.max(0, one) / sum) * width)
  const whole = exact.map(Math.floor)
  let left = width - whole.reduce((all, one) => all + one, 0)
  const order = exact.map((one, at) => ({ at, rest: one - Math.floor(one) })).sort((x, y) => y.rest - x.rest)
  for (const { at } of order) {
    if (left <= 0) break
    whole[at] = (whole[at] ?? 0) + 1
    left -= 1
  }

  return whole
}
