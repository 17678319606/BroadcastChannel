import type { APIRoute } from 'astro'
import { getSitemapUrl, resolveSiteUrl } from '../lib/seo'
import { buildChannelCursor, encodeCursorMap, getChannelInfo } from '../lib/telegram'

const MAX_SITEMAPS = 50

export const GET: APIRoute = async (Astro) => {
  const siteUrl = resolveSiteUrl(Astro.locals.SITE_URL, Astro.url.origin)

  const entries: string[] = []
  let cursor: Record<string, string> = {}

  for (let i = 0; i < MAX_SITEMAPS; i++) {
    const channel = await getChannelInfo({ before: cursor })
    const posts = channel.posts || []
    if (posts.length === 0) {
      break
    }

    // The newest page is referenced by the `latest` token; older pages encode their
    // own per-channel boundary cursor.
    const boundary = buildChannelCursor(posts, 'before')
    const token = i === 0 ? 'latest' : encodeCursorMap(boundary ?? {})
    entries.push(
      `\n<sitemap>\n  <loc>${getSitemapUrl(siteUrl, `sitemap/${token}.xml`)}</loc>\n</sitemap>`,
    )

    if (!boundary) {
      break
    }
    cursor = boundary
  }

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${entries.join('')}
</sitemapindex>`, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'application/xml',
    },
  })
}
