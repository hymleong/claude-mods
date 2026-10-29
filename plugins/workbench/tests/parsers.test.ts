import { describe, expect, test } from 'claude-code/testing'

import {
  addSource,
  cells,
  charge,
  checking,
  effortName,
  elapsed,
  ending,
  finish,
  isPrompting,
  ledger,
  modelName,
  prompting,
  refusing,
  setWorker,
  settling,
  sourceOf,
  spendNow,
  spendOfChunk,
  spendOfLedger,
  spendOfTool,
  starting,
  startTurn,
  totals,
} from '../hooks/activity'
import { bufferOf, edit, textOf } from '../hooks/edit-buffer'
import { isBlockArt, suggest } from '../hooks/terminal-input'
import { tabName, typedTitle, unique } from '../hooks/tab-name'
import { graphRowSvg, graphWidth } from '../hooks/icons'
import { checksOf, diffArgs, fitHunks, isBranchName, layoutGraph, letterOf, parseBranches, parseLog, parseNameStatus, parseStatus, parseWorktrees, switchArgs, tail } from '../hooks/git'
import { MAX_ORIGINALS_CHARS, findTouched, hash, touch, trimOriginals, writtenPath } from '../hooks/touched'
import { base, dir, isUnder, join, native, norm, rel, same } from '../hooks/paths'
import {
  classify,
  frameworkOf,
  isExposed,
  isProbed,
  maskArgs,
  parseLsof,
  parseNetstat,
  parseProcessJson,
  parseTasklist,
  probeHost,
  termOf,
  titleOf,
  toRows,
} from '../hooks/ports'
import type { Proc } from '../hooks/ports'
import { detect, fromJustfile, fromMakefile, fromPackageJson, packageManager, runCommand } from '../hooks/scripts'
import { HOST_BOOT, HOST_SCRIPT, encodeCommand, processScript } from '../hooks/shell-host'
import { ANSI_COLORS, FRESH, ansiRuns, clean, feed, partial, readMark } from '../hooks/stream'

describe('paths', () => {
  test('Windows and git spellings are one path', () => {
    expect(norm('C:\\Users\\me\\repo\\')).toBe('C:/Users/me/repo')
    expect(norm('c:/Users//me')).toBe('C:/Users/me')
    expect(norm('C:')).toBe('C:/')
    expect(norm('\\\\server\\share\\x')).toBe('//server/share/x')
    expect(same('C:\\Users\\Me', 'c:/users/me')).toBe(true)
    expect(same('/home/Me', '/home/me')).toBe(false)
  })

  test('inside, relative, parent and base', () => {
    expect(isUnder('C:\\a\\b\\c.txt', 'c:/a/b')).toBe(true)
    expect(isUnder('C:/a/bc', 'C:/a/b')).toBe(false)
    expect(isUnder('C:/a/b', 'C:/a/b')).toBe(true)
    expect(rel('C:/a/b/c/d.ts', 'C:\\a\\b')).toBe('c/d.ts')
    expect(dir('C:/a/b')).toBe('C:/a')
    expect(dir('C:/a')).toBe('C:/')
    expect(base('C:/a/b.txt')).toBe('b.txt')
    expect(join('C:/a', 'b', '', 'c')).toBe('C:/a/b/c')
    expect(native('C:/a/b', true)).toBe('C:\\a\\b')
  })
})

describe('stream', () => {
  test('lines carry over between pieces and marks are read', () => {
    let state = FRESH
    const events: unknown[] = []
    for (const piece of ['\u001e[[wb:ready:5123:42]]\n\u001e[[wb:start:ab1]]\nhel', 'lo\nwor', 'ld\n\u001e[[wb:end:ab1:ok:0:', 'QzpcVXNlcnM=]]\n']) {
      const fed = feed(state, 'stdout', piece)
      state = fed.state
      events.push(...fed.events)
    }
    expect(events).toEqual([
      { kind: 'ready', port: 5123, pid: 42 },
      { kind: 'start', id: 'ab1' },
      { kind: 'line', text: 'hello', tone: 'out' },
      { kind: 'line', text: 'world', tone: 'out' },
      { kind: 'end', id: 'ab1', state: 'ok', exit: 0, cwd: 'C:\\Users' },
    ])
  })

  test('a mark after unfinished output still ends the command', () => {
    const fed = feed(FRESH, 'stdout', 'no newline\u001e[[wb:end:x:stopped:-1:]]\n')
    expect(fed.events).toEqual([
      { kind: 'line', text: 'no newline', tone: 'out' },
      { kind: 'end', id: 'x', state: 'stopped', exit: -1, cwd: '' },
    ])
  })

  test('colour codes, carriage-return progress and CLIXML are cleaned away', () => {
    expect(clean('\u001b[32mgreen\u001b[0m done\r')).toBe('green done')
    expect(clean('10%\r50%\r100%')).toBe('100%')
    expect(clean('\u001b]0;title\u0007text')).toBe('text')
    expect(feed(FRESH, 'stderr', '#< CLIXML\n').events).toEqual([])
    expect(feed(FRESH, 'stderr', 'boom\n').events).toEqual([{ kind: 'line', text: 'boom', tone: 'err' }])
  })

  test('an unfinished line shows as live progress', () => {
    const fed = feed(FRESH, 'stdout', 'Downloading 40%')
    expect(fed.events).toEqual([])
    expect(partial(fed.state)).toEqual([{ text: 'Downloading 40%', tone: 'out' }])
  })

  test('unknown marks are ignored, failures default to fail', () => {
    expect(readMark('later:1')).toBeUndefined()
    expect(readMark('end:a1:weird:3:')).toEqual({ kind: 'end', id: 'a1', state: 'fail', exit: 3, cwd: '' })
    expect(readMark('ready:0:1')).toBeUndefined()
  })
})

