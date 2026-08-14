import type { APIRoute } from 'astro'
import { getKVBinding } from '../../lib/cloudflare'
import { getSitemapUrl, resolveSiteUrl } from '../../lib/seo'
import { decodeCursorMap, getChannelInfoCached } from '../../lib/telegram'

export const GET: APIRoute = async (Astro) => {
  const siteUrl = resolveSiteUrl(Astro.locals.SITE_URL, Astro.url.origin)
  const rawCursor = Astro.params.cursor
  const before = rawCursor === 'latest' || !rawCursor ? {} : decodeCursorMap(rawCursor)
  const channel = await getChannelInfoCached({ before }, getKVBinding())
  // Guard against posts with an empty/invalid datetime (`extractPost` can
  // produce `datetime: ''`); `new Date('')` is Invalid Date and would throw on
  // `.toISOString()`, 500-ing the whole sitemap. Skip those safely.
  const posts = (channel.posts || [])
    .filter(post => post.datetime && !Number.isNaN(Date.parse(post.datetime)))

  const xmlUrls = posts.map(post => `
    <url>
      <loc>${getSitemapUrl(siteUrl, `posts/${post.id}`)}</loc>
      <lastmod>${new Date(post.datetime).toISOString()}</lastmod>
    </url>
  `).join('')

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${xmlUrls}
</urlset>`, {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
      'Content-Type': 'application/xml',
    },
  })
}
