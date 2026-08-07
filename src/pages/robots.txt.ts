import type { APIRoute } from 'astro'

export const GET: APIRoute = async (Astro) => {
  // In an API route `Astro.url` may lack an origin (path-only), so derive it from the Host header.
  const host = Astro.request.headers.get('host') ?? 'localhost'
  const protocol = Astro.url.protocol?.startsWith('http') ? Astro.url.protocol : 'http:'
  const sitemapUrl = new URL('sitemap.xml', `${protocol}//${host}`).toString()

  const body = `User-agent: *
Allow: /
Disallow: /before/
Disallow: /after/
Disallow: /search/
Disallow: /rules/
Disallow: /static/

Sitemap: ${sitemapUrl}
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