describe('shell host', () => {
  test('-EncodedCommand is UTF-16LE base64', () => {
    const encoded = encodeCommand('dir ✓')
    const bytes = atob(encoded)
    const codes: number[] = []
    for (let at = 0; at < bytes.length; at += 2) codes.push(bytes.charCodeAt(at) | (bytes.charCodeAt(at + 1) << 8))
    expect(String.fromCharCode(...codes)).toBe('dir ✓')
  })

  test('the host script fits the environment, its bootstrap a command line, and has no JS backticks', () => {
    // The script rides in an environment variable (32,767 characters at most), the bootstrap on the command line.
    expect(HOST_SCRIPT.length).toBeLessThan(30_000)
    expect(HOST_BOOT.length).toBeLessThan(1_000)
    expect(HOST_SCRIPT.includes('`')).toBe(false)
  })

  test('the process script takes only real process ids', () => {
    expect(processScript([20832, -1, 0, 4.5, 31864])).toContain('$ids = @(20832,31864)')
  })
})

const NETSTAT = `
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1668
  TCP    0.0.0.0:445            0.0.0.0:0              LISTENING       4
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       20832
  TCP    0.0.0.0:5432           0.0.0.0:0              ABHÖREN         6988
  TCP    127.0.0.1:8000         0.0.0.0:0              LISTENING       31864
  TCP    127.0.0.1:52144        127.0.0.1:8000         ESTABLISHED     900
  TCP    [::]:3000              [::]:0                 LISTENING       20832
  TCP    [::1]:5173             [::]:0                 LISTENING       777
  UDP    0.0.0.0:5353           *:*                                    2000
`

describe('ports', () => {
  test('netstat: listening TCP rows in any language, nothing else', () => {
    expect(parseNetstat(NETSTAT)).toEqual([
      { address: '0.0.0.0', port: 135, pid: 1668 },
      { address: '0.0.0.0', port: 445, pid: 4 },
      { address: '0.0.0.0', port: 3000, pid: 20832 },
      { address: '0.0.0.0', port: 5432, pid: 6988 },
      { address: '127.0.0.1', port: 8000, pid: 31864 },
      { address: '::', port: 3000, pid: 20832 },
      { address: '::1', port: 5173, pid: 777 },
    ])
  })

  test('lsof and the process tables', () => {
    expect(parseLsof('p501\ncnode\nn*:3000\nn[::1]:3000\np77\ncpostgres\nn127.0.0.1:5432\n')).toEqual([
      { address: '0.0.0.0', port: 3000, pid: 501, name: 'node' },
      { address: '::1', port: 3000, pid: 501, name: 'node' },
      { address: '127.0.0.1', port: 5432, pid: 77, name: 'postgres' },
    ])
    const procs = parseProcessJson('[[20832,900,"node.exe","node vite --port 3000",1700000000000,104857600],[900,1,"pwsh.exe","",0,0]]')
    expect(procs.get(20832)).toEqual({ pid: 20832, ppid: 900, name: 'node.exe', cmd: 'node vite --port 3000', startedAt: 1700000000000, memBytes: 104857600 })
    expect(parseProcessJson('[4,0,"System","",0,0]').get(4)?.name).toBe('System')
    expect(parseTasklist('"node.exe","20832","Console","1","102,400 K"').get(20832)?.memBytes).toBe(102400 * 1024)
  })

  test('what a developer started, and what the system did', () => {
    expect(classify('node.exe', '')).toBe('dev')
    expect(classify('python3.12', '')).toBe('dev')
    expect(classify('svchost.exe', '')).toBe('system')
    expect(classify('ArmouryCrate.Service.exe', '')).toBe('other')
    expect(classify('myserver.exe', 'C:/proj/node_modules/.bin/thing')).toBe('dev')
  })

  test('frameworks from command lines, headers and pages', () => {
    expect(frameworkOf('node.exe', 'node C:/p/node_modules/vite/bin/vite.js')).toBe('Vite')
    expect(frameworkOf('node', 'node node_modules/next/dist/bin/next dev')).toBe('Next.js')
    expect(frameworkOf('python', 'python manage.py runserver')).toBe('Django')
    expect(frameworkOf('postgres.exe', '')).toBe('PostgreSQL')
    expect(frameworkOf('python', 'python app.py', { server: 'Werkzeug/3.0 Python/3.12', poweredBy: '', body: '' })).toBe('Flask')
    expect(frameworkOf('node', 'node server.js', { server: '', poweredBy: '', body: '<script src="/@vite/client">' })).toBe('Vite')
  })

  test('titles and masked secrets', () => {
    expect(titleOf('<html><head><title> My &amp; App </title>')).toBe('My & App')
    expect(titleOf('<p>no title</p>')).toBe('')
    expect(maskArgs('node app.js --token=abc123 --port 3000')).toBe('node app.js --token=*** --port 3000')
    expect(maskArgs('psql postgres://admin:hunter2@localhost/db')).toBe('psql postgres://admin:***@localhost/db')
    expect(maskArgs('run --api-key "x y z" --keep')).toBe('run --api-key *** --keep')
  })

  test('rows: one per process and port, linked to the terminal that started it', () => {
    const procs = new Map<number, Proc>([
      [20832, { pid: 20832, ppid: 900, name: 'node.exe', cmd: 'node vite', startedAt: 1, memBytes: 0 }],
      [900, { pid: 900, ppid: 555, name: 'cmd.exe', cmd: '', startedAt: 0, memBytes: 0 }],
      [555, { pid: 555, ppid: 1, name: 'pwsh.exe', cmd: '', startedAt: 0, memBytes: 0 }],
      [1668, { pid: 1668, ppid: 1, name: 'svchost.exe', cmd: '', startedAt: 0, memBytes: 0 }],
    ])
    const hosts = new Map([[555, 'term1']])
    expect(termOf(20832, procs, hosts)).toBe('term1')
    const rows = toRows(parseNetstat(NETSTAT), procs, hosts, [])
    const vite = rows.find(row => row.port === 3000)
    expect(rows[0]?.port).toBe(3000)
    expect(vite?.addresses).toEqual(['0.0.0.0', '::'])
    expect(vite?.termId).toBe('term1')
    expect(vite?.framework).toBe('Vite')
    expect(vite?.isExposed).toBe(true)
    expect(rows.filter(row => row.port === 3000)).toHaveLength(1)
    expect(rows.find(row => row.port === 135)?.kind).toBe('system')
  })

  test('probing: the right host, and never a database', () => {
    expect(probeHost(['::1'])).toBe('[::1]')
    expect(probeHost(['0.0.0.0', '::'])).toBe('127.0.0.1')
    expect(isExposed(['127.0.0.1', '::1'])).toBe(false)
    expect(isProbed({ port: 5432, kind: 'dev', name: 'postgres' })).toBe(false)
    expect(isProbed({ port: 3000, kind: 'dev', name: 'node' })).toBe(true)
    expect(isProbed({ port: 3000, kind: 'other', name: 'code' })).toBe(false)
  })
})

