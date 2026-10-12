import type { Pull, Run } from '../types'

// The GitHub REST API's answers, read: the hooks module makes the calls.

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

const whole = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

const parse = (body: string): unknown => {
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

/** `GET /repos/{repo}/pulls?head=...`: the first open pull request, or null. */
export function toPull(body: string): Pull | null {
  const list = parse(body)
  const one = Array.isArray(list) ? list[0] : undefined
  if (one === undefined) return null

  return {
    number: whole(field(one, 'number')),
    title: text(field(one, 'title')),
    url: text(field(one, 'html_url')),
    isDraft: field(one, 'draft') === true,
  }
}

/** `GET /repos/{repo}/actions/runs`: the runs, newest first. */
export function toRuns(body: string): Run[] {
  const runs = field(parse(body), 'workflow_runs')
  if (!Array.isArray(runs)) return []

  return runs.map(one => ({
    id: whole(field(one, 'id')),
    name: text(field(one, 'name')),
    status: text(field(one, 'status')),
    conclusion: text(field(one, 'conclusion')),
    url: text(field(one, 'html_url')),
    event: text(field(one, 'event')),
    title: text(field(one, 'display_title')),
  }))
}

/** A sentence for a failed call, naming the likely fix. */
export function failure(status: number, body: string, hasToken: boolean): string {
  const message = text(field(parse(body), 'message'))
  if (status === 404) {
    return hasToken
      ? 'GitHub cannot find this repository with your token (check its access).'
      : 'GitHub cannot find this repository. A private repository needs a token: set githubToken in the plugin options.'
  }
  if (status === 401) return 'GitHub refused the token (401). Set a new githubToken in the plugin options.'
  if (status === 403 && /rate limit/i.test(message)) {
    return hasToken
      ? 'GitHub rate limit reached. Try again later.'
      : 'GitHub rate limit reached (60 requests an hour without a token). Set githubToken in the plugin options.'
  }

  return `GitHub answered ${status}${message ? `: ${message}` : ''}.`
}

/** A glyph and a colour for a run's state. */
export function runLook(run: Run): { glyph: string; color: string } {
  if (run.status !== 'completed') return { glyph: run.status === 'in_progress' ? '●' : '○', color: 'yellow' }
  if (run.conclusion === 'success') return { glyph: '✓', color: 'green' }
  if (run.conclusion === 'failure' || run.conclusion === 'timed_out') return { glyph: '✗', color: 'red' }

  return { glyph: '–', color: 'gray' }
}
