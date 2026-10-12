import type { Mood } from '../types'

// What the mascot shows for a tool Claude calls. Tools a plugin or MCP server
// adds go by their name's shape; anything else is plain work.

const READING = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead', 'ListMcpResourcesTool', 'ReadMcpResourceTool', 'ReadMcpResourceDirTool'])
const RUNNING = new Set(['Bash', 'PowerShell', 'BashOutput', 'KillShell', 'Monitor', 'TaskStop'])
const ON_THE_WEB = new Set(['WebSearch', 'WebFetch'])
const HELPERS = new Set(['Agent', 'Task'])
const ASKING = new Set(['AskUserQuestion', 'ExitPlanMode'])
const PLANNING = new Set(['TodoWrite', 'ToolSearch', 'Skill', 'EnterPlanMode'])

export function moodOfTool(tool: string): Mood {
  if (HELPERS.has(tool)) return 'helpers'
  if (ASKING.has(tool)) return 'wait'
  if (READING.has(tool)) return 'read'
  if (RUNNING.has(tool) || tool.startsWith('mcp__terminal__')) return 'run'
  if (ON_THE_WEB.has(tool) || /^mcp__(Claude_Browser|claude-in-chrome)__/.test(tool)) return 'web'
  if (PLANNING.has(tool)) return 'think'

  return 'work'
}

/** How long a passing mood stays before the otter goes back to sleep. */
export const DONE_MS = 4000
export const OOPS_MS = 5000