describe('scripts', () => {
  test('package manager from the field, else the lockfile', () => {
    expect(packageManager(['pnpm-lock.yaml'])).toBe('pnpm')
    expect(packageManager(['yarn.lock'], '{"packageManager":"bun@1.1.0"}')).toBe('bun')
    expect(packageManager([])).toBe('npm')
    expect(runCommand('yarn', 'dev')).toBe('yarn dev')
    expect(runCommand('npm', 'dev:web')).toBe('npm run dev:web')
    expect(runCommand('npm', "it's")).toBe("npm run 'it''s'")
  })

  test('package.json scripts, the everyday ones first, pre/post hooks hidden', () => {
    const json = JSON.stringify({ scripts: { lint: 'x', pretest: 'x', test: 'x', 'build:css': 'x', dev: 'x', prepare: 'x' } })
    expect(fromPackageJson(json)).toEqual(['dev', 'build:css', 'test', 'lint', 'prepare'])
    expect(fromPackageJson('not json')).toEqual([])
  })

  test('make and just', () => {
    expect(fromMakefile('.PHONY: all\nall: build\nbuild:\n\tgo build\n%.o: %.c\nVAR := 1\ntest: build\n')).toEqual(['all', 'build', 'test'])
    expect(fromJustfile('set shell := ["pwsh"]\ndev port="3000":\n  npm run dev\n_private:\n  x\ntest:\n')).toEqual(['dev', 'test'])
  })

  test('detect: every kind a folder declares', () => {
    const found = detect({
      path: 'C:/p/web',
      rel: 'web',
      names: ['package.json', 'pnpm-lock.yaml', 'Cargo.toml', 'compose.yaml'],
      files: { 'package.json': '{"scripts":{"dev":"vite"}}' },
    })
    expect(found.map(one => one.cmd)).toEqual(['pnpm run dev', 'cargo run', 'cargo test', 'cargo build', 'docker compose up'])
    expect(found[0]).toEqual({ id: 'web|pnpm|dev', label: 'dev', cmd: 'pnpm run dev', cwd: 'C:/p/web', kind: 'pnpm', folder: 'web' })
  })
})

