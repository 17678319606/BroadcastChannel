import type { AggregatedChannelInfoParams, ChannelCursorMap, ChannelInfo, GetChannelInfoParams, Post } from '../../types'
import type { KVNamespaceLike } from '../cloudflare'
import { withFeedCache } from '../cache/feedCache'
import { getBooleanEnv, getChannelList, getEnv, getFeedCacheTtl, getPrimaryChannel } from '../env'
import { isBlockedContent } from '../safety'
import { modifyHTMLContent } from './content'
import { extractPost } from './parse'
import { loadChannelDocument } from './request'
import { normalizeUrlAttribute } from './url'

/** Separator between channel username and Telegram message id in a composite post id. */
const COMPOSITE_SEPARATOR = '.'

export function isRenderablePost(post: Post | null | undefined): post is Post {
  return Boolean(post?.id && post.type === 'text' && post.content)
}

/** Split a composite post id back into its channel and numeric message id. */
export function splitCompositeId(id: string): { channel: string, messageId: string } {
  const dot = id.indexOf(COMPOSITE_SEPARATOR)
  if (dot === -1) {
    return { channel: '', messageId: id }
  }
  return { channel: id.slice(0, dot), messageId: id.slice(dot + 1) }
}

async function loadSingleChannel(
  params: GetChannelInfoParams & { id?: string } = {},
): Promise<ChannelInfo> {
  const { $, channel, telegramHost, staticProxy, reactionsEnabled }
    = await loadChannelDocument(params)
  const postNodes = $('.tgme_channel_history .tgme_widget_message_wrap').toArray()
  const avatar = $('.tgme_page_photo_image img').attr('src')
  const posts = (await Promise.all(
    postNodes.map((item, index) => extractPost($, item, { channel, telegramHost, staticProxy, index, reactionsEnabled })),
  ))
    .reverse()
    .filter(isRenderablePost)

  const channelInfo: ChannelInfo = {
    posts,
    title: $('.tgme_channel_info_header_title').text(),
    description: $('.tgme_channel_info_description').text(),
    descriptionHTML: (await modifyHTMLContent($, $('.tgme_channel_info_description'), { telegramHost, staticProxy })).html(),
    avatar: avatar ? normalizeUrlAttribute(avatar) : avatar,
  }

  return channelInfo
}

export async function getChannelPost(id: string): Promise<Post | null> {
  const { channel, messageId } = splitCompositeId(id)
  const { $, channel: resolvedChannel, telegramHost, staticProxy, reactionsEnabled }
    = await loadChannelDocument({ channel: channel || getPrimaryChannel(import.meta.env), id: messageId })
  const post = await extractPost($, null, { channel: resolvedChannel, telegramHost, staticProxy, reactionsEnabled })

  return isRenderablePost(post) ? post : null
}

/**
 * Load a single post together with its reading context for the detail page:
 * the immediate previous (older) and next (newer) posts, plus tag-based related
 * posts. This intentionally fetches fresh (never the cached aggregate feed) so
 * the detail view always reflects the latest parsing — link restoration, ad
 * filtering, etc. — and so navigation works even for posts outside the cached
 * "latest" window.
 *
 * The target post is parsed from its own single-message document, while the
 * `before` / `after` windows (strictly older / newer) supply neighbours. The
 * target itself never appears in those windows, so it must be fetched on its
 * own.
 */
