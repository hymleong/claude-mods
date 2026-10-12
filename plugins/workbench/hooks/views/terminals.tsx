import type { RenderElement } from 'claude-code'

import type { Block, Line, Script, Term } from '../../types'
import type { Hue } from '../icons'
import { native, short } from '../paths'
import { C, G, fit, plural, took } from './chrome'
import type { Actions, Kit, Model } from './model'
import { action, card, emptyState, icon, iconPress, pill, row, section, tile, tone, toolbar } from './ui'

/** Lines of output shown: the block opened whole, the latest command's tail, and older commands' tails. */
const OPEN_LINES = 400
const LAST_LINES = 80
const OLD_LINES = 6
/** Blocks shown below the session's header, the latest last. */
const MAX_BLOCKS = 8

export function termTab(kit: Kit, m: Model, act: Actions): RenderElement {
  const { Box, Text } = kit
  if (m.terms.length === 0) {
    return (
      <Box flexDirection="column">
        {emptyState(
          kit,
          m,
          'terminal',
          'green',
          'No terminals yet',
          'Each one is a real PowerShell: variables, functions and the folder you cd into carry over, and several can run at once.',
          [action(kit, m, 'term-new', 'plus', 'New PowerShell', () => act.newTerm(), 'blue', true)],
        )}
        {scriptsCard(kit, m, act)}
        <Box marginTop={1} {...(m.isGrid ? {} : { paddingX: 1 })}>
          <Text dimColor wrap="wrap">
            Programs that wait for typed answers (Read-Host, password prompts, vim, ssh) cannot run in a pane terminal.
          </Text>
        </Box>
      </Box>
    )
  }
  const term = m.terms.find(one => one.id === m.activeTerm) ?? m.terms[0]!

  return (
    <Box flexDirection="column">
      {sessions(kit, m, term, act)}
      {scriptsCard(kit, m, act)}
      {sessionCard(kit, m, term, act)}
      {blocks(kit, m, term, act)}
      {inputLine(kit, m, term, act)}
    </Box>
  )
}

function stateOf(term: Term): { hue: Hue; word: string } {
  if (term.state === 'busy') return { hue: 'green', word: 'Running' }
  if (term.state === 'starting') return { hue: 'orange', word: 'Starting' }
  if (term.state === 'ended') return { hue: 'red', word: 'Ended' }

  return { hue: 'gray', word: 'Ready' }
}

/** The open sessions as a row of tabs, each with its state and the ports its processes listen on. */
function sessions(kit: Kit, m: Model, active: Term, act: Actions): RenderElement {
  const { Box, Button, Text } = kit

  return (
    <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={2} rowGap={0.5} {...(m.isGrid ? {} : { paddingX: 1 })}>
      {m.terms.map(term => {
        const state = stateOf(term)
        const ports = m.ports.rows.filter(one => one.termId === term.id).map(one => `:${one.port}`)
        const label = fit(term.title, 18)

        return (
          <Box flexDirection="row" alignItems="center" columnGap={0.5} flexShrink={0}>
            {icon(kit, m, 'dot', state.hue, 9)}
            {term.id === active.id ? (
              <Button key={`term-${term.id}`} variant="primary" label={label} onPress={() => act.pickTerm(term.id)} />
            ) : (
              <Button key={`term-${term.id}`} plain dimColor label={label} onPress={() => act.pickTerm(term.id)} />
            )}
            {ports.length > 0 && <Text color={tone(m, 'blue')}>{ports.slice(0, 2).join(' ')}</Text>}
          </Box>
        )
      })}
      {action(kit, m, 'term-new', 'plus', 'New', () => act.newTerm())}
    </Box>
  )
}

/** The project's own tasks, each a press away from running in a terminal of its own. */
function scriptsCard(kit: Kit, m: Model, act: Actions): RenderElement | false {
  const { Box, Button, Text } = kit
  if (m.scripts.length === 0) return false
  const running = (script: Script): Term | undefined => m.terms.find(term => term.script === script.id && term.state !== 'ended')
  const shown = m.scripts.slice(0, m.width < 60 ? 8 : 16)

  return (
    <Box flexDirection="column">
      {section(kit, m, 'Run', m.scripts.length > shown.length ? `${shown.length} of ${m.scripts.length}` : undefined)}
      {card(kit, m, [
        <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={2} rowGap={0.5} paddingY={m.isGrid ? 0 : 0.25}>
          {shown.map(script => {
            const term = running(script)
            const isLive = term?.state === 'busy'
            const where = script.folder === '' ? '' : `${script.folder.split('/').pop()} `

            return (
              <Box flexDirection="row" alignItems="center" columnGap={0.5} flexShrink={0}>
                {icon(kit, m, isLive ? 'dot' : 'play', isLive ? 'green' : 'blue', isLive ? 9 : 11)}
                <Button key={`script-${script.id}`} plain onPress={() => act.runScript(script)}>
                  {where !== '' && <Text dimColor>{where}</Text>}
                  {script.label}
                </Button>
              </Box>
            )
          })}
        </Box>,
      ])}
    </Box>
  )
}

