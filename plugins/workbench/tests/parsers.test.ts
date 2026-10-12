import { describe, expect, test } from 'claude-code/testing'

import { bufferOf, edit, textOf } from '../hooks/edit-buffer'
import { graphRowSvg, graphWidth } from '../hooks/icons'
import { checksOf, diffArgs, fitHunks, layoutGraph, letterOf, parseLog, parseNameStatus, parseStatus, tail } from '../hooks/git'
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
import { HOST_SCRIPT, encodeCommand, processScript } from '../hooks/shell-host'
import { FRESH, clean, feed, partial, readMark } from '../hooks/stream'

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

  test('the host script fits a Windows command line and has no JS backticks in it', () => {
    expect(encodeCommand(HOST_SCRIPT).length).toBeLessThan(32_000)
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
