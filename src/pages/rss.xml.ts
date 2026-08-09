import type { APIRoute } from 'astro'
import { getKVBinding } from '../lib/cloudflare'
import { getPageSize } from '../lib/env'
import { getFeedData, resolvePagination } from '../lib/feed'
import { buildWordPressRss } from '../lib/rss'
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

  // Shared with /rss.json so both feeds paginate identically.
  const pagination = resolvePagination(context, total, pageSize)

  // Out-of-range pages return a clean 404 (feed readers treat this as "the end").
  if (pagination.page > pagination.totalPages) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
    })
  }

  const xml = buildWordPressRss(feedData, pagination)

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      // Edge cache 5 min; serve stale up to 1h while revalidating so readers
      // never block on an upstream Telegram fetch.
      'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
    },
  })
}