/** Where the session is, what it is doing, and what can be done to it. */
function sessionCard(kit: Kit, m: Model, term: Term, act: Actions): RenderElement {
  const { Text } = kit
  const state = stateOf(term)
  const where = native(short(term.cwd, m.home, Math.max(12, m.width - 30)), m.isWindows)

  return card(
    kit,
    m,
    [
      row(kit, m, {
        key: `session-${term.id}`,
        lead: tile(kit, m, 'terminal', state.hue === 'gray' ? 'indigo' : state.hue, 26),
        title: where,
        isBold: true,
        sub: `${term.title}${term.pid > 0 ? ` · pid ${term.pid}` : ''}`,
        trail: [pill(kit, m, state.word, state.hue, true)],
      }),
      term.note !== '' && <Text color={tone(m, term.state === 'ended' ? 'red' : 'orange')} wrap="wrap">{term.note}</Text>,
      toolbar(kit, [
        term.state === 'busy' && action(kit, m, `stop-${term.id}`, 'stop', 'Stop', () => act.stopTerm(term.id), 'red'),
        term.state !== 'ended' && action(kit, m, `clear-${term.id}`, 'trash', 'Clear', () => act.clearTerm(term.id), 'gray'),
        action(kit, m, `restart-${term.id}`, 'restart', 'Restart', () => act.restartTerm(term.id), term.state === 'ended' ? 'blue' : 'gray'),
        action(kit, m, `close-${term.id}`, 'close', 'Close', () => act.closeTerm(term.id), 'gray'),
      ]),
    ],
    { gap: 0.5 },
  )
}

/** Output lines grouped by stream, so plain output keeps its columns and errors stand out. */
function groups(lines: readonly Line[]): { tone: Line['tone']; lines: string[] }[] {
  const out: { tone: Line['tone']; lines: string[] }[] = []
  for (const line of lines) {
    const last = out[out.length - 1]
    if (last !== undefined && last.tone === line.tone) last.lines.push(line.text)
    else out.push({ tone: line.tone, lines: [line.text] })
  }

  return out
}

/** A block's lines without the blank ones PowerShell pads tables with at either end. */
function trimmed(lines: readonly Line[]): Line[] {
  let start = 0
  let end = lines.length
  while (start < end && lines[start]!.text.trim() === '') start += 1
  while (end > start && lines[end - 1]!.text.trim() === '') end -= 1

  return lines.slice(start, end)
}

function statusPill(kit: Kit, m: Model, block: Block): RenderElement {
  const spent = took((block.endedAt || m.now) - block.startedAt)
  if (block.state === 'running') return pill(kit, m, spent, 'green', true)
  if (block.state === 'stopping') return pill(kit, m, 'Stopping', 'orange', true)
  if (block.state === 'stopped') return pill(kit, m, `Stopped · ${spent}`, 'orange')
  if (block.state === 'fail') return pill(kit, m, block.exit !== null && block.exit !== 0 ? `Exit ${block.exit} · ${spent}` : `Failed · ${spent}`, 'red')

  return pill(kit, m, `${G.ok} ${spent}`, 'green')
}

