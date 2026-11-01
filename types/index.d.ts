// The main conversation's last request: when it ended, its cache figures, and what broke the cache since.
export type CacheReading = {
  at: number
  read: number
  write: number
  input: number
  model?: string
  broken?: string
}

declare module 'claude-code' {
  interface PluginState {
    'cache-meter': { reading: Shaped<CacheReading | null>; now: Shaped<number> }
  }
}