describe('git', () => {
  test('status: branch, upstream, counts, renames and untracked files', () => {
    const out = ['## main...origin/main [ahead 2, behind 1]', 'M  src/a.ts', ' M README.md', 'R  new.ts', 'old.ts', '?? notes.txt', ''].join('\0')
    const status = parseStatus(out)
    expect(status).toMatchObject({ branch: 'main', upstream: 'origin/main', ahead: 2, behind: 1, isDetached: false })
    expect(status.files).toEqual([
      { path: 'src/a.ts', from: '', index: 'M', tree: ' ' },
      { path: 'README.md', from: '', index: ' ', tree: 'M' },
      { path: 'new.ts', from: 'old.ts', index: 'R', tree: ' ' },
      { path: 'notes.txt', from: '', index: '?', tree: '?' },
    ])
    expect(parseStatus('## No commits yet on main\0').branch).toBe('main')
    expect(parseStatus('## HEAD (no branch)\0').isDetached).toBe(true)
    expect(letterOf(status.files[3]!, false)).toBe('U')
    expect(diffArgs(status.files[3]!, false)).toContain('/dev/null')
    expect(diffArgs(status.files[2]!, true)).toEqual(['diff', '--no-color', '--no-ext-diff', '--cached', '-M', '--', 'old.ts', 'new.ts'])
  })

  test('diffs are cut at hunk boundaries, a long first hunk recounted', () => {
    const hunk = (start: number, n: number) => [`@@ -${start},${n} +${start},${n} @@`, ...Array.from({ length: n }, (_, i) => ` line ${i}`)]
    const out = ['diff --git a/x b/x', '--- a/x', '+++ b/x', ...hunk(1, 5), ...hunk(40, 5)].join('\n')
    const fitted = fitHunks(out, 8)
    expect(fitted.shown).toBe(6)
    expect(fitted.total).toBe(12)
    expect(fitted.text.startsWith('@@ -1,5 +1,5 @@')).toBe(true)
    const long = fitHunks(['@@ -1,10 +1,11 @@', '+added', ...Array.from({ length: 10 }, () => ' same')].join('\n'), 4)
    expect(long.text.split('\n')[0]).toBe('@@ -1,2 +1,3 @@')
    expect(fitHunks('Binary files a/x and b/x differ').isBinary).toBe(true)
  })

  test('log graph, name-status, checks and complaints', () => {
    const rows = parseLog('* \u001fabc1234\u001fdef5678 0a1b2c3\u001fHEAD -> main, origin/main\u001fFix it\u001fAnn\u001f2 hours ago\n|\\\n')
    expect(rows[0]).toEqual({
      graph: '*',
      sha: 'abc1234',
      parents: ['def5678', '0a1b2c3'],
      refs: 'HEAD -> main, origin/main',
      subject: 'Fix it',
      author: 'Ann',
      when: '2 hours ago',
    })
    expect(rows[1]?.sha).toBe('')
    expect(parseNameStatus('M\tsrc/a.ts\nR100\told.ts\tnew.ts\n')).toEqual([
      { status: 'M', path: 'src/a.ts' },
      { status: 'R', path: 'new.ts' },
    ])
    expect(checksOf([{ conclusion: 'SUCCESS' }, { conclusion: 'FAILURE' }])).toBe('fail')
    expect(checksOf([{ status: 'IN_PROGRESS', conclusion: '' }])).toBe('pending')
    expect(checksOf([])).toBe('')
    expect(tail('hint: do this\nerror: failed to push\nfatal: rejected\n')).toBe('error: failed to push fatal: rejected')
  })
})

describe('graph', () => {
  // main: R ← A ← B ← M(B, F) ← T ; feature: A ← F
  const commits = [
    { sha: 't', parents: ['m'] },
    { sha: 'm', parents: ['b', 'f'] },
    { sha: 'f', parents: ['a'] },
    { sha: 'b', parents: ['a'] },
    { sha: 'a', parents: ['r'] },
    { sha: 'r', parents: [] },
  ]

  test('commits keep their lanes; a merge forks a lane that its branch later joins back', () => {
    const { rows, lanes } = layoutGraph(commits)
    expect(lanes).toBe(2)
    expect(rows.map(row => row.lane)).toEqual([0, 0, 1, 0, 0, 0])
    expect(rows[0]).toMatchObject({ isFromAbove: false, isToBelow: true })
    expect(rows[1]?.forks).toEqual([{ lane: 1, colour: 1 }])
    expect(rows[3]?.through).toEqual([{ lane: 1, colour: 1 }])
    expect(rows[4]?.joins).toEqual([{ lane: 1, colour: 1 }])
    expect(rows[5]).toMatchObject({ isFromAbove: true, isToBelow: false })
  })

  test('a strip draws the dot, the lines through it, and the curves in and out', () => {
    const { rows, lanes } = layoutGraph(commits)
    const merge = graphRowSvg(rows[1]!, lanes, 'dark', true)
    expect(merge).toContain('stroke-width="2"')
    expect(merge).toContain('C')
    expect(graphRowSvg(rows[5]!, lanes, 'dark')).not.toContain('V19')
    expect(graphWidth(2)).toBe(28)
  })
})

describe('edit buffer', () => {
  test('typing, pasting, and joining lines', () => {
    let buffer = bufferOf('ab', 0, 1)
    buffer = edit(buffer, { key: 'X' }, true)!
    expect(textOf(buffer)).toBe('aXb')
    buffer = edit(buffer, { key: 'return' }, true)!
    expect(buffer.lines).toEqual(['aX', 'b'])
    buffer = edit({ ...buffer, col: 0 }, { key: 'backspace' }, true)!
    expect(buffer).toEqual({ lines: ['aXb'], row: 0, col: 2 })
    expect(textOf(edit(bufferOf('', 0, 0), { key: 'one two' }, false)!)).toBe('one two')
  })

  test('the input line keeps to one row and leaves ↑, ↓ and Enter to its owner', () => {
    const line = bufferOf('git status', 0, 10)
    expect(edit(line, { key: 'up' }, false)).toBeUndefined()
    expect(edit(line, { key: 'return' }, false)).toBeUndefined()
    expect(edit(line, { key: 'left', ctrl: true }, false)?.col).toBe(4)
    expect(textOf(edit(line, { key: 'backspace', ctrl: true }, false)!)).toBe('git ')
    expect(edit(line, { key: 'u', ctrl: true }, false)?.lines).toEqual([''])
  })
})

