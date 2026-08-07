import type { KVNamespaceLike } from '../cloudflare'

interface FeedCacheEntry {
  cachedAt: number
  ttlMs: number
  value: unknown
}

const MEM_TTL_MS = 5 * 60 * 1000
const memStore = new Map<string, FeedCacheEntry>()

/**
 * Cache an expensive computation behind Cloudflare KV (when bound) with an
 * in-memory fallback for non-Cloudflare runtimes.
 *
 * KV is free on the Workers free tier (100k reads + 1k writes per day). To stay
 * inside the daily write budget, callers must only cache coarse keys (e.g. the
 * whole latest feed per channel set) — never per-cursor pagination.
 *
 * On upstream failure, a slightly stale cached value is served (stale-while-error)
 * so the site stays available even if Telegram is slow or down.
 */
export async function withFeedCache<T>(
  key: string,
  ttlSeconds: number,
  kv: KVNamespaceLike | undefined,
  compute: () => Promise<T>,
): Promise<T> {
  const now = Date.now()
  const ttlMs = ttlSeconds * 1000
  let stale: T | undefined
  let hasStale = false

  if (kv) {
    try {
      const raw = (await kv.get(key, 'json')) as FeedCacheEntry | null
      if (raw && typeof raw.cachedAt === 'number' && 'value' in raw) {
        if (now - raw.cachedAt < raw.ttlMs) {
          return raw.value as T
        }
        stale = raw.value as T
        hasStale = true
      }
    }
    catch {
      // KV read error — ignore and compute.
    }
  }

  const mem = memStore.get(key)
  if (mem) {
    if (now - mem.cachedAt < mem.ttlMs) {
      return mem.value as T
    }
    if (!hasStale) {
      stale = mem.value as T
      hasStale = true
    }
  }

  try {
    const value = await compute()
    if (kv) {
      try {
        await kv.put(key, JSON.stringify({ cachedAt: now, ttlMs, value }), { expirationTtl: ttlSeconds + 120 })
      }
      catch {
        // Write over quota or binding missing — non-fatal.
      }
    }
    memStore.set(key, { cachedAt: now, ttlMs: Math.min(ttlMs, MEM_TTL_MS), value })
    return value
  }
  catch (err) {
    if (hasStale) {
      return stale as T
    }
    throw err
  }
}
