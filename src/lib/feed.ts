import type { APIContext } from 'astro'
import type { ChannelInfo, Post } from '../types'
import type { KVNamespaceLike } from './cloudflare'
import { sanitizeFeedHtml } from './sanitize'
import { getChannelInfoCached } from './telegram'

export interface FeedData {
  channel: ChannelInfo
  posts: Post[]
  siteUrl: URL
  title: string
}

/**
 * Pagination descriptor shared by the RSS 2.0 and JSON Feed outputs so both
 * stay in lock-step (same `?page=` semantics, same self/prev/next URLs).
 */
export interface RssPagination {
  /** 1-based current page number. */
  page: number
  /** Number of items per page. */
  pageSize: number
  /** Total number of pages for the whole dataset. */
  totalPages: number
  /** Absolute URL of *this* page — used for <atom:link rel="self"> / feed_url. */
  selfUrl: string
  /** Absolute URL of the previous page — omitted on the first page. */
  prevUrl?: string
  /** Absolute URL of the next page — omitted on the last page. */
  nextUrl?: string
}

/**
 * Resolve feed pagination from the incoming request URL.
 *
 * Mirrors the WordPress archive-feed behaviour: `?page=` is 1-based, a
 * non-numeric / missing value falls back to page 1, and the self/prev/next
 * URLs preserve any other query params (e.g. `?tag=`). The caller decides what
 * to do with out-of-range pages (the RSS and JSON Feed routes both 404).
 */
export function resolvePagination(context: APIContext, total: number, pageSize: number): RssPagination {
  const rawPage = context.url.searchParams.get('page')
  const requested = rawPage ? Number.parseInt(rawPage, 10) : 1
  const page = Number.isFinite(requested) && requested >= 1 ? Math.floor(requested) : 1
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const buildPageUrl = (target: number | null): string => {
    const url = new URL(context.url.toString())
    // The feed only honours `tag` (filter) and `page` (pagination). Drop any
    // other params — e.g. cache-busters like `?ts=` — so the generated
    // self/prev/next URLs stay clean and don't leak into downstream fetches.
    for (const key of [...url.searchParams.keys()]) {
      if (key !== 'tag')
        url.searchParams.delete(key)
    }
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

  return { page, pageSize, totalPages, selfUrl, prevUrl, nextUrl }
}

export interface JsonFeedData {
  version: string
  title: string
  description: string
  home_page_url: string
  feed_url: string
  /** JSON Feed 1.1 standard field: URL of the next page of the feed. */
  next_url?: string
  /** Extension mirror of RSS `rel="prev"` — omitted on the first page. */
  prev_url?: string
  items: {
    id: string
    url: string
    title: string | undefined
    summary: string | undefined
    date_published: string
    tags: string[]
    content_html: string
  }[]
}

export function buildJsonFeed({ channel, posts, siteUrl, title }: FeedData, pagination?: RssPagination): JsonFeedData {
  const allPosts = posts.filter(post => Boolean(post.id && post.datetime))
  const start = pagination ? (pagination.page - 1) * pagination.pageSize : 0
  const end = pagination ? start + pagination.pageSize : allPosts.length

  const feedUrl = pagination?.selfUrl ?? new URL('rss.json', siteUrl).toString()

  const feed: JsonFeedData = {
    version: 'https://jsonfeed.org/version/1.1',
    title,
    description: channel.description,
    home_page_url: siteUrl.toString(),
    feed_url: feedUrl,
    items: allPosts.slice(start, end).map((item) => {
      const itemUrl = new URL(`posts/${item.id}`, siteUrl).toString()

      return {
        id: itemUrl,
        url: itemUrl,
        title: item.title || undefined,
        summary: item.description,
        date_published: new Date(item.datetime).toISOString(),
        tags: item.tags,
        content_html: sanitizeFeedHtml(item.content),
      }
    }),
  }

  // Mirror the RSS atom:link prev/next so consumers can walk the archive.
  if (pagination?.nextUrl) {
    feed.next_url = pagination.nextUrl
  }
  if (pagination?.prevUrl) {
    feed.prev_url = pagination.prevUrl
  }

  return feed
}

export async function getFeedData(context: APIContext, kv?: KVNamespaceLike): Promise<FeedData> {
  const tag = context.url.searchParams.get('tag')
  const channel = await getChannelInfoCached({
    q: tag ? `#${tag}` : '',
  }, kv)
  const siteUrl = new URL(context.locals.SITE_URL, context.url.origin)
  siteUrl.search = ''

  return {
    channel,
    posts: channel.posts ?? [],
    siteUrl,
    title: `${tag ? `${tag} | ` : ''}${channel.title}`,
  }
}