export async function getPostContext(id: string): Promise<{
  post: Post | null
  prev: Post | null
  next: Post | null
  related: Post[]
}> {
  const { channel, messageId } = splitCompositeId(id)
  const resolvedChannel = channel || getPrimaryChannel(import.meta.env)
  if (!resolvedChannel || !messageId || !/^\d+$/.test(messageId)) {
    return { post: null, prev: null, next: null, related: [] }
  }

  // Parallel fetches: the target post's own document + the older/newer windows.
  const [targetDoc, beforeInfo, afterInfo] = await Promise.all([
    loadChannelDocument({ channel: resolvedChannel, id: messageId }).catch(() => null),
    loadSingleChannel({ channel: resolvedChannel, before: messageId }).catch(() => null),
    loadSingleChannel({ channel: resolvedChannel, after: messageId }).catch(() => null),
  ])

  if (!targetDoc) {
    return { post: null, prev: null, next: null, related: [] }
  }

  const post = await extractPost(targetDoc.$, null, {
    channel: targetDoc.channel,
    telegramHost: targetDoc.telegramHost,
    staticProxy: targetDoc.staticProxy,
    reactionsEnabled: targetDoc.reactionsEnabled,
  })
  if (!isRenderablePost(post)) {
    return { post: null, prev: null, next: null, related: [] }
  }

  const beforePosts = beforeInfo?.posts ?? []
  const afterPosts = afterInfo?.posts ?? []
  const all = [...beforePosts, ...afterPosts]

  const toNumeric = (candidate: Post): number => {
    const mid = splitCompositeId(candidate.id).messageId
    return Number(mid) || 0
  }

  // prev = closest OLDER post (largest id strictly below the current one).
  const prev = beforePosts.length
    ? beforePosts.reduce((best, candidate) => (toNumeric(candidate) > toNumeric(best) ? candidate : best))
    : null
  // next = closest NEWER post (smallest id strictly above the current one).
  const next = afterPosts.length
    ? afterPosts.reduce((best, candidate) => (toNumeric(candidate) < toNumeric(best) ? candidate : best))
    : null

  // related = other posts sharing at least one tag, ranked by shared-tag count.
  const tagSet = new Set(post.tags)
  const related = tagSet.size
    ? all
        .filter(item => item.id !== id && item.tags.some(tag => tagSet.has(tag)))
        .map(item => ({ item, score: item.tags.filter(tag => tagSet.has(tag)).length }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map(entry => entry.item)
    : []

  return { post, prev, next, related }
}

/**
 * Load and aggregate posts from every configured channel.
 *
 * - With no `before`/`after` cursor, each channel's latest posts are fetched.
 * - With a cursor map, each channel is fetched independently using its own boundary id,
 *   then all results are merged and sorted by publish time (newest first).
 * - A single failed channel never breaks the whole feed; it is skipped with a warning.
 */
export async function getChannelInfo(params: AggregatedChannelInfoParams = {}): Promise<ChannelInfo> {
  const { before = {}, after = {}, q = '' } = params
  const channels = getChannelList(import.meta.env)

  if (channels.length === 0) {
    // No channels configured — return an empty feed instead of throwing, so a
    // misconfiguration shows a blank site rather than a 500.
    const siteTitle = getEnv(import.meta.env, 'SITE_TITLE') || ''
    return { posts: [], title: siteTitle, description: '', descriptionHTML: null, avatar: undefined }
  }

  const results = await Promise.all(
    channels.map(async (channel) => {
      try {
        return await loadSingleChannel({ channel, before: before[channel], after: after[channel], q })
      }
      catch (error) {
        if (import.meta.env.DEV) {
          console.warn(`BroadcastChannel: failed to load @${channel}`, error)
        }
        return null
      }
    }),
  )

  const loaded = results.filter((channel): channel is ChannelInfo => channel !== null)
  const aggregated = loaded
    .flatMap(channel => channel.posts)
    .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())

  // Block adult / gambling / drug / gray-black financial content (net-disk sharing allowed).
  // Disabled by setting CONTENT_FILTER=false.
  const contentFilteringEnabled = getBooleanEnv(import.meta.env, 'CONTENT_FILTER') !== false
  const posts = contentFilteringEnabled
    ? aggregated.filter(post => !isBlockedContent(`${post.title}\n${post.text}`, import.meta.env))
    : aggregated

  const primary = loaded[0]
  const siteTitle = getEnv(import.meta.env, 'SITE_TITLE')
  const siteDescription = getEnv(import.meta.env, 'SITE_DESCRIPTION')

  const channelInfo: ChannelInfo = {
    posts,
    title: siteTitle || primary?.title || '',
    description: siteDescription || primary?.description || '',
    descriptionHTML: siteDescription ? null : (primary?.descriptionHTML ?? null),
    avatar: primary?.avatar,
  }

  return channelInfo
}

/**
 * Cursor helpers for aggregated pagination.
 *
 * Telegram's `before`/`after` cursors are per-channel message ids, so an aggregated
 * feed needs one cursor per channel. We encode the per-channel boundary map into a
 * single URL-safe token.
 */
export function encodeCursorMap(map: ChannelCursorMap): string {
  if (!map || Object.keys(map).length === 0) {
    return ''
  }

  const json = JSON.stringify(map)
  const b64 = btoa(unescape(encodeURIComponent(json)))
  // URL-safe base64 so the token is safe inside a single path segment.
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeCursorMap(cursor?: string): ChannelCursorMap {
  if (!cursor) {
    return {}
  }

  try {
    const b64 = cursor.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const json = decodeURIComponent(escape(atob(b64 + pad)))
    const parsed = JSON.parse(json)
    if (parsed && typeof parsed === 'object') {
      const result: ChannelCursorMap = {}
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof key === 'string' && (typeof value === 'string' || typeof value === 'number')) {
          result[key] = String(value)
        }
      }
      return result
    }
  }
  catch {
    // Ignore malformed cursors and fall back to an empty map (latest posts).
  }

  return {}
}

/**
 * Build a per-channel boundary cursor from the currently displayed posts.
 * - `before` (older): the smallest message id seen per channel.
 * - `after` (newer): the largest message id seen per channel.
 * Returns null when there are no posts.
 */
export function buildChannelCursor(posts: Post[], mode: 'before' | 'after'): ChannelCursorMap | null {
  if (!posts.length) {
    return null
  }

  const byChannel = new Map<string, number[]>()
  for (const post of posts) {
    const { channel, messageId } = splitCompositeId(post.id)
    const numId = Number(messageId)
    if (!channel || !Number.isFinite(numId)) {
      continue
    }
    const ids = byChannel.get(channel) ?? []
    ids.push(numId)
    byChannel.set(channel, ids)
  }

  if (byChannel.size === 0) {
    return null
  }

  const cursor: ChannelCursorMap = {}
  for (const [channel, ids] of byChannel) {
    cursor[channel] = String(mode === 'before' ? Math.min(...ids) : Math.max(...ids))
  }

  return cursor
}

/**
 * Cached variant of {@link getChannelInfo}.
 *
 * Only the "latest" feed (no before/after cursor) is cached — cursor pagination is
 * infrequent and caching it would multiply KV writes past the free-tier daily limit.
 * When a cursor is present, this forwards straight to getChannelInfo().
 *
 * The cache sits behind Cloudflare KV when the `FEED_CACHE` binding is configured,
 * and falls back to an in-memory store otherwise. On upstream failure it serves a
 * slightly stale value (stale-while-error) so the site stays up.
 */
export async function getChannelInfoCached(
  params: AggregatedChannelInfoParams = {},
  kv?: KVNamespaceLike,
): Promise<ChannelInfo> {
  const hasCursor = (params.before && Object.keys(params.before).length > 0)
    || (params.after && Object.keys(params.after).length > 0)
  if (hasCursor) {
    return getChannelInfo(params)
  }

  const channels = getChannelList(import.meta.env)
  const key = `feed:v2:${channels.join(',')}:${params.q ?? ''}`
  const ttl = getFeedCacheTtl(import.meta.env)
  return withFeedCache(key, ttl, kv, () => getChannelInfo(params))
}
