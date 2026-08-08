import type { FeedData } from './feed'
import { getEnv } from './env'
import { sanitizeFeedHtml } from './sanitize'

/**
 * Namespaces declared by a typical self-hosted WordPress RSS 2.0 feed.
 * Emitting them makes the feed consumable by the widest range of readers,
 * aggregators and "import from RSS" tools that expect the WordPress shape.
 *
 * Includes the Yahoo Media namespace so we can emit <media:thumbnail> for
 * posts that carry a lead image.
 */
const RSS_NAMESPACES = [
  'xmlns:content="http://purl.org/rss/1.0/modules/content/"',
  'xmlns:wfw="http://wellformedweb.org/CommentAPI/"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  'xmlns:atom="http://www.w3.org/2005/Atom"',
  'xmlns:sy="http://purl.org/rss/1.0/modules/syndication/"',
  'xmlns:slash="http://purl.org/rss/1.0/modules/slash/"',
  'xmlns:media="http://search.yahoo.com/mrss/"',
].join(' ')

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/** Escape the five XML predefined entities for use inside attribute/element text. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Wrap a value in a CDATA section. Splits any `]]>` sequence so it can never
 * prematurely close the CDATA (the standard safe-CDATA trick).
 */
function cdata(value: string): string {
  const safe = value.replace(/\]\]>/g, ']]]]><![CDATA[>')
  return `<![CDATA[${safe}]]>`
}