describe('suggestions', () => {
  test('the latest command that starts as the line does, ignoring case, finishes it', () => {
    const history = ['npm install', 'git status', 'npm run dev', 'Get-ChildItem']
    expect(suggest('n', history)).toBe('pm run dev')
    expect(suggest('npm i', history)).toBe('nstall')
    expect(suggest('GIT', history)).toBe(' status')
    expect(suggest('get-c', history)).toBe('hildItem')
  })

  test('nothing for an empty line, no match, or a line already whole', () => {
    const history = ['npm run dev']
    expect(suggest('', history)).toBe('')
    expect(suggest('   ', history)).toBe('')
    expect(suggest('yarn', history)).toBe('')
    expect(suggest('npm run dev', history)).toBe('')
  })
})

describe('tab names', () => {
  const name = (cmd: string): string => tabName(cmd).name

  test('package scripts are named after the script', () => {
    expect(name('npm run dev')).toBe('dev')
    expect(name('npm run-script build')).toBe('build')
    expect(name('npm start')).toBe('start')
    expect(name('npm test')).toBe('test')
    expect(name('pnpm dev')).toBe('dev')
    expect(name('yarn dev')).toBe('dev')
    expect(name('bun run dev')).toBe('dev')
    expect(name('npm run dev -- --port 3000')).toBe('dev')
    expect(name('npm install')).toBe('npm install')
    expect(name('pnpm add react')).toBe('pnpm add')
  })

  test('npx and its kin are named after the tool, and its subcommand if it has one', () => {
    expect(name('npx vite')).toBe('vite')
    expect(name('npx expo start')).toBe('expo start')
    expect(name('npx next dev')).toBe('next dev')
    expect(name('npx serve dist')).toBe('serve')
    expect(name('npx -y http-server -p 8080')).toBe('http-server')
    expect(name('npx run start')).toBe('run start')
    expect(name('npx create-vite@latest my-app')).toBe('create-vite')
    expect(name('pnpm dlx vite')).toBe('vite')
    expect(name('bunx vite')).toBe('vite')
  })

  test('interpreters are named after the file, a module, or the script\'s subcommand', () => {
    expect(name('python app.py')).toBe('app.py')
    expect(name('python -u src/app.py --port 5000')).toBe('app.py')
    expect(name('python manage.py runserver')).toBe('runserver')
    expect(name('python -m http.server 8000')).toBe('http.server')
    expect(name('python script.py input.txt')).toBe('script.py')
    expect(name('node server.js')).toBe('server.js')
    expect(name(String.raw`node --watch src\server.js`)).toBe('server.js')
    expect(name('php artisan serve')).toBe('serve')
    expect(name('deno task dev')).toBe('dev')
    expect(name('deno run -A main.ts')).toBe('main.ts')
  })

  test('other tools: with a known subcommand, else the program alone', () => {
    expect(name('docker compose up')).toBe('compose up')
    expect(name('docker-compose up -d')).toBe('compose up')
    expect(name('cargo run')).toBe('cargo run')
    expect(name('dotnet watch')).toBe('dotnet watch')
    expect(name('go run .')).toBe('go run')
    expect(name('flask run')).toBe('flask run')
    expect(name('uvicorn main:app --reload')).toBe('uvicorn')
    expect(name('ping -t 127.0.0.1')).toBe('ping')
    expect(name(String.raw`C:\tools\ngrok.exe http 80`)).toBe('ngrok')
    expect(name(String.raw`& "C:\Program Files\nodejs\node.exe" server.js`)).toBe('server.js')
  })

  test('a chain is named by its last command, a pipeline by its first, and a cd is kept', () => {
    expect(tabName('cd client; npm run dev')).toEqual({ name: 'dev', cdTo: 'client' })
    expect(tabName(String.raw`Set-Location .\api && npm start`)).toEqual({ name: 'start', cdTo: String.raw`.\api` })
    expect(name('npm i && npm run dev')).toBe('dev')
    expect(name('npm run dev | Tee-Object log.txt')).toBe('dev')
  })

  test('long names are cut, and clashes numbered', () => {
    expect(name('npm run a-really-long-script-name-here').length).toBeLessThanOrEqual(18)
    expect(unique('dev', ['pwsh 1'])).toBe('dev')
    expect(unique('dev', ['dev'])).toBe('dev 2')
    expect(unique('dev', ['dev', 'dev 2'])).toBe('dev 3')
  })

  test('the person names a tab with title or $Host.UI.RawUI.WindowTitle', () => {
    expect(typedTitle('title frontend')).toBe('frontend')
    expect(typedTitle('title "my server"')).toBe('my server')
    expect(typedTitle('title')).toBe('')
    expect(typedTitle('$Host.UI.RawUI.WindowTitle = "frontend"')).toBe('frontend')
    expect(typedTitle("$host.ui.rawui.WindowTitle='api'")).toBe('api')
    expect(typedTitle('Get-Title')).toBeUndefined()
    expect(typedTitle('npm run dev')).toBeUndefined()
  })
})

