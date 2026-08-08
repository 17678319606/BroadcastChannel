import type { APIRoute } from 'astro'
import { getKVBinding } from '../lib/cloudflare'
import { getPageSize } from '../lib/env'
import { getFeedData, resolvePagination } from '../lib/feed'
import { buildWordPressRss } from '../lib/rss'

export const GET: APIRoute = async (context) => {
  const pageSize = getPageSize(import.meta.env)

  const feedData = await getFeedData(context, getKVBinding())
  const total = feedData.posts.filter(p => Boolean(p.id && p.datetime)).length

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
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
