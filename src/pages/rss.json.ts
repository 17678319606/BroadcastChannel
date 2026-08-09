import type { APIRoute } from 'astro'
import { getKVBinding } from '../lib/cloudflare'
import { getPageSize } from '../lib/env'
import { buildJsonFeed, getFeedData, resolvePagination } from '../lib/feed'
import { resolveDispatchConfig, maybeDispatchContentUpdate } from '../lib/github-dispatch'

export const GET: APIRoute = async (context) => {
  const pageSize = getPageSize(import.meta.env)

  const feedData = await getFeedData(context, getKVBinding())
  const total = feedData.posts.filter(p => Boolean(p.id && p.datetime)).length

  // Active push: tell the GitHub snapshot mirror to re-sync immediately when
  // new content arrived. No-op unless GH_DISPATCH_TOKEN is configured; never
  // throws (wrapped) so RSS delivery is unaffected.
  try {
    const indexed = feedData.posts.filter(p => Boolean(p.id && p.datetime))
    const latest = indexed[0]
    const signature = `${indexed.length}::${latest?.id ?? ''}::${latest?.datetime ?? ''}`
    await maybeDispatchContentUpdate(resolveDispatchConfig(), signature, getKVBinding())
  }
  catch {
    // ignore — must not break the feed
  }

  // Same pagination semantics as /rss.xml — keeps the two feeds in lock-step.
  const pagination = resolvePagination(context, total, pageSize)

  // Out-of-range pages return a clean 404, mirroring the RSS feed.
  if (pagination.page > pagination.totalPages) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'Content-Type': 'application/feed+json; charset=utf-8' },
    })
  }

  const feed = buildJsonFeed(feedData, pagination)

  return new Response(JSON.stringify(feed), {
    headers: {
      // Edge cache 5 min; serve stale up to 1h while revalidating so readers
      // never block on an upstream Telegram fetch. Brotli (CF default) keeps
      // the full-text payload small.
      'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
      'Content-Type': 'application/feed+json; charset=utf-8',
    },
  })
}