describe('colours', () => {
  const E = String.fromCharCode(27)

  test('a line without colour codes has no runs', () => {
    expect(ansiRuns('plain text')).toBeUndefined()
    expect(ansiRuns(`${E}[0mplain${E}[0m`)).toBeUndefined()
  })

  test('colour, bold, dim and underline become runs, in Windows Terminal colours', () => {
    expect(ansiRuns(`${E}[90menv: load .env${E}[39m`)).toEqual([{ text: 'env: load .env', color: ANSI_COLORS[8] }])
    expect(ansiRuns(`› Press ${E}[1ms${E}[22m ${E}[2m│${E}[22m switch`)).toEqual([
      { text: '› Press ' },
      { text: 's', isBold: true },
      { text: ' ' },
      { text: '│', isDim: true },
      { text: ' switch' },
    ])
    expect(ansiRuns(`› Metro: ${E}[4mexp://192.168.0.38:8081${E}[24m`)).toEqual([{ text: '› Metro: ' }, { text: 'exp://192.168.0.38:8081', isUnderline: true }])
    expect(ansiRuns(`${E}[31mred${E}[0m ${E}[92mgreen${E}[0m`)).toEqual([{ text: 'red', color: ANSI_COLORS[1] }, { text: ' ' }, { text: 'green', color: ANSI_COLORS[10] }])
  })

  test('256 and true colours, and a progress line keeps its last rewrite', () => {
    expect(ansiRuns(`${E}[38;5;196mhot${E}[0m`)?.[0]?.color).toBe('#ff0000')
    expect(ansiRuns(`${E}[38;2;18;52;86mrgb${E}[0m`)?.[0]?.color).toBe('#123456')
    expect(ansiRuns(`${E}[33m10%\r${E}[32m100%${E}[0m`)).toEqual([{ text: '100%', color: ANSI_COLORS[2] }])
  })

  test('a coloured line reaches the screen with its runs, and plain text beside them', () => {
    const fed = feed(FRESH, 'stdout', `${E}[33mwarn${E}[39m done\n`)
    expect(fed.events).toEqual([{ kind: 'line', text: 'warn done', tone: 'out', runs: [{ text: 'warn', color: ANSI_COLORS[3] }, { text: ' done' }] }])
  })

  test('rows of block characters are pictures, as a QR code is', () => {
    expect(isBlockArt([{ text: '█ ▄▄▄▄▄ █   █▄▀▀▄' }])).toBe(true)
    expect(isBlockArt([{ text: '▄▄▄▄' }, { text: '▀▀' }])).toBe(true)
    expect(isBlockArt([{ text: '› Scan the QR code' }])).toBe(false)
    expect(isBlockArt([{ text: '    ' }])).toBe(false)
  })
})

describe('branches', () => {
  test('local branches with their standing, then remote ones nobody tracks', () => {
    const out = [
      'refs/heads/main\torigin/main\tahead 2, behind 1\t2 hours ago\t*',
      'refs/heads/feature\torigin/feature\t\t3 days ago\t ',
      'refs/remotes/origin/HEAD\t\t\t2 hours ago\t ',
      'refs/remotes/origin/main\t\t\t2 hours ago\t ',
      'refs/remotes/origin/feature\t\t\t3 days ago\t ',
      'refs/remotes/origin/spike\t\t\t1 week ago\t ',
      '',
    ].join('\n')
    expect(parseBranches(out)).toEqual([
      { name: 'main', upstream: 'origin/main', ahead: 2, behind: 1, when: '2 hours ago', isCurrent: true, isRemote: false },
      { name: 'feature', upstream: 'origin/feature', ahead: 0, behind: 0, when: '3 days ago', isCurrent: false, isRemote: false },
      { name: 'origin/spike', upstream: '', ahead: 0, behind: 0, when: '1 week ago', isCurrent: false, isRemote: true },
    ])
    expect(switchArgs({ name: 'origin/spike', isRemote: true })).toEqual(['switch', '--track', 'origin/spike'])
    expect(switchArgs({ name: 'feature', isRemote: false })).toEqual(['switch', 'feature'])
  })

  test('worktrees: each folder and its branch, the bare one left out', () => {
    const out = [
      'worktree C:/work/app', 'HEAD abc', 'branch refs/heads/main', '',
      'worktree C:\\work\\app-fix', 'HEAD def', 'branch refs/heads/fix/login', '',
      'worktree C:/work/app-old', 'HEAD 123', 'detached', '',
      'worktree C:/work/bare.git', 'bare', '',
    ].join('\n')
    expect(parseWorktrees(out, 'C:/work/app')).toEqual([
      { path: 'C:/work/app', branch: 'main', isCurrent: true },
      { path: 'C:/work/app-fix', branch: 'fix/login', isCurrent: false },
      { path: 'C:/work/app-old', branch: '(detached)', isCurrent: false },
    ])
  })

  test('branch names git would refuse', () => {
    for (const ok of ['feature/login', 'fix-1.2', 'hym/try_this']) expect(isBranchName(ok)).toBe(true)
    for (const bad of ['', '@', 'has space', 'a..b', '-x', 'x/', 'x.lock', 'a~1', 'a:b', 'a\\b', 'x//y', 'a@{1}']) expect(isBranchName(bad)).toBe(false)
  })
})

