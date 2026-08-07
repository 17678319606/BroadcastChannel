import { describe, expect, it } from 'vitest'
import { buildSocialImage, extractFirstImageUrl, getPageSeo, getSitemapUrl, resolveSiteUrl } from './seo'

describe('page SEO', () => {
  it('uses the request URL to resolve relative site URLs and canonical paths', () => {
    const result = getPageSeo({
      siteUrl: '/blog/',
      url: new URL('https://preview.example/blog/posts/1?source=test'),
    })

    expect(result.canonical).toBe('https://preview.example/blog/posts/1')
  })
})

describe('sitemap URL helpers', () => {
  it('resolves relative site URLs against the request origin', () => {
    const siteUrl = resolveSiteUrl('/blog/', 'https://preview.example')

    expect(getSitemapUrl(siteUrl, 'posts/1')).toBe('https://preview.example/blog/posts/1')
  })

  it('uses absolute site URLs instead of the request origin', () => {
    const siteUrl = resolveSiteUrl('https://site.example/blog/', 'https://preview.example')

    expect(getSitemapUrl(siteUrl, 'posts/1')).toBe('https://site.example/blog/posts/1')
  })

  it('keeps configured subpaths for sitemap index URLs', () => {
    const siteUrl = resolveSiteUrl('/blog/', 'https://preview.example')

    expect(getSitemapUrl(siteUrl, 'sitemap/20.xml')).toBe('https://preview.example/blog/sitemap/20.xml')
  })
})

describe('social share image', () => {
  it('proxies an http image through wsrv.nl at 1200x630', () => {
    expect(buildSocialImage('https://cdn.t.me/file/abc.jpg')).toBe(
      'https://wsrv.nl/?w=1200&h=630&fit=cover&url=ssl:cdn.t.me/file/abc.jpg',
    )
  })

  it('returns undefined for non-http image sources', () => {
    expect(buildSocialImage('data:image/png;base64,xxx')).toBeUndefined()
    expect(buildSocialImage('')).toBeUndefined()
    expect(buildSocialImage(undefined)).toBeUndefined()
  })

  it('extracts the first image src from post HTML', () => {
    const html = '<p>hi</p><img src="https://cdn.t.me/x.jpg" alt="x"><img src="y.jpg">'
    expect(extractFirstImageUrl(html)).toBe('https://cdn.t.me/x.jpg')
  })

  it('returns undefined when there is no image', () => {
    expect(extractFirstImageUrl('<p>no images here</p>')).toBeUndefined()
  })

  it('prefers the seo image override for the share image', () => {
    const result = getPageSeo({
      seo: { image: 'https://cdn.t.me/cover.jpg' },
      siteUrl: '/',
      url: new URL('https://example.com/posts/1'),
    })

    expect(result.shareImage).toBe('https://wsrv.nl/?w=1200&h=630&fit=cover&url=ssl:cdn.t.me/cover.jpg')
  })
})
