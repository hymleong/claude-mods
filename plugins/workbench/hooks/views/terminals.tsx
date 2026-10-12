import type { RenderElement } from 'claude-code'

import type { Script, Term } from '../../types'
import { native, short } from '../paths'
import { TERM, promptText, screenRows, screenSvg } from '../screen'
import { C, fit, plural } from './chrome'
import type { Actions, Kit, Model } from './model'
import { action, card, emptyState, icon, section } from './ui'

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
      {scriptsCard(kit, m, act)}
      {terminalWindow(kit, m, term, act)}
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

/** Rows of screen shown at most: older ones scroll away, as a terminal's scrollback does. */
const SCROLLBACK = 400

/**
 * The session as a terminal window, after Windows Terminal: a strip of tabs and
 * the session's controls on top, then a black screen of every command after its
 * prompt and what it printed, and the live prompt to type at.
 */
function terminalWindow(kit: Kit, m: Model, term: Term, act: Actions): RenderElement {
  const { Box, Text } = kit
  const cols = Math.max(40, m.width - 4)
  const toNative = (path: string): string => native(path, m.isWindows)
  const rows = screenRows(m.blocks, toNative, cols)

  return (
    <Box flexDirection="column" marginTop={0.5} backgroundColor={TERM.background} borderStyle="round" borderColor={TERM.edge}>
      {tabStrip(kit, m, term, act)}
      <Box flexDirection="column" paddingX={1} paddingTop={0.5} paddingBottom={0.75}>
        {term.state === 'starting' && rows.length === 0 && <Text color={TERM.dim}>Starting PowerShell…</Text>}
        {term.state === 'idle' && rows.length === 0 && (
          <Text color={TERM.dim}>{`PowerShell${term.pid > 0 ? ` · pid ${term.pid}` : ''} · ${plural(m.terms.length, 'session')} open`}</Text>
        )}
        {rows.length > 0 && screen(kit, m, rows, cols)}
        {term.note !== '' && (
          <Text color={term.state === 'ended' ? TERM.red : TERM.yellow} wrap="wrap">
            {term.note}
          </Text>
        )}
        {inputLine(kit, m, term, act)}
      </Box>
    </Box>
  )
}

/** The screen: one monospaced picture where pictures are drawn, coloured rows of text on a grid. */
function screen(kit: Kit, m: Model, rows: ReturnType<typeof screenRows>, cols: number): RenderElement {
  const { Box, Text } = kit
  if (kit.Svg !== undefined && !m.isGrid) {
    const drawn = screenSvg(rows, cols, SCROLLBACK)

    return (
      <Box flexDirection="column">
        {drawn.hidden > 0 && <Text color={TERM.dim}>{`… ${plural(drawn.hidden, 'earlier line')} scrolled away`}</Text>}
        <kit.Svg source={drawn.svg} alt="Terminal output" />
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      {rows.slice(-SCROLLBACK).map(row => (
        <Box flexDirection="row">
          {row.length === 0 ? <Text> </Text> : row.map(span => <Text color={span.color} italic={span.isItalic === true}>{span.text}</Text>)}
        </Box>
      ))}
    </Box>
  )
}

const TAB_DOT: Record<Term['state'], string> = { busy: TERM.green, starting: TERM.yellow, ended: TERM.red, idle: TERM.dim }

/** The sessions as tabs, the open one joined to the screen below it, then New and the session's controls. */
function tabStrip(kit: Kit, m: Model, active: Term, act: Actions): RenderElement {
  const { Box, Button, Text } = kit
  const last = m.blocks[m.blocks.length - 1]

  return (
    <Box flexDirection="row" alignItems="center" flexWrap="wrap" backgroundColor={TERM.chrome} paddingX={0.5} paddingTop={0.4} columnGap={0.5}>
      {m.terms.map(term => {
        const isActive = term.id === active.id
        const ports = m.ports.rows.filter(one => one.termId === term.id).map(one => `:${one.port}`)

        return (
          <Box
            flexDirection="row"
            alignItems="center"
            columnGap={0.75}
            paddingX={1}
            paddingY={0.2}
            flexShrink={0}
            backgroundColor={isActive ? TERM.background : TERM.chrome}
            {...(isActive ? { borderStyle: 'round' as const, borderColor: TERM.background } : {})}
          >
            <Text color={TAB_DOT[term.state]}>{term.state === 'busy' ? '●' : '❯'}</Text>
            <Button key={`term-${term.id}`} plain onPress={() => act.pickTerm(term.id)}>
              <Text color={isActive ? TERM.white : TERM.dim} bold={isActive}>
                {fit(term.title, 18)}
              </Text>
            </Button>
            {ports.length > 0 && <Text color={TERM.cyan}>{ports.slice(0, 2).join(' ')}</Text>}
            <Button key={`close-${term.id}`} plain onPress={() => act.closeTerm(term.id)}>
              <Text color={TERM.dim}>×</Text>
            </Button>
          </Box>
        )
      })}
      <Box paddingX={0.75}>
        <Button key="term-new" plain onPress={() => act.newTerm()}>
          <Text color={TERM.foreground}>+</Text>
        </Button>
      </Box>
      <Box flexGrow={1} />
      <Box flexDirection="row" alignItems="center" columnGap={1.5} paddingX={0.75}>
        {active.state === 'busy' && control(kit, `stop-${active.id}`, '■ Stop', TERM.red, () => act.stopTerm(active.id))}
        {last !== undefined && last.lines.length > 0 && control(kit, `copy-${last.id}`, 'Copy', TERM.foreground, press => act.copyBlock(last.id, press))}
        {active.state !== 'ended' && control(kit, `clear-${active.id}`, 'Clear', TERM.foreground, () => act.clearTerm(active.id))}
        {control(kit, `restart-${active.id}`, 'Restart', active.state === 'ended' ? TERM.blue : TERM.foreground, () => act.restartTerm(active.id))}
      </Box>
    </Box>
  )
}

/** A quiet word in the tab strip that does something to the session. */
function control(kit: Kit, key: string, label: string, color: string, onPress: (surface: string) => void): RenderElement {
  const { Button, Text } = kit

  return (
    <Button key={key} plain onPress={press => onPress(press.surface)}>
      <Text color={color} dimColor={color === TERM.foreground}>
        {label}
      </Text>
    </Button>
  )
}

function inputLine(kit: Kit, m: Model, term: Term, act: Actions): RenderElement {
  const { Box, Text, Input } = kit
  const prompt = promptText(native(short(term.cwd, m.home, Math.max(12, m.width - 30)), m.isWindows))
  if (kit.termInput !== undefined) {
    return (
      <Box flexDirection="column">
        {kit.termInput({
          termId: term.id,
          prompt,
          isBusy: term.state === 'busy',
          isEnded: term.state === 'ended',
          history: [...m.termHistory].slice(-100),
          completion: null,
          fill: m.inputFill,
          paste: null,
          isProportional: !m.isGrid,
          accent: TERM.foreground,
          ink: TERM.yellow,
          bad: TERM.red,
          hint: TERM.dim,
        })}
      </Box>
    )
  }
  if (Input !== undefined) {
    return (
      <Box flexDirection="column" marginTop={0.5}>
        <Input
          key={`line-${term.id}`}
          label={prompt}
          placeholder={term.state === 'busy' ? 'Running: stop it to type the next command' : 'A PowerShell command'}
          submitLabel="run"
          onSubmit={text => act.runLine(term.id, text)}
        />
      </Box>
    )
  }

  return <Text color={C.dim}>This surface has no text field: type commands from the desktop app or a terminal.</Text>
}
