import type { RenderElement } from 'claude-code'

import type { Term } from '../../types'
import { native, short } from '../paths'
import { TERM, promptText, screenRows, screenSvg, screenTail } from '../screen'
import type { Row } from '../screen'
import { C, fit, plural } from './chrome'
import type { Actions, Kit, Model } from './model'

/**
 * The Terminals view is one window, as Windows Terminal is: everything about the
 * sessions (their tabs, the screen and the prompt) sits inside it.
 */
export function termTab(kit: Kit, m: Model, act: Actions): RenderElement {
  const term = m.terms.find(one => one.id === m.activeTerm) ?? m.terms[0]

  return terminalWindow(kit, m, term, act)
}

/** The window with no session in it: what a terminal is here, and the way to open one. */
function emptyScreen(kit: Kit, act: Actions): RenderElement {
  const { Box, Button, Text } = kit

  return (
    <Box flexDirection="column" rowGap={0.5} paddingY={0.5}>
      <Text color={TERM.white} bold>
        No terminals yet
      </Text>
      <Text color={TERM.dim} wrap="wrap">
        Each one is a real PowerShell: variables, functions and the folder you cd into carry over, and several can run at once.
      </Text>
      <Box flexDirection="row">
        <Button key="term-new-empty" plain onPress={() => act.newTerm()}>
          <Text color={TERM.blue}>+ New PowerShell</Text>
        </Button>
      </Box>
      <Text color={TERM.dim} wrap="wrap">
        Programs that wait for typed answers (Read-Host, password prompts, vim, ssh) cannot run in a pane terminal.
      </Text>
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
function terminalWindow(kit: Kit, m: Model, term: Term | undefined, act: Actions): RenderElement {
  const { Box } = kit

  return (
    <Box flexDirection="column" marginTop={0.5} backgroundColor={TERM.background} borderStyle="round" borderColor={TERM.edge}>
      {tabStrip(kit, m, term, act)}
      {term === undefined ? <Box paddingX={1}>{emptyScreen(kit, act)}</Box> : session(kit, m, term, act)}
    </Box>
  )
}

/** Rows a session's input module is handed to draw, and the characters they may take. */
const MODULE_ROWS = 300
const MODULE_BUDGET = 60_000

/**
 * One session's screen and prompt. Where the surface runs the input as a module of
 * its own, that module draws the whole screen (what was printed, then the prompt,
 * then the empty black under it) so a click anywhere on it gives it the keys, as
 * clicking into a terminal window does.
 */
function session(kit: Kit, m: Model, term: Term, act: Actions): RenderElement {
  const { Box, Text } = kit
  const cols = Math.max(40, m.width - 4)
  const toNative = (path: string): string => native(path, m.isWindows)
  const rows = screenRows(m.blocks, toNative, cols)
  if (kit.termInput !== undefined) {
    const tail = screenTail(rows, MODULE_ROWS, MODULE_BUDGET)
    const lines: Row[] = [
      ...(tail.hidden > 0 ? [[{ text: `… ${plural(tail.hidden, 'earlier line')} scrolled away`, color: TERM.dim, isItalic: true }]] : []),
      ...(term.state === 'starting' && rows.length === 0 ? [[{ text: 'Starting PowerShell…', color: TERM.dim }]] : []),
      ...tail.rows,
      ...(term.note !== '' ? [[{ text: term.note, color: term.state === 'ended' ? TERM.red : TERM.yellow }]] : []),
    ]

    // No room under the module: the blank rows below the prompt are its own, so a click there types.
    return (
      <Box flexDirection="column" paddingX={1} paddingTop={0.5}>
        {inputLine(kit, m, term, act, lines)}
      </Box>
    )
  }
  const shown = (
    <Box flexDirection="column">
      {term.state === 'starting' && rows.length === 0 && <Text color={TERM.dim}>Starting PowerShell…</Text>}
      {rows.length > 0 && screen(kit, m, rows, cols)}
      {term.note !== '' && (
        <Text color={term.state === 'ended' ? TERM.red : TERM.yellow} wrap="wrap">
          {term.note}
        </Text>
      )}
    </Box>
  )

  return (
    <Box flexDirection="column" paddingX={1} paddingTop={0.5} paddingBottom={0.75}>
      {shown}
      {inputLine(kit, m, term, act)}
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
function tabStrip(kit: Kit, m: Model, active: Term | undefined, act: Actions): RenderElement {
  const { Box, Button, Text } = kit

  return (
    <Box flexDirection="row" alignItems="center" flexWrap="wrap" backgroundColor={TERM.chrome} paddingX={0.5} paddingTop={0.4} columnGap={0.5}>
      {m.terms.map(term => {
        const isActive = term.id === active?.id
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
      {active !== undefined && sessionControls(kit, m, active, act)}
    </Box>
  )
}

/** The open session's controls, at the strip's right end. */
function sessionControls(kit: Kit, m: Model, active: Term, act: Actions): RenderElement {
  const { Box } = kit
  const last = m.blocks[m.blocks.length - 1]

  return (
    <Box flexDirection="row" alignItems="center" columnGap={1.5} paddingX={0.75}>
      {active.state === 'busy' && control(kit, `stop-${active.id}`, '■ Stop', TERM.red, () => act.stopTerm(active.id))}
      {last !== undefined && last.lines.length > 0 && control(kit, `copy-${last.id}`, 'Copy', TERM.foreground, press => act.copyBlock(last.id, press))}
      {active.state !== 'ended' && control(kit, `clear-${active.id}`, 'Clear', TERM.foreground, () => act.clearTerm(active.id))}
      {control(kit, `restart-${active.id}`, 'Restart', active.state === 'ended' ? TERM.blue : TERM.foreground, () => act.restartTerm(active.id))}
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

function inputLine(kit: Kit, m: Model, term: Term, act: Actions, screen: Row[] = []): RenderElement {
  const { Box, Text, Input } = kit
  const prompt = promptText(native(short(term.cwd, m.home, Math.max(12, m.width - 30)), m.isWindows))
  if (kit.termInput !== undefined) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        {kit.termInput({
          termId: term.id,
          screen,
          minRows: m.isGrid ? Math.max(8, m.rows - 12) : 18,
          prompt,
          isBusy: term.state === 'busy',
          isEnded: term.state === 'ended',
          history: [...m.termHistory].slice(-200),
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