describe('what Claude touched', () => {
  test('the file each writing tool names, and none for the rest', () => {
    expect(writtenPath('Edit', { file_path: 'C:\\work\\app\\a.ts' })).toBe('C:/work/app/a.ts')
    expect(writtenPath('Write', { file_path: 'c:/work/app/b.ts' })).toBe('C:/work/app/b.ts')
    expect(writtenPath('NotebookEdit', { notebook_path: '/x/n.ipynb' })).toBe('/x/n.ipynb')
    expect(writtenPath('Read', { file_path: '/x/a.ts' })).toBe('')
    expect(writtenPath('Edit', {})).toBe('')
  })

  test('the list keeps one entry a file, the latest first, counting edits', () => {
    let list = touch([], 'C:/work/a.ts', 1, false, true)
    list = touch(list, 'C:/work/b.ts', 2, true, true)
    list = touch(list, 'c:/work/A.ts', 3, false, true)
    expect(list.map(one => [one.path, one.edits, one.at])).toEqual([['C:/work/a.ts', 2, 3], ['C:/work/b.ts', 1, 2]])
    expect(list[1]?.isNew).toBe(true)
    expect(findTouched(list, 'C:\\work\\b.ts')?.edits).toBe(1)
  })

  test('fingerprints tell texts apart, and the oldest originals go first over budget', () => {
    expect(hash('abc')).toBe(hash('abc'))
    expect(hash('abc')).not.toBe(hash('abd'))
    const big = 'x'.repeat(MAX_ORIGINALS_CHARS - 10)
    const order = [touch([], '/new.ts', 2, false, true)[0]!, touch([], '/old.ts', 1, false, true)[0]!]
    const kept = trimOriginals({ '/new.ts': { text: big }, '/old.ts': { text: 'y'.repeat(100) } }, order)
    expect(Object.keys(kept)).toEqual(['/new.ts'])
  })
})

