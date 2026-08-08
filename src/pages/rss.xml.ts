import type { APIRoute } from 'astro'
import type { RssPagination } from '../lib/rss'
import { getKVBinding } from '../lib/cloudflare'
import { getPageSize } from '../lib/env'
import { getFeedData } from '../lib/feed'
import { buildWordPressRss } from '../lib/rss'

export const GET: APIRoute = async (context) => {
  const pageSize = getPageSize(import.meta.env)

  // Resolve the requested page (1-based). Non-numeric / missing → page 1.
  const rawPage = context.url.searchParams.get('page')
  const requested = rawPage ? Number.parseInt(rawPage, 10) : 1
  const page = Number.isFinite(requested) && requested >= 1 ? Math.floor(requested) : 1

  const feedData = await getFeedData(context, getKVBinding())
  const total = feedData.posts.filter(p => Boolean(p.id && p.datetime)).length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // Out-of-range pages return a clean 404 (RSS readers treat this as "the end").
  if (page > totalPages) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
    })
  }

  // Build page URLs while preserving any other query params (e.g. ?tag=).
  const buildPageUrl = (target: number | null): string => {
    const url = new URL(context.url.toString())
    if (target === null) {
      url.searchParams.delete('page')
    }
    else {
      url.searchParams.set('page', String(target))
    }
    return url.toString()
  }

  const selfUrl = page === 1 ? buildPageUrl(null) : buildPageUrl(page)
  const prevUrl = page > 1 ? buildPageUrl(page === 2 ? null : page - 1) : undefined
  const nextUrl = page < totalPages ? buildPageUrl(page + 1) : undefined

  const pagination: RssPagination = { page, pageSize, totalPages, selfUrl, prevUrl, nextUrl }
  const xml = buildWordPressRss(feedData, pagination)

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
