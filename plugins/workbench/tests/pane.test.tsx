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

type Found = { key: string | undefined; text?: string; props: Record<string, unknown> }

/**
 * The terminal's screen as the input module draws it: the rows it is handed, a line
 * each, then every text it draws itself (the prompt and its note), spaces as typed.
 */
async function screenText(ui: { findAll: (query: { type: string; in?: string }) => Promise<Found[]> }): Promise<string> {
  const [client] = (await ui.findAll({ type: 'Client' })).filter(one => (one.key ?? '').startsWith('input-'))
  if (client === undefined) return ''
  const handed = (client.props.props as { screen?: { text: string }[][] } | undefined)?.screen ?? []
  const rows = handed.map(row => row.map(span => span.text).join(''))
  const texts = (await ui.findAll({ in: client.key ?? '', type: 'Text' })).map(one => one.text ?? '')

  return [...rows, ...texts].join(String.fromCharCode(10)).split(String.fromCharCode(160)).join(' ')
}

const NETSTAT = [
  '  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       20832',
  '  TCP    127.0.0.1:5432         0.0.0.0:0              LISTENING       6988',
  '  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1668',
].join('\n')
const TASKLIST = ['"node.exe","20832","Console","1","102,400 K"', '"postgres.exe","6988","Services","0","20,000 K"', '"svchost.exe","1668","Services","0","9,000 K"'].join('\n')

type World = {
  calls: string[]
  toasts: string[]
  runs: { id: string; cmd: string }[]
  settle: () => Promise<void>
  advance: (ms: number) => Promise<void>
  finished: Promise<void>
}

/**
 * The machine beneath the plugin, faked: a folder with a package.json, no git,
 * and, when `hasShell`, a PowerShell that runs one command and exits; with `runsMs`,
 * the command keeps running that long on the mocked clock, as a server does.
 */