function blockView(kit: Kit, m: Model, block: Block, isLast: boolean, act: Actions): RenderElement {
  const { Box, Text, Button, Code } = kit
  const isOpen = m.blockOpen === block.id
  const lines = trimmed(block.lines)
  const room = isOpen ? OPEN_LINES : isLast ? LAST_LINES : OLD_LINES
  const shown = lines.slice(-room)
  const hidden = block.dropped + lines.length - shown.length
  const isDone = block.state !== 'running' && block.state !== 'stopping'
  const head = (
    <Box flexDirection="row" alignItems="center" columnGap={1} paddingY={m.isGrid ? 0 : 0.25}>
      {icon(kit, m, 'chevron', block.cmd === '' ? 'gray' : 'blue', 12)}
      <Box flexShrink={1} minWidth={0} flexGrow={1}>
        <Text bold wrap="truncate-end">
          {block.cmd === '' ? 'PowerShell' : block.cmd}
        </Text>
      </Box>
      {isDone && m.width >= 52 && block.cmd !== '' && iconPress(kit, m, `again-${block.id}`, 'pencil', 'Edit', () => act.editAgain(block.cmd))}
      {isDone && m.width >= 52 && lines.length > 0 && (
        <Box flexDirection="row" alignItems="center" columnGap={0.5}>
          {!m.isGrid && kit.Svg !== undefined && icon(kit, m, 'copy', 'gray', 13)}
          <Button key={`copy-${block.id}`} plain dimColor label={m.isGrid ? G.dot : 'Copy'} onPress={press => act.copyBlock(block.id, press.surface)} />
        </Box>
      )}
      {block.cmd !== '' && statusPill(kit, m, block)}
    </Box>
  )

  return (
    <Box flexDirection="column" marginTop={m.isGrid ? 1 : 0.5}>
      {card(kit, m, [
        head,
        hidden > 0 && (
          <Button key={`more-${block.id}`} plain dimColor onPress={() => act.openBlock(isOpen ? '' : block.id)}>
            {isOpen ? `${G.open} ${plural(block.dropped, 'earlier line')} not kept · Show Less` : `${G.closed} ${plural(hidden, 'earlier line')}`}
          </Button>
        ),
        ...groups(shown).map(group =>
          group.tone === 'out' ? (
            <Code source={group.lines.join('\n')} wrap="wrap" />
          ) : (
            <Box flexDirection="column">
              {group.lines.map(line => (
                <Text color={group.tone === 'err' ? tone(m, 'red') : undefined} dimColor={group.tone === 'info'} italic={group.tone === 'info'}>
                  {line === '' ? ' ' : line}
                </Text>
              ))}
            </Box>
          ),
        ),
        block.state === 'running' && lines.length === 0 && <Text dimColor>Running…</Text>,
      ])}
    </Box>
  )
}

function blocks(kit: Kit, m: Model, term: Term, act: Actions): RenderElement {
  const { Box, Text } = kit
  const list = m.blocks.slice(-MAX_BLOCKS)
  const earlier = m.blocks.length - list.length

  return (
    <Box flexDirection="column" marginTop={m.isGrid ? 0 : 0.5}>
      {earlier > 0 && (
        <Box {...(m.isGrid ? {} : { paddingX: 1 })}>
          <Text dimColor>{`${plural(earlier, 'earlier command')} · Clear to drop them`}</Text>
        </Box>
      )}
      {list.length === 0 && term.state !== 'ended' && (
        <Box {...(m.isGrid ? {} : { paddingX: 1, marginTop: 0.5 })}>
          <Text dimColor>{term.state === 'starting' ? 'Starting PowerShell…' : 'Ready. Type a command below.'}</Text>
        </Box>
      )}
      {list.map((block, at) => blockView(kit, m, block, at === list.length - 1, act))}
    </Box>
  )
}

function inputLine(kit: Kit, m: Model, term: Term, act: Actions): RenderElement {
  const { Box, Text, Input } = kit
  const prompt = `PS ${native(term.cwd, m.isWindows)}>`
  if (kit.termInput !== undefined) {
    return (
      <Box flexDirection="column" marginTop={1}>
        {card(kit, m, [
          <Box paddingY={m.isGrid ? 0 : 0.25}>
            {kit.termInput({
              termId: term.id,
              prompt,
              isBusy: term.state === 'busy',
              isEnded: term.state === 'ended',
              history: [...m.termHistory].slice(-100),
              completion: null,
              fill: m.inputFill,
              isProportional: !m.isGrid,
              accent: tone(m, 'blue'),
              bad: tone(m, 'red'),
            })}
          </Box>,
        ])}
      </Box>
    )
  }
  if (Input !== undefined) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Input
          key={`line-${term.id}`}
          label={G.prompt}
          placeholder={term.state === 'busy' ? 'Running: stop it to type the next command' : 'A PowerShell command'}
          submitLabel="run"
          onSubmit={text => act.runLine(term.id, text)}
        />
      </Box>
    )
  }

  return <Text color={C.dim}>This surface has no text field: type commands from the desktop app or a terminal.</Text>
}
