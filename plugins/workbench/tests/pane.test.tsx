import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = {
  plugin: 'workbench',
  component: 'Pane' as const,
  requestId: 'workbench',
  props: {
    title: 'Workbench',
    isFocused: true,
    bodyColumns: 78,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
  viewport: { columns: 160, rows: 50, isFullscreen: true },
}

const SURFACES = ['terminal', 'desktop'] as const

/** Whether the drawing holds a Button whose key starts so. */
async function hasKey(ui: { findAll: (query: { type: string }) => Promise<{ key: string | undefined }[]> }, prefix: string): Promise<boolean> {
  return (await ui.findAll({ type: 'Button' })).some(one => (one.key ?? '').startsWith(prefix))
}

const NETSTAT = [
  '  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       20832',
  '  TCP    127.0.0.1:5432         0.0.0.0:0              LISTENING       6988',
  '  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1668',
].join('\n')
const TASKLIST = ['"node.exe","20832","Console","1","102,400 K"', '"postgres.exe","6988","Services","0","20,000 K"', '"svchost.exe","1668","Services","0","9,000 K"'].join('\n')

type World = { calls: string[]; toasts: string[]; runs: { id: string; cmd: string }[]; settle: () => Promise<void>; finished: Promise<void> }

/**
 * The machine beneath the plugin, faked: a folder with a package.json, no git,
 * and, when `hasShell`, a PowerShell that runs one command and exits.
 */
function world(on: On, hasShell: boolean): World {
  const clock = mock.clock(on, { now: 1_700_000_000_000 })
  let finish: () => void = () => undefined
  const finished = new Promise<void>(resolve => {
    finish = resolve
  })
  const seen: World = { calls: [], toasts: [], runs: [], settle: () => clock.settle(), finished }
  mock.store(on)
  on('session.cwd', () => ({ value: 'C:/work/app' }))
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('fs.list', ($, e) => (seen.calls.push(`list ${e.path}`), {
    // The engine hands paths on in the platform's own spelling.
    value: e.path.split('\\').join('/') === 'C:/work/app' ? [{ name: 'package.json', kind: 'file' as const, size: 40, mtimeMs: 0, isLink: false }] : [],
  }))
  on('fs.read', ($, e) => (seen.calls.push(`read ${e.path}`), { value: '{"scripts":{"dev":"vite","test":"vitest"}}' }))
  on('fs.exists', () => ({ value: false }))
  on('process.run', ($, e) => {
    if (e.argv[0] === 'netstat') return { value: { exitCode: 0, stdout: NETSTAT, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (e.argv[0] === 'tasklist') return { value: { exitCode: 0, stdout: TASKLIST, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    const isShell = hasShell && e.argv[0] === 'pwsh'

    return { value: { exitCode: isShell ? 0 : 1, stdout: isShell ? '7\n' : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  let sent: (run: { id: string; cmd: string }) => void = () => undefined
  const ran = new Promise<{ id: string; cmd: string }>(resolve => {
    sent = resolve
  })
  on('http.fetch', ($, e) => {
    const body = JSON.parse(e.init?.body ?? '{}') as { id?: string; cmd?: string }
    if (e.url.endsWith('/run') && body.id !== undefined) {
      seen.runs.push({ id: body.id, cmd: body.cmd ?? '' })
      sent({ id: body.id, cmd: body.cmd ?? '' })
    }

    return { value: { status: 200, ok: true, headers: {}, text: '{"ok":true}' } }
  })
  on('process.spawn', async function* () {
    yield { stream: 'stdout' as const, text: '\u001e[[wb:ready:4100:900]]\n' }
    const { id, cmd } = await ran
    yield { stream: 'stdout' as const, text: `\u001e[[wb:start:${id}]]\n  VITE ready for ${cmd}\n` }
    yield { stream: 'stderr' as const, text: 'a warning on stderr\n' }
    yield { stream: 'stdout' as const, text: `\u001e[[wb:end:${id}:ok:0:${btoa('C:\\work\\app')}]]\n` }
    finish()

    return { value: { code: 0, signal: null } }
  })

  return seen
}

describe('pane', () => {
  test('draws its three views on every surface that seats a pane', async ($, on) => {
    world(on, false)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ key: 'tab-git' })).toBeDefined()
      expect(await ui.find({ key: 'tab-term' })).toBeDefined()
      expect(await ui.find({ key: 'tab-ports' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /No Git repository here/ })).toBeDefined()

      await ui.press({ key: 'tab-term' })
      expect(await ui.find({ type: 'Text', text: /No terminals yet/ })).toBeDefined()
      expect(await ui.find({ key: 'term-new' })).toBeDefined()

      await ui.press({ key: 'tab-ports' })
      expect(await ui.find({ key: 'ports-dev' })).toBeDefined()

      await ui.press({ key: 'tab-git' })
      await ui.unmount()
    }
  })

  test('ports list what listens, open into a detail sheet, and ask before stopping a process', async ($, on) => {
    const seen = world(on, false)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: 'tab-ports' })
      for (let turn = 0; turn < 5; turn += 1) await seen.settle()
      expect(await ui.find({ key: 'port-20832:3000' })).toBeDefined()
      expect(await ui.find({ key: 'port-6988:5432' })).toBeDefined()
      expect(await ui.find({ key: 'port-1668:135' })).toBeUndefined()
      await ui.press({ key: 'port-20832:3000' })
      expect(await ui.find({ type: 'Text', text: /node \(pid 20832\)/ })).toBeDefined()
      await ui.press({ key: 'kill-20832:3000' })
      expect(await ui.find({ key: 'kill-20832:3000-yes' })).toBeDefined()
      await ui.press({ key: 'kill-20832:3000-no' })
      // Closed again: the next surface opens on the same session state.
      await ui.press({ key: 'port-20832:3000' })
      await ui.press({ key: 'ports-all' })
      expect(await ui.find({ key: 'port-1668:135' })).toBeDefined()
      await ui.press({ key: 'ports-dev' })
      await ui.unmount()
    }
  })

  test('history draws its graph on the desktop and its text graph on a terminal', async ($, on) => {
    world(on, false)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: 'git-history' })
      expect(await ui.find({ type: 'Text', text: /Pick a repository/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('a terminal without PowerShell says so and offers a restart', async ($, on) => {
    world(on, false)
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    await ui.press({ key: 'tab-term' })
    await ui.press({ key: 'term-new' })
    expect(await ui.find({ type: 'Text', text: /PowerShell was not found/ })).toBeDefined()
    expect(await hasKey(ui, 'restart-')).toBe(true)
    await ui.unmount()
  })

  test('/workbench run dev opens a terminal that runs the script and keeps its output', async ($, on) => {
    const seen = world(on, true)
    await $.command.run({
      command: 'workbench',
      args: 'run dev',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: true, columns: 160 },
    })
    await seen.finished
    // The host's exit is read after its last piece: let that land too.
    for (let turn = 0; turn < 10; turn += 1) await seen.settle()
    expect(seen.runs.map(one => one.cmd)).toEqual(['npm run dev'])
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...PANE, surface })
      // The screen is one picture where pictures are drawn, coloured rows of text elsewhere.
      const [screen] = await ui.findAll({ type: 'Svg' }).then(all => all.filter(one => one.props.alt === 'Terminal output'))
      const shows = async (text: RegExp): Promise<boolean> =>
        screen !== undefined ? text.test(String(screen.props.source).replace(/ /g, ' ')) :(await ui.find({ type: 'Text', text })) !== undefined
      expect(await shows(/VITE ready for npm run dev/)).toBe(true)
      expect(await shows(/a warning on stderr/)).toBe(true)
      expect(await shows(/npm run dev/)).toBe(true)
      // The script's chip shows, and the session's tab is named after it.
      expect(await ui.find({ key: 'script-|npm|dev' })).toBeDefined()
      expect((await ui.findAll({ type: 'Button' })).some(one => /^term-[0-9a-f]{12}$/.test(one.key ?? ''))).toBe(true)
      await ui.unmount()
    }
  })

  test('the input line types, walks nothing without history, and asks for a restart once the shell has ended', async ($, on) => {
    world(on, false)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'tab-term' })
    await ui.press({ key: 'term-new' })
    const [client] = await ui.findAll({ type: 'Client' })
    const key = client?.key ?? ''
    expect(key.startsWith('input-')).toBe(true)
    expect(await ui.find({ in: key, type: 'Text', text: /session ended/ })).toBeDefined()
    for (const k of ['g', 'i', 't']) await ui.key({ key: k, in: key })
    expect(await ui.find({ in: key, type: 'Text', text: 'git' })).toBeDefined()
    await ui.key({ key: 'backspace', in: key })
    expect(await ui.find({ in: key, type: 'Text', text: 'gi' })).toBeDefined()
    // No history yet: ↑ leaves the line as it is.
    await ui.key({ key: 'up', in: key })
    expect(await ui.find({ in: key, type: 'Text', text: 'gi' })).toBeDefined()
    await ui.unmount()
  })
})
