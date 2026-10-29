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

/**
 * The machine beneath the plugin, faked: an empty folder with no git and no
 * shell, a main loop on Opus 5.5, turns the engine starts and ends as asked,
 * and tools that take a while on the mocked clock.
 */
function world(on: On): { settle: () => Promise<void>; advance: (ms: number) => Promise<void>; sleep: (ms: number) => Promise<void> } {
  const clock = mock.clock(on, { now: 1_700_000_000_000 })
  mock.store(on, {})
  on('session.cwd', () => ({ value: 'C:/work/app' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('fs.list', () => ({ value: [] }))
  on('fs.exists', () => ({ value: false }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('tool.call', async ($, e) => {
    await clock.sleep(e.tool === 'Read' ? 1_500 : e.tool === 'Bash' ? 240_000 : 500)

    return { result: 'ok' }
  })

  return { settle: () => clock.settle(), advance: ms => clock.advance(ms), sleep: ms => clock.sleep(ms) }
}

describe('turn card', () => {
  test('the card beside the mascot follows a turn: its time by kind, the model, and what it looked at', async ($, on) => {
    const seen = world(on)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ type: 'Text', text: /^Ready/ })).toBeDefined()
      await ui.unmount()
    }
    await $.turn.start({ text: 'find the pet', turnId: 't1' })
    await seen.settle()
    await seen.advance(2_000)
    const read = $.tool.call({ tool: 'Read', file_path: 'C:/work/app/package.json' })
    await seen.settle()
    await seen.advance(1_500)
    await read
    const grep = $.tool.call({ tool: 'Grep', pattern: 'mood' })
    await seen.settle()
    await seen.advance(500)
    await grep
    await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'Found it.', durationMs: 4_000, isAborted: false })

    const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const has = async (text: RegExp): Promise<boolean> => (await desktop.find({ type: 'Text', text })) !== undefined
    expect(await has(/^Worked for$/)).toBe(true)
    expect(await has(/^4\.0s$/)).toBe(true)
    expect(await has(/^2 steps$/)).toBe(true)
    expect(await has(/^Opus 5\.5$/)).toBe(true)
    expect(await has(/^Done$/)).toBe(true)
    expect(await has(/^1\.5s$/)).toBe(true)
    expect(await has(/^2 sources$/)).toBe(true)
    // A segment of the bar for each kind the time went on: searching, reading, thinking.
    expect((await desktop.findAll({ type: 'Box' })).filter(one => one.props.height === 0.3).length).toBe(3)
    // The desktop drops a picture whose words for it are empty: every one has some.
    expect((await desktop.findAll({ type: 'Svg' })).filter(one => String(one.props.alt ?? '').trim() === '')).toEqual([])
    expect(await has(/package\.json$/)).toBe(false)
    await desktop.press({ key: 'activity-details' })
    expect(await has(/package\.json$/)).toBe(true)
    expect(await has(/^mood$/)).toBe(true)
    await desktop.press({ key: 'activity-details' })
    await desktop.unmount()

    const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await terminal.find({ type: 'Text', text: /^Worked for 4\.0s$/ })).toBeDefined()
    expect(await terminal.find({ type: 'Text', text: /2 steps . 2 sources/ })).toBeDefined()
    expect(await terminal.find({ type: 'Text', text: /^Done 4\.0s$/ })).toBeDefined()
    await terminal.unmount()
  })

  test('a turn already under way when the module loaded is taken up at its next step', async ($, on) => {
    world(on)
    on('turn.step', async function* ($, e) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
    })
    const stream = $.turn.step({ turnId: 't9', index: 3, model: 'claude-opus-5-5', effort: 'high', messageCount: 12 })
    for await (const chunk of stream) void chunk
    await stream.result
    await $.turn.complete({ turnId: 't9', reason: 'answer', answer: '', durationMs: 1, isAborted: false })
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    expect(await ui.find({ type: 'Text', text: /^Worked for$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Opus 5\.5$/ })).toBeDefined()
    expect((await ui.findAll({ type: 'Svg' })).some(one => one.props.alt === 'High')).toBe(true)
    await ui.unmount()
  })

  test('a long turn with more sources than the card keeps still draws, running and done', async ($, on) => {
    const seen = world(on)
    await $.turn.start({ text: 'a long one', turnId: 't2' })
    await seen.settle()
    await seen.advance(400_000)
    for (let n = 0; n < 75; n += 1) {
      const read = $.tool.call({ tool: 'Read', file_path: `C:/work/app/src/file-${n}.ts` })
      await seen.settle()
      await seen.advance(1_500)
      await read
    }
    const bash = $.tool.call({ tool: 'Bash', command: 'npm test' })
    await seen.settle()
    await seen.advance(240_000)
    await bash
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ type: 'Text', text: /Working for/ })).toBeDefined()
      await ui.unmount()
    }
    await $.turn.complete({ turnId: 't2', reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ type: 'Text', text: /Worked for/ })).toBeDefined()
      await ui.unmount()
    }
    const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
    expect(await desktop.find({ type: 'Text', text: /^60 sources$/ })).toBeDefined()
    await desktop.press({ key: 'activity-details' })
    expect(await desktop.find({ type: 'Text', text: /file-74\.ts$/ })).toBeDefined()
    expect(await desktop.find({ type: 'Text', text: /^\+48 more$/ })).toBeDefined()
    await desktop.unmount()
  })
})