/** Format a date as RFC-822 with a fixed `+0000` offset (WordPress style). */
function formatRfc822(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${DAY_NAMES[date.getUTCDay()]}, ${pad(date.getUTCDate())} `
    + `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()} `
    + `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`
  )
}

/** Collapse whitespace and truncate plain text to a clean excerpt (WordPress-style). */
function plaintextExcerpt(text: string, maxLen = 200): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= maxLen) {
    return collapsed
  }
  return `${collapsed.slice(0, maxLen).replace(/\s+\S*$/, '')}…`
}

/**
 * Extract the first image URL from an HTML string, or null if none exists.
 * Used to emit <media:thumbnail> and <enclosure> elements.
 */
function extractFirstImage(html: string): string | null {
  // Match <img src="..."> — prefer src over srcset for simplicity
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return match?.[1]?.startsWith('http') ? match[1] : null
}

/**
 * Build a WordPress-shaped RSS 2.0 document from feed data.
 *
 * Differences from the previous `@astrojs/rss` output:
 * - Declares the full WordPress namespace set (content, wfw, dc, atom, sy, slash) plus media.
 * - Adds `<atom:link rel="self">`, `<sy:updatePeriod/Frequency>`, `<ttl>`, `<image>`.
 * - Each `<item>` carries:
 *   - `<dc:creator>` set to the **site brand name** (not per-post channel username).
 *   - One `<category>` per tag, `<guid isPermaLink="true">`.
 *   - Plaintext `<description>` excerpt + full-text `<content:encoded>`.
 *   - `<comments>` link (post URL — no native comment system but readers expect this).
 *   - `<source url="...">` pointing back to the original Telegram source channel.
 *   - `<media:thumbnail>` when the post has a lead image.
 *   - `<enclosure>` when the post has a downloadable media asset (image).
 *   - `<slash:comments>0`.
 * - Dates use the RFC-822 `+0000` form WordPress emits.
 */
export interface RssPagination {
  /** 1-based current page number. */
  page: number
  /** Number of items per page. */
  pageSize: number
  /** Total number of pages for the whole dataset. */
  totalPages: number
  /** Absolute URL of *this* page — used for <atom:link rel="self">. */
  selfUrl: string
  /** Absolute URL of the previous page — omitted on the first page. */
  prevUrl?: string
  /** Absolute URL of the next page — omitted on the last page. */
  nextUrl?: string
}

/**
 * Build a WordPress-shaped RSS 2.0 document from feed data.
 *
 * ... (see file header for the full element list) ...
 *
 * When `pagination` is supplied the channel gains `<atom:link rel="self">`,
 * `rel="prev"` (page > 1) and `rel="next"` (page < totalPages) so feed readers
 * and aggregators can walk older content the same way WordPress archive feeds
 * do. The item list is sliced to the current page. Omit `pagination` to emit
 * the full (unpaginated) feed for backward compatibility.
 */
export function buildWordPressRss(
  { channel, posts, siteUrl, title }: FeedData,
  pagination?: RssPagination,
): string {
  const feedUrl = pagination?.selfUrl ?? new URL('rss.xml', siteUrl).toString()
  const locale = getEnv(import.meta.env, 'LOCALE') || 'zh-CN'
  const siteUrlString = siteUrl.toString()
  const now = new Date()
  // Use the site brand title as dc:creator for every item (unified identity).
  const brandName = title || channel.title

  const allPosts = posts.filter(post => Boolean(post.id && post.datetime))
  const start = pagination ? (pagination.page - 1) * pagination.pageSize : 0
  const end = pagination ? start + pagination.pageSize : allPosts.length
  const itemsXml = allPosts.slice(start, end).map((post) => {
    const itemUrl = new URL(`posts/${post.id}`, siteUrl).toString()
    const pubDate = formatRfc822(new Date(post.datetime))
    const creator = escapeXml(brandName)
    const excerpt = escapeXml(plaintextExcerpt(post.text || ''))
    const fullContent = cdata(sanitizeFeedHtml(post.content || ''))
    const categories = (post.tags ?? [])
      .filter(Boolean)
      .map(tag => `      <category>${cdata(tag)}</category>`)
      .join('\n')

    // Source attribution: point back to the original Telegram channel page.
    const tgChannel = post.channel || ''
    const sourceUrl = tgChannel ? `https://t.me/${tgChannel}` : ''
    const sourceXml = sourceUrl
      ? `      <source url="${escapeXml(sourceUrl)}">${escapeXml(channel.title)}</source>\n`
      : ''

    // Media thumbnail / enclosure for posts with images.
    const imageUrl = extractFirstImage(post.content || '')
    let mediaXml = ''
    if (imageUrl) {
      mediaXml
        = `      <media:thumbnail url="${escapeXml(imageUrl)}" />\n`
          + `      <enclosure url="${escapeXml(imageUrl)}" type="image/jpeg" length="0" />\n`
    }

    return `    <item>
      <title>${escapeXml(post.title || '无标题')}</title>
      <link>${escapeXml(itemUrl)}</link>
      <dc:creator>${creator}</dc:creator>
      <pubDate>${pubDate}</pubDate>
${categories}      <guid isPermaLink="true">${escapeXml(itemUrl)}</guid>
      <description>${excerpt}</description>
      <comments>${escapeXml(itemUrl)}</comments>
      <content:encoded>${fullContent}</content:encoded>
${sourceXml}${mediaXml}      <slash:comments>0</slash:comments>
    </item>`
  }).join('\n')

  const imageXml = channel.avatar
    ? `    <image>
      <url>${escapeXml(channel.avatar)}</url>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(siteUrlString)}</link>
    </image>
`
    : ''

  const pagingLinks = [
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
  ]
  if (pagination?.prevUrl) {
    pagingLinks.push(
      `    <atom:link href="${escapeXml(pagination.prevUrl)}" rel="prev" type="application/rss+xml" />`,
    )
  }
  if (pagination?.nextUrl) {
    pagingLinks.push(
      `    <atom:link href="${escapeXml(pagination.nextUrl)}" rel="next" type="application/rss+xml" />`,
    )
  }
  const pagingXml = `${pagingLinks.join('\n')}\n`

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" ${RSS_NAMESPACES}>
  <channel>
    <title>${escapeXml(title)}</title>
${pagingXml}    <link>${escapeXml(siteUrlString)}</link>
    <description>${escapeXml(channel.description || '')}</description>
    <lastBuildDate>${formatRfc822(now)}</lastBuildDate>
    <language>${escapeXml(locale)}</language>
    <sy:updatePeriod>hourly</sy:updatePeriod>
    <sy:updateFrequency>1</sy:updateFrequency>
    <ttl>60</ttl>
    <generator>BroadcastChannel (Astro)</generator>
${imageXml}    ${itemsXml}
  </channel>
</rss>`
}
