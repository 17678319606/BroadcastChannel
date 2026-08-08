import type { CheerioAPI } from 'cheerio'
import type { IndexedStaticProxyOptions, MessageSelection, StaticProxyOptions } from './types'
import flourite from 'flourite'
import prism, { ensurePrismLanguage } from '../prism'
import { getCustomEmojiImage } from './emoji'
import { normalizeUrlAttribute, normalizeUrlAttributes, proxyStyleUrls } from './url'

interface ModifyHTMLContentOptions extends IndexedStaticProxyOptions {
  telegramHost?: string
  normalizeUrls?: boolean
}

interface HydrateTgEmojiOptions extends StaticProxyOptions {
  telegramHost?: string
}

async function hydrateTgEmoji($: CheerioAPI, content: MessageSelection, options: HydrateTgEmojiOptions = {}): Promise<void> {
  const { telegramHost, staticProxy = '' } = options

  for (const emojiNode of content.find('tg-emoji').toArray()) {
    const emojiId = $(emojiNode).attr('emoji-id')
    const imageUrl = getCustomEmojiImage(emojiId, { telegramHost, staticProxy })

    if (imageUrl) {
      $(emojiNode).replaceWith(`<img class="tg-emoji" src="${imageUrl}" alt="" loading="lazy" width="20" height="20" />`)
    }
  }
}

export async function modifyHTMLContent($: CheerioAPI, content: MessageSelection, options: ModifyHTMLContentOptions = {}): Promise<MessageSelection> {
  const { index = 0, telegramHost, staticProxy = '', normalizeUrls = true } = options

  await hydrateTgEmoji($, content, { telegramHost, staticProxy })
  if (normalizeUrls) {
    normalizeUrlAttributes($, content)
  }
  proxyStyleUrls($, content, staticProxy)
  content.find('.emoji').removeAttr('style')

  for (const linkNode of content.find('a').toArray()) {
    const link = $(linkNode)
    const href = link.attr('href')

    if (href && normalizeUrls) {
      link.attr('href', normalizeUrlAttribute(href))
    }

    link.attr('title', link.text()).removeAttr('onclick')
  }

  for (const [blockquoteIndex, blockquoteNode] of content.find('blockquote[expandable]').toArray().entries()) {
    const innerHTML = $(blockquoteNode).html() ?? ''
    const expandId = `expand-${index}-${blockquoteIndex}`
    const expandContentId = `${expandId}-content`
    const expandable = `<div class="tg-expandable">
      <input type="checkbox" id="${expandId}" class="tg-expandable__checkbox" aria-label="Toggle hidden content" aria-controls="${expandContentId}">
      <div id="${expandContentId}" class="tg-expandable__content">${innerHTML}</div>
      <label for="${expandId}" class="tg-expandable__toggle"><span class="sr-only">Toggle hidden content</span></label>
    </div>`

    $(blockquoteNode).replaceWith(expandable)
  }

  for (const [spoilerIndex, spoilerNode] of content.find('tg-spoiler').toArray().entries()) {
    const spoiler = $(spoilerNode)
    const spoilerId = `spoiler-${index}-${spoilerIndex}`
    const spoilerInput = `<input type="checkbox" aria-label="Toggle spoiler" aria-controls="${spoilerId}" />`

    spoiler.attr('id', spoilerId).wrap('<label class="spoiler-button"></label>').before(spoilerInput)
  }

  for (const preNode of content.find('pre').toArray()) {
    const pre = $(preNode)
    pre.addClass('code')

    try {
      pre.find('br').replaceWith('\n')

      const code = pre.text()
      const detectedLanguage = flourite(code, { shiki: true, noUnknown: true }).language || 'text'
      const language = await ensurePrismLanguage(detectedLanguage)
      const grammar = prism.languages[language]

      if (!grammar) {
        const fallbackCode = $('<code class="language-text"></code>')
        fallbackCode.text(code)
        pre.empty().append(fallbackCode)
        continue
      }

      const highlightedCode = prism.highlight(code, grammar, language)
      pre.html(`<code class="language-${language}">${highlightedCode}</code>`)
    }
    catch (error) {
      if (import.meta.env.DEV) {
        console.warn('Code highlighting failed', error)
      }
    }
  }

  return content
}

/**
 * Strip media and Telegram jump-links from a post body so the rendered article
 * shows only clean reading text plus ordinary in-body website links.
 *
 * - Removes images / video / audio / stickers / custom-emoji.
 * - Reveals spoilers as plain text.
 * - Keeps internal site hashtag links (/search/result?q=…) for SEO; strips
 *   external-only tag links (?q= without leading /).
 * - For links that jump to Telegram (t.me / tg:// / telegram.org) or carry
 *   unsafe schemes (javascript:, data:, blob:): if the t.me URL contains a
 *   proxied `url=` parameter pointing to a real website, rewrite the href to
 *   that destination; otherwise try to recover using fallbackPreviewUrl; if
 *   that also fails, unwrap keeping only visible text.
 * - Leaves ordinary http(s) website links and internal site links intact.
 *
 * @param $ - Cheerio API instance.
 * @param content - The body content selection to clean.
 * @param fallbackPreviewUrl - Optional real URL extracted from the Telegram
 *   link preview element (.tgme_widget_message_link_preview). Used as a
 *   last-resort fallback when a link would otherwise be unwrapped as plain
 *   text, so "分享：123" / "链接：网盘" style text stays clickable.
 */
