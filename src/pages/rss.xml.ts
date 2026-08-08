import type { APIRoute } from 'astro'
import { getKVBinding } from '../lib/cloudflare'
import { getFeedData } from '../lib/feed'
import { buildWordPressRss } from '../lib/rss'

export const GET: APIRoute = async (context) => {
  const feedData = await getFeedData(context, getKVBinding())
  const xml = buildWordPressRss(feedData)

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
