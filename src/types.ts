export interface Reaction {
  emoji: string
  emojiId?: string
  emojiImage?: string
  count: string
  isPaid: boolean
}

export interface Post {
  /** Composite identifier `${channel}.${messageId}`, unique across aggregated channels. */
  id: string
  /** Source Telegram channel username (the string after `t.me/`). */
  channel: string
  title: string
  type: 'text' | 'service'
  datetime: string
  tags: string[]
  text: string
  description?: string
  content: string
  reactions: Reaction[]
}

export interface ChannelInfo {
  posts: Post[]
  title: string
  description: string
  descriptionHTML: string | null
  avatar: string | undefined
}

export interface SeoMeta {
  title?: string
  text?: string
  noindex?: string | boolean
  nofollow?: string | boolean
  /** ISO datetime used for the article:published_time / article:modified_time OG tags. */
  publishedTime?: string
  /** Absolute or protocol-relative image URL used as the OG / Twitter share card. */
  image?: string
}

/** Parameters accepted by loadChannelDocument / getChannelInfo (single channel). */
export interface GetChannelInfoParams {
  channel?: string
  before?: string
  after?: string
  q?: string
}

/**
 * Per-channel pagination boundary map used for aggregated feeds.
 * Key = channel username, value = the Telegram message id cursor for that channel.
 */
export type ChannelCursorMap = Record<string, string>

/** Parameters accepted by the aggregated getChannelInfo. */
export interface AggregatedChannelInfoParams {
  before?: ChannelCursorMap
  after?: ChannelCursorMap
  q?: string
}

export interface NavItem {
  title: string
  href: string
}