export function cleanBodyContent($: CheerioAPI, content: MessageSelection, fallbackPreviewUrl?: string): MessageSelection {
  content
    .find('img, video, audio, source, tg-emoji, .tgme_widget_message_sticker, .tgme_widget_message_tgsticker_wrap, .js-videosticker_video, .tgme_widget_message_roundvideo_wrap')
    .remove()

  // Remove empty wrapper containers left behind after media removal (e.g.
  // .tgme_widget_message_photo_wrap, figure, div) to avoid large blank gaps.
  content
    .find('.tgme_widget_message_photo_wrap, .tgme_widget_message_video_wrap, .tgme_widget_message_roundvideo_wrap, figure')
    .filter((_, el) => $(el).text().trim() === '' && $(el).children().length === 0)
    .remove()

  for (const spoiler of content.find('tg-spoiler').toArray()) {
    $(spoiler).replaceWith($(spoiler).text())
  }

  // Remove hashtag / tag links that point outside the site (e.g. Telegram's
  // original ?q= relative links).  Internal site links (/search/result?q=...) are
  // kept for SEO value — they drive internal search traffic and help crawlers
  // discover tagged content.
  content.find('a[href^="?q="]').each((_, el) => {
    $(el).replaceWith($(el).text())
  })

  for (const linkNode of content.find('a').toArray()) {
    const link = $(linkNode)
    const href = (link.attr('href') ?? '').trim()
    const action = classifyLink(href)
    if (action === 'unwrap') {
      // Last-resort recovery: if we have a real preview URL from the
      // Telegram link-preview card, rewrite the unwrapped link to point at
      // that destination instead of discarding it entirely.  This fixes the
      // common "分享：123" / "链接：网盘" plain-text issue.
      if (fallbackPreviewUrl && /^https?:\/\//i.test(fallbackPreviewUrl)) {
        link.attr('href', fallbackPreviewUrl)
        link.attr('target', '_blank').attr('rel', 'noopener')
      }
      else {
        link.replaceWith(link.text())
      }
    }
    else if (action === 'rewrite') {
      // t.me proxy URL that embeds a real destination — rewrite href.
      try {
        const url = new URL(href, 'https://example.com')
        const realUrl = extractTgProxyDestination(url)
        if (realUrl) {
          link.attr('href', realUrl)
        }
        else if (fallbackPreviewUrl && /^https?:\/\//i.test(fallbackPreviewUrl)) {
          link.attr('href', fallbackPreviewUrl)
          link.attr('target', '_blank').attr('rel', 'noopener')
        }
        else {
          link.replaceWith(link.text())
        }
      }
      catch {
        if (fallbackPreviewUrl && /^https?:\/\//i.test(fallbackPreviewUrl)) {
          link.attr('href', fallbackPreviewUrl)
          link.attr('target', '_blank').attr('rel', 'noopener')
        }
        else {
          link.replaceWith(link.text())
        }
      }
    }
  }

  return content
}

/** Classification for how to handle a link href. */
type LinkAction = 'keep' | 'unwrap' | 'rewrite'

/**
 * Classify a link href and optionally annotate the link element.
 *
 * - 'keep'   : ordinary http(s) link — leave untouched.
 * - 'unwrap' : TG jump-link or unsafe scheme with no recoverable destination —
 *             strip the <a> tag, keep visible text.
 * - 'rewrite': t.me proxy URL that embeds a real destination in its query
 *             string — the caller should replace href with the real URL.
 */
export function classifyLink(href: string): LinkAction {
  if (!href) {
    return 'keep'
  }
  // Unsafe schemes — always unwrap.
  if (/^(?:tg:|javascript:|data:|blob:)/i.test(href)) {
    return 'unwrap'
  }
  try {
    const url = new URL(href, 'https://example.com')
    const hostname = url.hostname.toLowerCase()

    // Direct Telegram domain links (channel messages, user profiles, etc.)
    if (/^(?:t\.me|telegram\.me|telegram\.org)$/.test(hostname)) {
      // Check for t.me proxy pattern: t.me/url?url=<encoded_destination>
      const realUrl = extractTgProxyDestination(url)
      if (realUrl) {
        return 'rewrite'
      }
      return 'unwrap'
    }

    return 'keep'
  }
  catch {
    return 'keep'
  }
}

/**
 * Attempt to extract a real destination URL from a t.me proxy/redirect URL.
 *
 * Handles patterns like:
 * - `https://t.me/url?url=https%3A%2F%2Fexample.com`
 * - `https://t.me/some_channel?url=...`
 *
 * Returns the decoded destination string, or null if none found.
 */
function extractTgProxyDestination(tgUrl: URL): string | null {
  // Try the well-known t.me/url?url= proxy endpoint first.
  const urlParam = tgUrl.searchParams.get('url')
  if (urlParam) {
    try {
      // Validate it looks like a real http(s) URL after decoding.
      const decoded = decodeURIComponent(urlParam)
      if (/^https?:\/\//i.test(decoded)) {
        return decoded
      }
    }
    catch {
      // Malformed encoded URL — ignore.
    }
  }
  return null
}
