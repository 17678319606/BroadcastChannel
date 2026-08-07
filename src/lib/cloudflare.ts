/**
 * Safe accessors for Cloudflare Workers runtime bindings.
 *
 * Bindings (KV namespaces, D1, etc.) are only present at request time on the
 * Cloudflare adapter. On other runtimes (Node dev server, EdgeOne) they are
 * undefined, and callers fall back to an in-memory cache gracefully.
 */

export interface KVNamespaceLike {
  get: (key: string, type: 'text' | 'json') => Promise<unknown>
  put: (key: string, value: string, opts?: { expirationTtl?: number }) => Promise<void>
}

/** Resolve the feed-cache KV namespace (binding name `FEED_CACHE`), if bound. */
export function getKVBinding(locals: unknown): KVNamespaceLike | undefined {
  const runtime = (locals as { runtime?: { env?: Record<string, unknown> } } | undefined)?.runtime
  const binding = runtime?.env?.FEED_CACHE
  return (binding as KVNamespaceLike | undefined) ?? undefined
}
