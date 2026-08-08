import type { FeedData } from './feed'
import { getEnv } from './env'
import { sanitizeFeedHtml } from './sanitize'

/**
 * Namespaces declared by a typical self-hosted WordPress RSS 2.0 feed.
 * Emitting them makes the feed consumable by the widest range of readers,
 * aggregators and "import from RSS" tools that expect the WordPress shape.
 */
const RSS_NAMESPACES = [
  'xmlns:content="http://purl.org/rss/1.0/modules/content/"',
  'xmlns:wfw="http://wellformedweb.org/CommentAPI/"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  'xmlns:atom="http://www.w3.org/2005/Atom"',
  'xmlns:sy="http://purl.org/rss/1.0/modules/syndication/"',
  'xmlns:slash="http://purl.org/rss/1.0/modules/slash/"',
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
 * Build a WordPress-shaped RSS 2.0 document from feed data.
 *
 * Differences from the previous `@astrojs/rss` output:
 * - Declares the full WordPress namespace set (content, wfw, dc, atom, sy, slash).
 * - Adds `<atom:link rel="self">`, `<sy:updatePeriod/Frequency>` and a `<image>`.
 * - Each `<item>` carries `<dc:creator>`, one `<category>` per tag, and a
 *   plaintext `<description>` excerpt plus a full-text `<content:encoded>`.
 * - Dates use the RFC-822 `+0000` form WordPress emits.
 */
export function buildWordPressRss({ channel, posts, siteUrl, title }: FeedData): string {
  const feedUrl = new URL('rss.xml', siteUrl).toString()
  const locale = getEnv(import.meta.env, 'LOCALE') || 'zh-CN'
  const siteUrlString = siteUrl.toString()
  const now = new Date()

  const itemsXml = posts
    .filter(post => Boolean(post.id && post.datetime))
    .map((post) => {
      const itemUrl = new URL(`posts/${post.id}`, siteUrl).toString()
      const pubDate = formatRfc822(new Date(post.datetime))
      const creator = escapeXml(post.channel || channel.title)
      const excerpt = escapeXml(plaintextExcerpt(post.text || ''))
      const fullContent = cdata(sanitizeFeedHtml(post.content || ''))
      const categories = (post.tags ?? [])
        .filter(Boolean)
        .map(tag => `      <category>${cdata(tag)}</category>`)
        .join('\n')

      return `    <item>
      <title>${escapeXml(post.title || '无标题')}</title>
      <link>${escapeXml(itemUrl)}</link>
      <dc:creator>${creator}</dc:creator>
      <pubDate>${pubDate}</pubDate>
${categories}
      <guid isPermaLink="true">${escapeXml(itemUrl)}</guid>
      <description>${excerpt}</description>
      <content:encoded>${fullContent}</content:encoded>
      <slash:comments>0</slash:comments>
    </item>`
    })
    .join('\n')

  const imageXml = channel.avatar
    ? `    <image>
      <url>${escapeXml(channel.avatar)}</url>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(siteUrlString)}</link>
    </image>
`
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" ${RSS_NAMESPACES}>
  <channel>
    <title>${escapeXml(title)}</title>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
    <link>${escapeXml(siteUrlString)}</link>
    <description>${escapeXml(channel.description || '')}</description>
    <lastBuildDate>${formatRfc822(now)}</lastBuildDate>
    <language>${escapeXml(locale)}</language>
    <sy:updatePeriod>hourly</sy:updatePeriod>
    <sy:updateFrequency>1</sy:updateFrequency>
    <generator>BroadcastChannel (Astro)</generator>
${imageXml}    ${itemsXml}
  </channel>
</rss>`
}