describe('turn card status', () => {
  /** The finished turn's time by kind, as the desktop legend draws it. */
  async function legend(ui: { findAll: (query: { type: string }) => Promise<{ text?: string }[]>; unmount: () => Promise<void> }): Promise<Record<string, string>> {
    const texts = (await ui.findAll({ type: 'Text' })).map(one => one.text ?? '')
    await ui.unmount()
    const seen: Record<string, string> = {}
    for (const label of ['Search', 'Read', 'Run', 'Write', 'Waiting', 'Thinking']) {
      const at = texts.indexOf(label)
      if (at >= 0) seen[label] = texts[at + 1] ?? ''
    }

    return seen
  }

  test('a permission dialog is time spent waiting on the person until the loop moves on; one a hook answers is not', async ($, on) => {
    const seen = world(on)
    on('turn.step', async function* ($, e) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
    })
    // A hook answers the auto-mode-like ask for Write; nothing answers Bash, whose dialog is shown.
    on('classic.PermissionRequest', ($, e) => (e.tool_name === 'Write' ? { decision: { behavior: 'allow' as const } } : {}))
    await $.turn.start({ text: 'clean up', turnId: 't1' })
    await $.classic.PermissionRequest({ tool_name: 'Write', tool_input: { file_path: 'a.ts', content: '' } })
    await seen.settle()
    await seen.advance(2_000)
    await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -r build' } })
    await seen.settle()
    await seen.advance(3_000)
    // The person refused, and the model is asked again: it thinks.
    const step = $.turn.step({ turnId: 't1', index: 1, model: 'claude-opus-5-5', messageCount: 3 })
    for await (const chunk of step) void chunk
    await seen.settle()
    await seen.advance(1_000)
    await $.turn.complete({ turnId: 't1', reason: 'answer', answer: '', durationMs: 1, isAborted: false })
    const shown = await legend(await $.ui.mount({ ...PANE, surface: 'desktop' }))
    expect(shown.Waiting).toBe('3.0s')
    expect(shown.Thinking).toBe('3.0s')
  })

  test('what the model streams splits its time into thinking and writing', async ($, on) => {
    const seen = world(on)
    on('turn.step', async function* ($, e) {
      await seen.sleep(1_000)
      yield { kind: 'thinking' as const, index: 0, text: 'Let me see.' }
      await seen.sleep(2_000)
      yield { kind: 'text' as const, index: 1, text: 'Here it is.' }
      await seen.sleep(4_000)

      return { turnId: e.turnId, index: e.index, answer: 'Here it is.', toolUses: [], stopReason: 'end_turn' as const, usage: null }
    })
    await $.turn.start({ text: 'hello', turnId: 't1' })
    const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 })
    const read = (async () => {
      for await (const chunk of step) void chunk
    })()
    for (const ms of [1_000, 2_000, 4_000]) {
      await seen.settle()
      await seen.advance(ms)
    }
    await read
    await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'Here it is.', durationMs: 7_000, isAborted: false })
    const shown = await legend(await $.ui.mount({ ...PANE, surface: 'desktop' }))
    expect(shown.Thinking).toBe('3.0s')
    expect(shown.Write).toBe('4.0s')
  })
})
