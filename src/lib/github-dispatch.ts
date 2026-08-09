/**
 * Active push to the GitHub snapshot mirror.
 *
 * When the source feed gains NEW content, we notify the snapshot repo
 * (tg-aggregator-cn-snapshot) via a `repository_dispatch` event so it re-syncs
 * immediately, instead of waiting for the next 15-minute poll. The China-
 * accessible mirror therefore updates within seconds of a Telegram post landing.
 *
 * Fully opt-in: with no `GH_DISPATCH_TOKEN` configured this is a no-op, and the
 * existing scheduled GitHub Actions poll remains the fallback.
 */

import type { KVNamespaceLike } from './cloudflare'
import { getEnv } from './env'

const DEFAULT_REPO = '17678319606/tg-aggregator-cn-snapshot'
const DEFAULT_MIN_INTERVAL = 300
const KV_KEY = 'gh-dispatch-state'
const DISPATCH_TIMEOUT_MS = 5000

export interface DispatchState {
  ts: number
  sig: string
}

export interface DispatchConfig {
  token?: string
  repo: string
  minInterval: number
}

/**
 * Read active-push config from the Workers runtime. Secrets/vars are injected
 * via `wrangler secret put` (or the dashboard) and exposed at runtime through
 * `process.env` (nodejs_compat). All fields are optional.
 */
export function resolveDispatchConfig(): DispatchConfig {
  const token = getEnv(undefined, 'GH_DISPATCH_TOKEN')
  const minRaw = getEnv(undefined, 'GH_DISPATCH_MIN_INTERVAL')
  const parsed = minRaw ? Number.parseInt(minRaw, 10) : DEFAULT_MIN_INTERVAL
  return {
    token,
    repo: getEnv(undefined, 'GH_DISPATCH_REPO') || DEFAULT_REPO,
    minInterval: Number.isFinite(parsed) ? Math.min(3600, Math.max(30, parsed)) : DEFAULT_MIN_INTERVAL,
  }
}

// Per-isolate in-memory debounce, used when no KV binding is configured. The
// 5-minute edge cache on this RSS route already bounds how often the handler
// runs, so this only trims short bursts.
let memoryState: DispatchState | null = null

async function readState(kv: KVNamespaceLike | undefined): Promise<DispatchState | null> {
  if (kv) {
    try {
      return (await kv.get(KV_KEY, 'json')) as DispatchState | null
    }
    catch {
      return null
    }
  }
  return memoryState
}

async function writeState(kv: KVNamespaceLike | undefined, state: DispatchState): Promise<void> {
  memoryState = state
  if (kv) {
    try {
      await kv.put(KV_KEY, JSON.stringify(state), { expirationTtl: 60 * 60 * 24 * 30 })
    }
    catch {
      // in-memory fallback already updated above
    }
  }
}

/**
 * Notify the snapshot repo to re-sync NOW — but only when a token is set,
 * enough time elapsed since the last dispatch (debounce), and the content
 * signature changed (new posts arrived). Fire-and-forget safe: any failure is
 * logged and swallowed so RSS delivery is never affected.
 */
export async function maybeDispatchContentUpdate(
  config: DispatchConfig,
  signature: string,
  kv: KVNamespaceLike | undefined,
): Promise<void> {
  if (!config.token)
    return

  const now = Math.floor(Date.now() / 1000)
  const last = await readState(kv)
  if (last) {
    if (now - last.ts < config.minInterval)
      return
    if (last.sig === signature)
      return
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS)
  try {
    const res = await fetch(`https://api.github.com/repos/${config.repo}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'BroadcastChannel-ActivePush',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ event_type: 'snapshot', client_payload: { signature } }),
      signal: controller.signal,
    })
    if (res.status === 204 || (res.status >= 200 && res.status < 300)) {
      await writeState(kv, { ts: now, sig: signature })
    }
    else {
      console.error('[gh-dispatch] unexpected status', res.status, await res.text().catch(() => ''))
    }
  }
  catch (err) {
    console.error('[gh-dispatch] request failed', err instanceof Error ? err.message : err)
  }
  finally {
    clearTimeout(timer)
  }
}
