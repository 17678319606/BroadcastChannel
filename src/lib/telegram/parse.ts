import type { AnyNode, CheerioAPI } from 'cheerio'
import type { Post, Reaction } from '../../types'
import type { ExtractPostOptions, MessageSelection } from './types'
import { cleanBodyContent, modifyHTMLContent } from './content'
import { getCustomEmojiImage, normalizeEmoji } from './emoji'
import { renderRawContent } from './renderers/raw'
import { normalizeUrlAttributes } from './url'

const TITLE_PREVIEW_REGEX = /^.*?(?=[。\n]|http\S)/g

function isNonEmptyString(value: string | null | undefined): value is string {
  return Boolean(value)
}

function rewriteTagLinksAndCollectTags($: CheerioAPI, content: MessageSelection): string[] {
  const tags: string[] = []

  for (const tagNode of content.find('a[href^="?q="]').toArray()) {
    const tagLink = $(tagNode)
    const tagText = tagLink.text()

    tagLink.attr('href', `/search/result?q=${encodeURIComponent(tagText)}`)

    const normalizedTag = tagText.replace('#', '')
    if (normalizedTag) {
      tags.push(normalizedTag)
    }
  }

  return tags
}

function renderPostContent(
  $: CheerioAPI,
  message: MessageSelection,
  content: MessageSelection,
  options: {
    channel: string
    staticProxy: string
    index: number
    id: string
    title: string
  },
  fallbackPreviewUrl?: string,
): string {
  const { staticProxy } = options

  // Note: media + Telegram jump-link stripping and the optional title/body split
  // are performed in extractPost() before this function is called, so the body
  // passed here is already the clean reading text.
  const parts = [
    content.html(),
    ...renderRawContent($, message, { staticProxy }),
  ].filter(isNonEmptyString)

  // If Telegram attached a link-preview card with a real destination URL but
  // the cleaned body text contains no clickable external link (common when the
  // sender wrote plain text like "分享：123" / "链接：网盘"), inject a subtle
  // "阅读原文" link so visitors can still reach the target.
  if (fallbackPreviewUrl && /^https?:\/\//i.test(fallbackPreviewUrl)) {
    const bodyHtml = parts.join('')
    const hasExternalLink = /<a\s[^>]*href=["']?https?:\/\/[^"'>\s]+['"]?/.test(bodyHtml)
    if (!hasExternalLink) {
      const safeUrl = fallbackPreviewUrl.replace(/"/g, '&quot;')
      parts.push(`<p class="post-source-link"><a href="${safeUrl}" target="_blank" rel="noopener">阅读原文 →</a></p>`)
    }
  }

  return parts.join('')
}

function getReactions($: CheerioAPI, message: MessageSelection, telegramHost: string, staticProxy: string): Reaction[] {
  const reactions: Reaction[] = []

  for (const reactionNode of message.find('.tgme_widget_message_reactions .tgme_reaction').toArray()) {
    const reaction = $(reactionNode)
    const isPaid = reaction.hasClass('tgme_reaction_paid')
    let emoji = ''
    let emojiId: string | undefined
    let emojiImage: string | undefined

    const standardEmoji = reaction.find('.emoji b')
    if (standardEmoji.length) {
      emoji = normalizeEmoji(standardEmoji.text().trim())
    }

    const tgEmoji = reaction.find('tg-emoji')
    if (tgEmoji.length && !emoji) {
      emojiId = tgEmoji.attr('emoji-id')
      const customEmojiImage = getCustomEmojiImage(emojiId, { telegramHost, staticProxy })
      if (customEmojiImage) {
        emojiImage = customEmojiImage
      }
    }

    if (isPaid && !emoji && !emojiImage) {
      emoji = '\u2B50'
    }

    const clone = reaction.clone()
    clone.find('.emoji, tg-emoji, i').remove()
    const count = clone.text().trim()

    if (count) {
      reactions.push({
        emoji,
        emojiId,
        emojiImage,
        count,
        isPaid,
      })
    }
  }

  return reactions
}

export async function extractPost($: CheerioAPI, item: AnyNode | null, options: ExtractPostOptions): Promise<Post> {
  const { channel, telegramHost, staticProxy, index = 0, reactionsEnabled } = options
  const message = item ? $(item).find('.tgme_widget_message') : $('.tgme_widget_message')
  normalizeUrlAttributes($, message)
  const hasReplyText = message.find('.js-message_reply_text').length > 0
  const content = await modifyHTMLContent(
    $,
    message.find(hasReplyText ? '.tgme_widget_message_text.js-message_text' : '.tgme_widget_message_text'),
    { index, telegramHost, staticProxy, normalizeUrls: false },
  )
  const contentText = content.text()
  const title = contentText.trim().match(TITLE_PREVIEW_REGEX)?.[0] ?? contentText.trim()
  const id = message.attr('data-post')?.replace(new RegExp(`${channel}/`, 'i'), '') ?? ''
  // A short, whitespace-collapsed excerpt for meta/OG descriptions and JSON-LD.
  // Strips a leading title occurrence so the description doesn't duplicate the
  // <title>, then truncates to a search-engine-friendly length.
  let descriptionSource = contentText
  if (title && descriptionSource.startsWith(title)) {
    descriptionSource = descriptionSource.slice(title.length)
  }
  const description = descriptionSource.replace(/\s+/g, ' ').replace(/^[，。、,.!?；;：:—\s]+/, '').trim().slice(0, 160)
  const tags = rewriteTagLinksAndCollectTags($, content)

  // Extract the real external URL from Telegram's link-preview card
  // (.tgme_widget_message_link_preview).  This is often the actual destination
  // when the body text contains a t.me/tg:// internal link that would
  // otherwise be unwrapped into plain "分享：123" style text.
  const previewLink = message.find('.tgme_widget_message_link_preview')
  const fallbackPreviewUrl = previewLink.attr('href') ?? undefined

  // Strip media + Telegram jump-links so readers see only clean body text.
  cleanBodyContent($, content, fallbackPreviewUrl)

  // If the very first paragraph is an exact standalone title (a heading-style
  // first line), lift it out of the body so the UI can render it as a clickable
  // heading without duplicating it. We only do this on an exact match so that
  // ordinary body text — including any links it contains — is never truncated.
  let titleSplit = false
  const firstChild = content.children().first()
  const firstNode = firstChild[0] as { name?: string, tagName?: string } | undefined
  const firstName = firstNode?.name ?? firstNode?.tagName
  if (firstChild.length && firstName === 'p') {
    const firstText = firstChild.text().trim()
    if (firstText && firstText === title) {
      firstChild.remove()
      titleSplit = true
    }
  }

  const contentHtml = renderPostContent($, message, content, { channel, staticProxy, index, id, title }, fallbackPreviewUrl)

  // Composite id keeps posts unique across aggregated channels: `${channel}.${id}`.
  const compositeId = id ? `${channel}.${id}` : ''

  return {
    id: compositeId,
    channel,
    title,
    type: message.attr('class')?.includes('service_message') ? 'service' : 'text',
    datetime: message.find('.tgme_widget_message_date time').attr('datetime') ?? '',
    tags,
    text: contentText,
    description,
    content: contentHtml,
    reactions: reactionsEnabled ? getReactions($, message, telegramHost, staticProxy) : [],
    titleSplit,
  }
}
