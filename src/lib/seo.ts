import type { ChannelInfo, SeoMeta } from '../types'
import { getBooleanEnv } from './env'

const TRAILING_SLASH_REGEX = /\/$/
const URL_PROTOCOL_REGEX = /^https?:\/\//
const ARTICLE_PATH_REGEX = /\/posts\/[^/]+$/

export function normalizePathname(pathname: string): string {
  return pathname.replace(TRAILING_SLASH_REGEX, '') || '/'
}

export function getAbsoluteSiteUrl(siteUrl: string, origin: string): string {
  return siteUrl.startsWith('http') ? siteUrl : new URL(siteUrl, origin).toString()
}

/**
 * Build a 1200×630 social share image through the wsrv.nl proxy. Used for both
 * the channel avatar (when no post image exists) and a post's first image so
 * OG / Twitter cards always carry a properly-sized, format-optimized picture.
 * Returns undefined when the source is not a usable http(s) URL.
 */
export function buildSocialImage(imageUrl?: string): string | undefined {
  if (!imageUrl)
    return undefined
  try {
    const parsed = new URL(imageUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return undefined
    return `https://wsrv.nl/?w=1200&h=630&fit=cover&url=ssl:${parsed.host}${parsed.pathname}`
  }
  catch {
    return undefined
  }
}

/** Extract the first <img src> from a post's raw HTML content. */
export function extractFirstImageUrl(html?: string): string | undefined {
  if (!html)
    return undefined
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return match?.[1]
}

export function resolveSiteUrl(siteUrl: string, origin: string): URL {
  const resolvedSiteUrl = new URL(getAbsoluteSiteUrl(siteUrl, origin))
  resolvedSiteUrl.search = ''
  return resolvedSiteUrl
}

export function getSitemapUrl(baseUrl: URL, path: string): string {
  return new URL(path, baseUrl).toString()
}

export function getPageSeo(options: {
  channel?: ChannelInfo
  locale?: string
  seo?: SeoMeta
  siteUrl: string
  url: URL
}) {
  const { channel, locale, seo, siteUrl, url } = options
  const absoluteSiteUrl = getAbsoluteSiteUrl(siteUrl, url.origin)
  const canonicalUrl = new URL(url.pathname, absoluteSiteUrl)
  const siteRootPathname = normalizePathname(new URL(absoluteSiteUrl).pathname)
  const canonical = normalizePathname(canonicalUrl.pathname) === siteRootPathname
    ? canonicalUrl.toString()
    : canonicalUrl.toString().replace(TRAILING_SLASH_REGEX, '')

  const { pathname } = new URL(canonical)
  const currentPathname = normalizePathname(pathname)
  const pageTitle = seo?.title?.trim()
  const siteTitle = channel?.title ?? ''
  const seoDescription = (seo?.text ?? channel?.description)?.trim()
  const fallbackShareImage = channel?.avatar
    ? `https://wsrv.nl/?w=1200&h=630&fit=cover&url=ssl:${channel.avatar.replace(URL_PROTOCOL_REGEX, '')}`
    : new URL('favicon.ico', absoluteSiteUrl).toString()
  const shareImage = seo?.image ? buildSocialImage(seo.image) ?? fallbackShareImage : fallbackShareImage
  const favicon = channel?.avatar
    ? `https://wsrv.nl/?w=64&h=64&fit=cover&mask=circle&url=ssl:${channel.avatar.replace(URL_PROTOCOL_REGEX, '')}`
    : new URL('favicon.svg', absoluteSiteUrl).toString()
  const isArticle = ARTICLE_PATH_REGEX.test(pathname)

  return {
    absoluteSiteUrl,
    canonical,
    currentPathname,
    hasCustomTitle: Boolean(pageTitle && pageTitle !== siteTitle),
    linksPathname: normalizePathname(new URL('links', absoluteSiteUrl).pathname),
    shareImage,
    seoParams: {
      title: pageTitle,
      description: seoDescription,
      canonical,
      noindex: seo?.noindex ?? getBooleanEnv(import.meta.env, 'NOINDEX'),
      nofollow: seo?.nofollow ?? getBooleanEnv(import.meta.env, 'NOFOLLOW'),
      openGraph: {
        basic: {
          type: isArticle ? 'article' : 'website',
          title: pageTitle ?? siteTitle,
          url: canonical,
          image: shareImage,
          siteName: siteTitle,
        },
        optional: {
          description: seoDescription,
          locale,
        },
        ...(isArticle
          ? {
              article: {
                publishedTime: seo?.publishedTime,
                modifiedTime: seo?.publishedTime,
                author: siteTitle,
              },
            }
          : {}),
      },
      extend: {
        link: [
          {
            rel: 'icon',
            href: favicon,
          },
          {
            rel: 'apple-touch-icon',
            href: new URL('favicon.ico', absoluteSiteUrl).toString(),
          },
          {
            rel: 'manifest',
            href: new URL('site.webmanifest', absoluteSiteUrl).toString(),
          },
        ],
      },
    },
    siteRootPathname,
    siteTitle,
    tagsPathname: normalizePathname(new URL('tags', absoluteSiteUrl).pathname),
  }
}
