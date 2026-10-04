import type { Register } from 'claude-code'

const TTL_MS = 60 * 60 * 1000

let deadline = 0
let ticking = false

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function format(ms: number) {
  if (ms <= 0) return '⏱ expired'
  const s = Math.ceil(ms / 1000)
  return '⏱ ' + pad(Math.floor(s / 60)) + ':' + pad(s % 60)
}

// Deadlines per session id, kept across restarts so a resumed chat counts from its own last reply.
async function remember($: any) {
  const id = await $.session.id()
  const now = await $.clock.now()
  const saved = ((await $.store.get('deadlines')) ?? {}) as Record<string, number>
  const kept: Record<string, number> = {}
  for (const k of Object.keys(saved)) if (saved[k] > now) kept[k] = saved[k]
  kept[id] = deadline
  await $.store.set('deadlines', kept)
}

// Timestamp of the chat's last assistant message, read from its transcript; 0 when unknown.
// (The file's own mtime is no good: opening a chat rewrites bookkeeping lines at its end.)
async function transcriptTime($: any) {
  const id = await $.session.id()
  const root = String($.plugin.root).split(String.fromCharCode(92)).join('/')
  const cut = root.indexOf('/plugins/')
  if (cut < 0) return 0
  const projects = root.slice(0, cut) + '/projects'
  const cwd = String(await $.session.cwd())
  let file = projects + '/' + cwd.replace(/[^A-Za-z0-9]/g, '-') + '/' + id + '.jsonl'
  if (!(await $.fs.exists(file))) {
    file = ''
    for (const dir of await $.fs.list(projects)) {
      const candidate = projects + '/' + dir.name + '/' + id + '.jsonl'
      if (await $.fs.exists(candidate)) {
        file = candidate
        break
      }
    }
  }
  if (file === '') return 0
  const lines = String(await $.fs.read(file)).split(String.fromCharCode(10))
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].indexOf('"type":"assistant"') < 0) continue
    const at = Date.parse(JSON.parse(lines[i]).timestamp)
    if (at > 0) return at
  }
  return 0
}

async function show($: any) {
  $.ui.status(format(deadline - (await $.clock.now())))
  if (ticking) return
  ticking = true
  $.clock.every(1000, async () => {
    $.ui.status(format(deadline - (await $.clock.now())))
  })
}

export const register: Register = on => {
  // A resumed chat counts from its own last reply; a chat with none shows nothing.
  on('session.start', async ($, e, next) => {
    const id = await $.session.id()
    const saved = ((await $.store.get('deadlines')) ?? {}) as Record<string, number>
    let last = 0
    if (typeof saved[id] !== 'number') {
      try {
        last = await transcriptTime($)
      } catch (err) {
        last = 0
      }
    }
    if (typeof saved[id] === 'number') deadline = saved[id]
    else if (last > 0) deadline = last + TTL_MS
    if (deadline > 0) await show($)
    return next(e)
  })

  // The window restarts from each finished reply.
  on('turn.complete', async ($, e, next) => {
    deadline = (await $.clock.now()) + TTL_MS
    await remember($)
    await show($)
    return next(e)
  })
}
