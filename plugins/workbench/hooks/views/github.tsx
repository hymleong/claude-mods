import type { RenderElement } from 'claude-code'

import type { Checks, OpenRun, Run, Runs } from '../../types'
import type { Hue, IconName } from '../icons'
import { G, ago, fit, inView } from './chrome'
import type { Actions, Kit, Model } from './model'
import { action, card, emptyState, icon, pill, row, section, tile, toolbar } from './ui'

function noteView(kit: Kit, m: Model, note: string): RenderElement {
  const missing = /not installed|not found|not recognized|ENOENT|executable/i.test(note)

  return missing
    ? emptyState(kit, m, 'pull', 'gray', 'GitHub CLI not available', 'Install it from cli.github.com, then run gh auth login once.')
    : emptyState(kit, m, 'warning', 'orange', 'GitHub did not answer', note)
}

function waiting(kit: Kit, m: Model): RenderElement {
  return (
    <kit.Box marginTop={1} {...(m.isGrid ? {} : { paddingX: 1 })}>
      <kit.Text dimColor>Asking GitHub…</kit.Text>
    </kit.Box>
  )
}

const CHECKS: Record<Exclude<Checks, ''>, { hue: Hue; text: string }> = {
  pass: { hue: 'green', text: 'Passed' },
  fail: { hue: 'red', text: 'Failed' },
  pending: { hue: 'orange', text: 'Running' },
}

export function pullsList(kit: Kit, m: Model, act: Actions): RenderElement {
  const repo = inView(m)
  if (repo === undefined) return emptyState(kit, m, 'pull', 'green', 'Pick a repository', 'Choose one under Changes to see its pull requests.')
  const list = m.pullList
  if (list === null || list.root !== repo.root) return waiting(kit, m)
  if (list.note !== '') return noteView(kit, m, list.note)
  if (list.items.length === 0) return emptyState(kit, m, 'pull', 'green', 'No open pull requests', '')

  return (
    <kit.Box flexDirection="column">
      {section(kit, m, 'Open Pull Requests', list.items.length)}
      {card(
        kit,
        m,
        list.items.map(pull => {
          const check = pull.checks === '' ? undefined : CHECKS[pull.checks]

          return row(kit, m, {
            key: `pull-${pull.number}`,
            lead: tile(kit, m, 'pull', pull.isDraft ? 'gray' : 'green', 24),
            title: `#${pull.number} ${pull.title}`,
            sub: `${pull.author}${pull.branch === '' ? '' : ` · ${pull.branch}`}${pull.isDraft ? ' · Draft' : ''}`,
            trail: [check !== undefined && pill(kit, m, check.text, check.hue)],
            onPress: () => act.openUrl(pull.url),
            chevron: 'right',
          })
        }),
        { gap: 0.25 },
      )}
    </kit.Box>
  )
}

function runLook(run: Pick<Run, 'status' | 'conclusion'>): { icon: IconName; hue: Hue; word: string } {
  if (run.status !== 'completed') return { icon: 'clock', hue: 'orange', word: 'Running' }
  if (run.conclusion === 'success') return { icon: 'checkCircle', hue: 'green', word: 'Passed' }
  if (run.conclusion === 'failure' || run.conclusion === 'timed_out' || run.conclusion === 'startup_failure') return { icon: 'xCircle', hue: 'red', word: 'Failed' }

  return { icon: 'dot', hue: 'gray', word: run.conclusion === '' ? 'Done' : run.conclusion }
}

export function runsList(kit: Kit, m: Model, act: Actions): RenderElement {
  const repo = inView(m)
  if (repo === undefined) return emptyState(kit, m, 'playCircle', 'blue', 'Pick a repository', 'Choose one under Changes to see its workflow runs.')
  const runs = m.runs
  if (runs === null || runs.root !== repo.root) return waiting(kit, m)
  if (runs.note !== '') return noteView(kit, m, runs.note)
  if (runs.items.length === 0) return emptyState(kit, m, 'playCircle', 'blue', `No runs on ${runs.branch}`, 'Push the branch to start its workflows.')

  return (
    <kit.Box flexDirection="column">
      {section(kit, m, `Runs on ${runs.branch}`, runs.items.length)}
      {card(
        kit,
        m,
        runs.items.map(run => {
          const look = runLook(run)

          return row(kit, m, {
            key: `run-${run.id}`,
            lead: icon(kit, m, look.icon, look.hue, 18),
            title: run.title || run.name,
            sub: `${run.name} · ${run.event} · ${ago(m.now, Date.parse(run.createdAt) || 0)}`,
            onPress: () => act.openRun(run.id),
            chevron: 'right',
          })
        }),
        { gap: 0.25 },
      )}
    </kit.Box>
  )
}

export function runView(kit: Kit, m: Model, runs: Runs, run: Run, open: OpenRun, act: Actions): RenderElement {
  const { Box, Text } = kit
  const look = runLook(run)
  const isFailed = run.conclusion === 'failure'

  return (
    <Box flexDirection="column">
      {card(kit, m, [
        row(kit, m, {
          key: 'run-head',
          lead: tile(kit, m, look.icon === 'dot' ? 'playCircle' : look.icon, look.hue, 26),
          title: run.title || run.name,
          isBold: true,
          sub: `${run.name} ${G.dot} ${run.event} ${G.dot} ${runs.branch} ${G.dot} ${ago(m.now, Date.parse(run.createdAt) || 0)}`,
          trail: [pill(kit, m, look.word, look.hue)],
        }),
        toolbar(kit, [
          action(kit, m, 'run-back', 'back', 'Runs', () => act.closeRun(), 'blue'),
          isFailed && action(kit, m, 'run-fix', 'sparkle', 'Ask Claude to Fix', () => act.runToPrompt(run.id), 'purple'),
          run.status === 'completed' && action(kit, m, 'run-rerun', 'restart', isFailed ? 'Rerun Failed Jobs' : 'Rerun', () => act.rerun(run.id), 'blue'),
          run.url !== '' && action(kit, m, 'run-open', 'external', 'Open on GitHub', () => act.openUrl(run.url), 'gray'),
        ]),
      ])}
      {section(kit, m, 'Jobs', open.jobs.length === 0 ? '' : open.jobs.length)}
      {open.jobs.length === 0 && (
        <Box {...(m.isGrid ? {} : { paddingX: 1 })}>
          <Text dimColor>Reading its jobs…</Text>
        </Box>
      )}
      {open.jobs.length > 0 &&
        card(
          kit,
          m,
          open.jobs.map(job => {
            const jobLook = runLook(job)

            return row(kit, m, {
              key: `job-${job.name}`,
              lead: icon(kit, m, jobLook.icon, jobLook.hue, 16),
              title: job.name,
              sub: job.failed.length > 0 ? `Failed at ${fit(job.failed.join(', '), Math.max(12, m.width - 20))}` : jobLook.word,
            })
          }),
          { gap: 0.25 },
        )}
    </Box>
  )
}