function world(on: On, hasShell: boolean, stored: Readonly<Record<string, unknown>> = {}, runsMs = 0, printed?: string): World {
  const clock = mock.clock(on, { now: 1_700_000_000_000 })
  let finish: () => void = () => undefined
  const finished = new Promise<void>(resolve => {
    finish = resolve
  })
  const seen: World = { calls: [], toasts: [], runs: [], settle: () => clock.settle(), advance: ms => clock.advance(ms), finished }
  mock.store(on, stored)
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
    yield { stream: 'stdout' as const, text: `\u001e[[wb:start:${id}]]\n${printed ?? `  VITE ready for ${cmd}\n`}` }
    yield { stream: 'stderr' as const, text: 'a warning on stderr\n' }
    if (runsMs > 0) await clock.sleep(runsMs)
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
    expect(await screenText(ui)).toMatch(/PowerShell was not found/)
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
      // The screen is drawn by the terminal's input module, as rows of coloured text.
      const drawn = await screenText(ui)
      const shows = async (text: RegExp): Promise<boolean> => text.test(drawn)
      expect(await shows(/VITE ready for npm run dev/)).toBe(true)
      expect(await shows(/a warning on stderr/)).toBe(true)
      expect(await shows(/npm run dev/)).toBe(true)
      // The session's tab, named after the script, is the only thing above its screen.
      expect(await ui.find({ key: 'script-|npm|dev' })).toBeUndefined()
      expect((await ui.findAll({ type: 'Button' })).some(one => /^term-[0-9a-f]{12}$/.test(one.key ?? ''))).toBe(true)
      await ui.unmount()
    }
  })

  /** Types `line` into the open terminal and presses Enter. */
  async function typeLine(ui: { key: (args: { key: string; in: string }) => Promise<unknown> }, key: string, line: string): Promise<void> {
    for (const k of line) await ui.key({ key: k === ' ' ? 'space' : k, in: key })
    await ui.key({ key: 'return', in: key })
  }

  test('a command that keeps running names its tab; one that ends at once does not', async ($, on) => {
    const seen = world(on, true, {}, 60_000)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await seen.settle()
    await ui.press({ key: 'tab-term' })
    await ui.press({ key: 'term-new' })
    await seen.settle()
    expect(await ui.find({ type: 'Text', text: /^pwsh 1$/ })).toBeDefined()
    const [client] = await ui.findAll({ type: 'Client' })
    await typeLine(ui, client?.key ?? '', 'npm run dev')
    // Not yet: a command that ended within the moment keeps the tab's name.
    await seen.advance(1_000)
    expect(await ui.find({ type: 'Text', text: /^pwsh 1$/ })).toBeDefined()
    // Still running past it, as a dev server is: the tab takes the script's name.
    await seen.advance(1_500)
    expect(await ui.find({ type: 'Text', text: /^dev$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^pwsh 1$/ })).toBeUndefined()
    await ui.unmount()
  })

  test('colours reach the screen, and a QR code is drawn as cells on the desktop', async ($, on) => {
    const E = String.fromCharCode(27)
    const printed = ['█▀▀█ ▄▄', '█▄▄█ ▀▀', `› Metro: ${E}[4mexp://192.168.0.38:8081${E}[24m`, `${E}[33mAn update is available${E}[39m`, ''].join('\n')
    const seen = world(on, true, {}, 0, printed)
    await $.command.run({ command: 'workbench', args: 'run dev', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
    await seen.finished
    for (let turn = 0; turn < 10; turn += 1) await seen.settle()
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const [client] = (await ui.findAll({ type: 'Client' })).filter(one => (one.key ?? '').startsWith('input-'))
    const key = client?.key ?? ''
    // In the program's own colours and styles.
    const link = await ui.find({ in: key, type: 'Text', text: /exp:\/\/192\.168\.0\.38:8081/ })
    expect(link?.props.underline).toBe(true)
    const update = await ui.find({ in: key, type: 'Text', text: /An.update.is.available/ })
    expect(update?.props.color).toBe('#C19C00')
    // The QR rows as cells, one a character wide, their halves filled as the glyphs are: no block characters as text.
    expect(await ui.find({ in: key, type: 'Text', text: /[▀▄█]/ })).toBeUndefined()
    const cells = (await ui.findAll({ in: key, type: 'Box' })).filter(one => one.props.width === 1 && one.props.height === 1)
    expect(cells.length).toBe(14)
    await ui.unmount()
  })

  test('title names a tab, and a running command then leaves the name alone', async ($, on) => {
    const seen = world(on, true, {}, 60_000)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await seen.settle()
    await ui.press({ key: 'tab-term' })
    await ui.press({ key: 'term-new' })
    await seen.settle()
    const [client] = await ui.findAll({ type: 'Client' })
    const key = client?.key ?? ''
    await typeLine(ui, key, 'title frontend')
    await seen.settle()
    expect(await ui.find({ type: 'Text', text: /^frontend$/ })).toBeDefined()
    // Never sent to PowerShell: the tab's name is the pane's to keep.
    expect(seen.runs.map(one => one.cmd)).toEqual([])
    await typeLine(ui, key, 'npm run dev')
    await seen.advance(2_500)
    expect(await ui.find({ type: 'Text', text: /^frontend$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^dev$/ })).toBeUndefined()
    await ui.unmount()
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
    // Ctrl+C clears the line however the surface hands it: either case, or the control character.
    await ui.key({ key: 'C', ctrl: true, in: key })
    expect(await ui.find({ in: key, type: 'Text', text: 'gi' })).toBeUndefined()
    for (const k of ['l', 's']) await ui.key({ key: k, in: key })
    await ui.key({ key: '\u0003', in: key })
    expect(await ui.find({ in: key, type: 'Text', text: 'ls' })).toBeUndefined()
    await ui.unmount()
  })

  test('typing suggests the latest matching command in grey, and → takes it', async ($, on) => {
    // Commands run before, as the plugin's store keeps them across sessions.
    const seen = world(on, true, { history: ['git status', 'npm run dev'] })
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await seen.settle()
    await ui.press({ key: 'tab-term' })
    await ui.press({ key: 'term-new' })
    const [client] = await ui.findAll({ type: 'Client' })
    const key = client?.key ?? ''
    await ui.key({ key: 'n', in: key })
    // The cursor sits on the suggestion's first letter; the rest follows in grey.
    expect(await ui.find({ in: key, type: 'Text', text: 'p' })).toBeDefined()
    expect(await ui.find({ in: key, type: 'Text', text: 'm run dev' })).toBeDefined()
    await ui.key({ key: 'right', in: key })
    expect(await ui.find({ in: key, type: 'Text', text: 'npm run dev' })).toBeDefined()
    expect(await ui.find({ in: key, type: 'Text', text: /^m run dev$/ })).toBeUndefined()
    // The arrow as a browser names it takes the suggestion too.
    await ui.key({ key: 'c', ctrl: true, in: key })
    await ui.key({ key: 'g', in: key })
    expect(await ui.find({ in: key, type: 'Text', text: /^t status$/ })).toBeDefined()
    await ui.key({ key: 'ArrowRight', in: key })
    expect(await ui.find({ in: key, type: 'Text', text: /^git status$/ })).toBeDefined()
    await ui.unmount()
  })

  test('ctrl+a selects the whole line: backspace clears it, typing replaces it', async ($, on) => {
    const seen = world(on, true)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await seen.settle()
    await ui.press({ key: 'tab-term' })
    await ui.press({ key: 'term-new' })
    const [client] = await ui.findAll({ type: 'Client' })
    const key = client?.key ?? ''
    for (const k of 'git log') await ui.key({ key: k === ' ' ? 'space' : k, in: key })
    await ui.key({ key: 'a', ctrl: true, in: key })
    // Drawn as one highlighted run, the cursor gone.
    const selected = await ui.find({ in: key, type: 'Text', text: /^git log$/ })
    expect(selected?.props.inverse).toBe(true)
    await ui.key({ key: 'backspace', in: key })
    expect(await ui.find({ in: key, type: 'Text', text: /git log/ })).toBeUndefined()
    for (const k of 'ls') await ui.key({ key: k, in: key })
    await ui.key({ key: 'a', ctrl: true, in: key })
    await ui.key({ key: 'x', in: key })
    expect(await ui.find({ in: key, type: 'Text', text: /^x$/ })).toBeDefined()
    expect(await ui.find({ in: key, type: 'Text', text: /^ls$/ })).toBeUndefined()
    await ui.unmount()
  })

  test('the input module draws the whole screen, so a click anywhere in the window types there', async ($, on) => {
    world(on, false)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: 'tab-term' })
      await ui.press({ key: 'term-new' })
      const [client] = await ui.findAll({ type: 'Client' }).then(all => all.filter(one => (one.key ?? '').startsWith('input-')))
      const key = client?.key ?? ''
      expect(client?.props.width).toBe('100%')
      expect(client?.props.flexGrow).toBe(1)
      // What the session printed is drawn inside the module's region, above the prompt.
      expect(key.startsWith('input-')).toBe(true)
      expect(await screenText(ui)).toMatch(/PowerShell was not found[\s\S]*PS C:\\work\\app>[\s\S]*session ended/)
      expect(await ui.findAll({ type: 'Svg' }).then(all => all.filter(one => one.props.alt === 'Terminal output'))).toEqual([])
      // The empty black under the prompt is the module's own rows, so a click there types too.
      const texts = (await ui.findAll({ in: key, type: 'Text' })).map(one => one.text ?? '')
      const prompt = texts.findIndex(text => text.startsWith('PS '))
      expect(texts.slice(prompt + 1).filter(text => text.trim() === '').length).toBeGreaterThanOrEqual(2)
      await ui.unmount()
    }
  })
})

describe('scripts menu', () => {
  test('the project scripts show with no terminal open, and drop down from the tab strip', async ($, on) => {
    const seen = world(on, false)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...PANE, surface })
      for (let turn = 0; turn < 5; turn += 1) await seen.settle()
      await ui.press({ key: 'tab-term' })
      expect(await hasKey(ui, 'empty-script-')).toBe(true)
      await ui.press({ key: 'term-scripts' })
      const listed = (await ui.findAll({ type: 'Button' })).map(one => one.key ?? '').filter(key => key.startsWith('menu-script-'))
      expect(listed).toEqual(['menu-script-|npm|dev', 'menu-script-|npm|test'])
      await ui.press({ key: 'term-scripts-close' })
      expect(await hasKey(ui, 'menu-script-')).toBe(false)
      await ui.press({ key: 'tab-git' })
      await ui.unmount()
    }
  })
})
