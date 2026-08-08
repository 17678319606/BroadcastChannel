import type { APIRoute } from 'astro'

export const GET: APIRoute = () => {
  return Response.json({
    prerender: [
      {
        urls: ['/', '/tags'],
        eagerness: 'eager',
      },
    ],
    prefetch: [
      {
        where: { href_matches: ['/posts/*'] },
        eagerness: 'moderate',
      },
    ],
  }, {
    headers: {
      'Content-Type': 'application/speculationrules+json',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600',
    },
  })
}
