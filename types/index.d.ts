// The main conversation's last request: when it ended, its cache figures, what broke the cache since, and its lifetime.
export type CacheReading = {
  at: number
  read: number
  write: number
  input: number
  model?: string
  broken?: string
  // The lifetime the transcript showed the cache was written with, in ms; the setting where unknown.
  ttl?: number
}

declare module 'claude-code' {
  interface PluginState {
    'cache-meter': { reading: Shaped<CacheReading | null>; now: Shaped<number> }
  }
}
