/**
 * Safe accessors for Cloudflare Workers runtime bindings.
 *
 * Bindings (KV namespaces, D1, etc.) are only present at request time on the
 * Cloudflare adapter. On other runtimes (Node dev server, EdgeOne) they are
 * undefined, and callers fall back to an in-memory cache gracefully.
 *
 * NOTE: In Astro v6 + @astrojs/cloudflare v14 the legacy
 * `Astro.locals.runtime.env` accessor was removed. The supported way to reach
 * Worker vars/bindings is the `cloudflare:workers` env module. This file is only
 * imported by route modules (bundled for the Workers runtime), never by unit
 * tests, so the static import is safe.
 */
import { env } from 'cloudflare:workers'

export interface KVNamespaceLike {
  get: (key: string, type: 'text' | 'json') => Promise<unknown>
  put: (key: string, value: string, opts?: { expirationTtl?: number }) => Promise<void>
}

/** Resolve the feed-cache KV namespace (binding name `FEED_CACHE`), if bound. */
export function getKVBinding(): KVNamespaceLike | undefined {
  const binding = (env as Record<string, unknown>).FEED_CACHE
  return (binding as KVNamespaceLike | undefined) ?? undefined
}