describe('turn activity', () => {
  test('each tool is a kind of work, and the latest call is what the time goes on', () => {
    expect(spendOfTool('Grep')).toBe('search')
    expect(spendOfTool('WebFetch')).toBe('search')
    expect(spendOfTool('mcp__Claude_Browser__navigate')).toBe('search')
    expect(spendOfTool('Read')).toBe('read')
    expect(spendOfTool('PowerShell')).toBe('run')
    expect(spendOfTool('Edit')).toBe('write')
    expect(spendOfTool('Agent')).toBe('agents')
    expect(spendOfTool('AskUserQuestion')).toBe('wait')
    expect(spendOfTool('mcp__figma__use_figma')).toBe('other')
    expect(spendNow([], false, undefined)).toBe('think')
    expect(spendNow([{ spend: 'read', isStarted: true }, { spend: 'run', isStarted: true }], false, undefined)).toBe('run')
  })

  test('the person is waited on only while a dialog or a question is put to them, never over work', () => {
    const reading = { spend: 'read' as const, isStarted: true }
    const deciding = { spend: 'run' as const, isStarted: false }
    // The auto-mode check on a call is that call's time, not the person's.
    expect(spendNow([deciding], false, undefined)).toBe('run')
    // A dialog is the person's time...
    expect(spendNow([deciding], true, 'write')).toBe('wait')
    // ...but a read that runs beside it is reading.
    expect(spendNow([reading, deciding], true, undefined)).toBe('read')
    // A question Claude asks is waiting too, unless other work runs.
    expect(spendNow([{ spend: 'wait', isStarted: true }], false, undefined)).toBe('wait')
    expect(spendNow([{ spend: 'wait', isStarted: true }, reading], false, undefined)).toBe('read')
  })

  test('the ledger: the auto-mode check counts as the time of its call, which then runs as the latest at work', () => {
    const held = ledger()
    expect(checking(held, 'c1', 'Bash', '')).toBe(true)
    expect(checking(held, 'c1', 'Bash', '')).toBe(false)
    expect(spendOfLedger(held, undefined)).toBe('run')
    starting(held, 'c1', 'Bash', '')
    expect(spendOfLedger(held, 'write')).toBe('run')
    ending(held, 'c1')
    expect(spendOfLedger(held, 'write')).toBe('write')
  })

  test('the ledger: a dialog waits on the person, a read beside it is reading, and a refusal ends it', () => {
    const held = ledger()
    checking(held, 'r1', 'Read', '')
    checking(held, 'b1', 'Bash', '')
    prompting(held, '', 'Bash')
    expect(isPrompting(held)).toBe(true)
    starting(held, 'r1', 'Read', '')
    expect(spendOfLedger(held, undefined)).toBe('read')
    ending(held, 'r1')
    expect(spendOfLedger(held, undefined)).toBe('wait')
    // The person refused: the loop asks its model again, and the call never ran.
    settling(held, '')
    expect(isPrompting(held)).toBe(false)
    expect(spendOfLedger(held, undefined)).toBe('think')
  })

  test('the ledger: an answered dialog is over once its call runs, while a dialog in another loop stays up', () => {
    const held = ledger()
    checking(held, 'b1', 'Bash', '')
    checking(held, 'b2', 'Bash', 'a1')
    prompting(held, '', 'Bash')
    prompting(held, 'a1', 'Bash')
    starting(held, 'b1', 'Bash', '')
    ending(held, 'b1')
    expect(isPrompting(held)).toBe(true)
    settling(held, 'a1')
    expect(isPrompting(held)).toBe(false)
    // A dialog no held call matches still counts, until its loop moves on or a call of it runs.
    prompting(held, '', 'Write')
    expect(isPrompting(held)).toBe(true)
    starting(held, 'w1', 'Write', '')
    expect(isPrompting(held)).toBe(false)
  })

  test('the ledger: the auto-mode check refusing a call drops it', () => {
    const held = ledger()
    checking(held, 'b1', 'Bash', '')
    expect(refusing(held, 'b1')).toBe(true)
    expect(refusing(held, 'b1')).toBe(false)
    expect(spendOfLedger(held, undefined)).toBe('think')
  })

  test('between calls, the model is thinking or writing as its response streams', () => {
    expect(spendOfChunk('thinking')).toBe('think')
    expect(spendOfChunk('text')).toBe('write')
    expect(spendOfChunk('tool')).toBe('write')
    expect(spendOfChunk('input')).toBe('write')
    expect(spendOfChunk('stop')).toBeUndefined()
    expect(spendOfChunk('engine')).toBeUndefined()
    expect(spendNow([], false, 'write')).toBe('write')
    expect(spendNow([{ spend: 'read', isStarted: true }], false, 'write')).toBe('read')
  })

  test('what the time goes on now is dated from when it began, not from the last charge', () => {
    let a = startTurn('t1', 0)
    a = charge(a, 1_000, 'read')
    a = charge(a, 1_500, 'read')
    expect(a.since).toBe(1_000)
    a = charge(a, 2_000, 'write')
    expect(a.since).toBe(2_000)
  })

  test('the time is split as it passes, and the parts add up to the whole', () => {
    let a = startTurn('t1', 1_000, 'claude-opus-5-5', 'high')
    a = charge(a, 3_000, 'read')
    a = charge(a, 4_500, 'run')
    // The stretch still going counts, without being written down.
    expect(totals(a, 5_000)).toMatchObject({ think: 2_000, read: 1_500, run: 500 })
    expect(a.spent.run).toBe(0)
    a = charge(a, 6_000, 'think')
    a = finish(a, 7_000, true)
    expect(a.spent).toEqual({ search: 0, read: 1_500, run: 1_500, write: 0, agents: 0, other: 0, wait: 0, think: 3_000 })
    expect(Object.values(a.spent).reduce((all, one) => all + one, 0)).toBe(elapsed(a, 99_999))
    expect(elapsed(a, 99_999)).toBe(6_000)
    // Once over, nothing more is charged.
    expect(charge(a, 9_000, 'run')).toBe(a)
    expect(a.workers[0]).toMatchObject({ model: 'claude-opus-5-5', effort: 'high', doing: 'done', endedAt: 7_000 })
  })

  test('subagents join the card; a stopped turn stops them, a finished one leaves them running', () => {
    let a = startTurn('t1', 0)
    a = setWorker(a, 'a1', 100, { type: 'Explore', task: 'find the pet', model: 'claude-haiku-4-5-20251001' })
    expect(a.workers.map(one => one.id)).toEqual(['', 'a1'])
    expect(setWorker(a, 'a1', 200, { type: 'Explore' })).toBe(a)
    a = setWorker(a, 'a1', 300, { doing: 'read' })
    expect(a.workers[1]).toMatchObject({ doing: 'read', since: 300, startedAt: 100 })
    expect(finish(a, 400, true).workers[1]?.endedAt).toBe(0)
    expect(finish(a, 400, false).workers[1]).toMatchObject({ doing: 'stopped', endedAt: 400 })
  })

  test('models and efforts as people say them', () => {
    expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
    expect(modelName('claude-fable-5-1')).toBe('Fable 5.1')
    expect(modelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(modelName('claude-3-5-sonnet-20241022')).toBe('Sonnet 3.5')
    expect(modelName('us.anthropic.claude-sonnet-4-5-20250929-v1:0')).toBe('Sonnet 4.5')
    expect(modelName('claude-opus-4-1[1m]')).toBe('Opus 4.1')
    expect(modelName('opus')).toBe('Opus')
    expect(effortName('high')).toBe('High')
    expect(effortName('xhigh')).toBe('X-High')
    expect(effortName(undefined)).toBe('')
  })

  test('what a call looked at is a source, said once, the latest first', () => {
    expect(sourceOf('Read', { file_path: 'C:\\work\\app\\package.json' })).toEqual({ kind: 'file', label: 'C:/work/app/package.json' })
    expect(sourceOf('Grep', { pattern: 'mood' })).toEqual({ kind: 'search', label: 'mood' })
    expect(sourceOf('WebFetch', { url: 'https://example.com', prompt: 'x' })).toEqual({ kind: 'web', label: 'https://example.com' })
    expect(sourceOf('Edit', { file_path: 'C:/work/app/a.ts', old_string: 'a', new_string: 'b' })).toEqual({ kind: 'edit', label: 'C:/work/app/a.ts' })
    expect(sourceOf('Bash', { command: 'ls' })).toBeUndefined()
    expect(sourceOf('Read', { file_path: '' })).toBeUndefined()
    const list = addSource(addSource(addSource([], { kind: 'file', label: 'a' }), { kind: 'file', label: 'b' }), { kind: 'file', label: 'a' })
    expect(list.map(one => one.label)).toEqual(['a', 'b'])
  })

  test('a bar of cells is shared out by size, every cell given', () => {
    expect(cells([1, 1, 2], 8)).toEqual([2, 2, 4])
    expect(cells([1, 1, 1], 10).reduce((all, one) => all + one, 0)).toBe(10)
    expect(cells([0, 0], 5)).toEqual([0, 0])
    expect(cells([1, 999], 10)).toEqual([0, 10])
  })
})
