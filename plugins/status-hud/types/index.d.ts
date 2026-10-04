export type Limit = { pct: number; resetsAt?: string }
export type Usage = { ctxPct?: number; ctxTokens?: number; ctxWindow?: number; five?: Limit; seven?: Limit }
export type Call = { id: string; verb: string; target: string }
export type Blocked = { id: string; label: string }
export type Phase = 'idle' | 'thinking' | 'writing'
export type Notice = { kind: 'error' | 'interrupted' | 'refused' }

declare module 'claude-code' {
  interface PluginState {
    'status-hud': {
      usage: Usage
      tick: number
      calls: Call[]
      blocked: Blocked[]
      phase: Phase
      isCompacting: boolean
      notice: Notice | null
    }
  }
}
