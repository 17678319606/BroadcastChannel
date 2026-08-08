import process from 'node:process'
import { defineMiddleware } from 'astro:middleware'

function getEncodedTagSearchQuery(pathname: string): string {
  if (!pathname.startsWith('/search/%23')) {
    return ''
  }

  try {
    return decodeURIComponent(pathname.slice('/search/'.length))
  }
  catch {
    return ''
  }
}

export function isHtmlResponse(response: Response): boolean {
  return response.headers.get('content-type')?.includes('text/html') ?? false
}

export function shouldApplyDefaultCache(response: Response): boolean {
  return response.status >= 200 && response.status < 400 && !response.headers.has('Cache-Control')
}

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.SITE_URL = `${import.meta.env.SITE ?? ''}${import.meta.env.BASE_URL}`
  context.locals.RSS_URL = `${context.locals.SITE_URL}rss.xml`
  context.locals.RSS_PREFIX = ''

  // Cloudflare Workers exposes runtime variables (configured in the dashboard or
  // wrangler `vars`) via the `cloudflare:workers` `env` module — NOT via
  // `import.meta.env` (build-time only) nor `process.env`. Bridge them into
  // `process.env` so the rest of the app, which resolves env through `getEnv`
  // (process.env first), picks them up at runtime. Idempotent: only fills keys
  // that are currently unset.
  // Astro v6 removed `Astro.locals.runtime.env`; use `import('cloudflare:workers')`
  // instead. Dynamic import keeps this file safe to load outside the Workers
  // runtime (unit tests) — the import only runs while a request is handled.
  try {
    const { env } = await import('cloudflare:workers')
    if (env && typeof process !== 'undefined') {
      for (const [key, value] of Object.entries(env)) {
        if (typeof value === 'string' && process.env[key] === undefined) {
          process.env[key] = value
        }
      }
    }
  }
  catch {
    // Not running on Cloudflare — leave process.env as-is.
  }

  const querySearch = context.url.searchParams.get('q') || ''
  const legacyTagSearch = getEncodedTagSearchQuery(context.url.pathname)
  const pathSearch = context.params.q || ''
  const searchQuery = querySearch || legacyTagSearch || pathSearch

  if (context.url.pathname.startsWith('/search') && searchQuery.startsWith('#')) {
    const tag = searchQuery.replace('#', '')
    context.locals.RSS_URL = `${context.locals.SITE_URL}rss.xml?tag=${encodeURIComponent(tag)}`
    context.locals.RSS_PREFIX = `${tag} | `
  }

  const response = legacyTagSearch
    ? await context.rewrite(`/search/result?q=${encodeURIComponent(legacyTagSearch)}`)
    : await next()

  if (!response.bodyUsed) {
    if (isHtmlResponse(response)) {
      response.headers.set('Speculation-Rules', '"/rules/prefetch.json"')
    }

    if (shouldApplyDefaultCache(response)) {
      // Edge cache 5 min; serve stale for up to 1h while revalidating in the
      // background so users never wait on an upstream Telegram fetch.
      response.headers.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600')
    }

    // 4xx/5xx: keep a tiny edge TTL so transient errors don't hammer origin,
    // but never cache a 404 as a "page exists" response for long.
    if (response.status >= 400 && !response.headers.has('Cache-Control')) {
      response.headers.set('Cache-Control', 'public, max-age=10, s-maxage=10')
    }
  }
  return response
})
