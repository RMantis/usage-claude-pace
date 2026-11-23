export type PaceSnap = {
  /** Percentage used of the weekly (seven_day) window. */
  pct: number
  /** When the weekly window resets, ISO 8601. */
  resetsAt: string
}

declare module 'claude-code' {
  interface PluginState {
    'usage-pace': { snap: PaceSnap | null; view: 'recap' | 'detail' }
  }
}
