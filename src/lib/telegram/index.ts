import type { AggregatedChannelInfoParams, ChannelCursorMap, ChannelInfo, GetChannelInfoParams, Post } from '../../types'
import { getChannelList, getEnv, getPrimaryChannel } from '../env'
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
    throw new Error('Missing required env: CHANNEL or CHANNELS')
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
  const posts = loaded
    .flatMap(channel => channel.posts)
    .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())

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
  // Channel names and message ids are ASCII; encode defensively for any non-ASCII.
  return btoa(unescape(encodeURIComponent(json)))
}

export function decodeCursorMap(cursor?: string): ChannelCursorMap {
  if (!cursor) {
    return {}
  }

  try {
    const json = decodeURIComponent(escape(atob(cursor)))
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
