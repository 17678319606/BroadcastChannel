import { load } from 'cheerio'
import { describe, expect, it } from 'vitest'
import { extractPost } from './parse'

const TELEGRAM_POST_HTML = `
  <div class="tgme_widget_message_wrap">
    <div class="tgme_widget_message" data-post="ExampleChannel/42">
      <div class="tgme_widget_message_text js-message_text">Release notes。Details for <a href="?q=%23release">#release</a> and <a href="?q=%23astro">#astro</a></div>
      <a class="tgme_widget_message_date"><time datetime="2026-07-14T08:30:00+00:00"></time></a>
      <div class="tgme_widget_message_reactions"><span class="tgme_reaction"><span class="emoji"><b>👍</b></span>7</span></div>
    </div>
  </div>
`

describe('extractPost', () => {
  it('extracts stable Telegram post fields and rewrites tag links', async () => {
    const $ = load(TELEGRAM_POST_HTML)
    const item = $('.tgme_widget_message_wrap').get(0) ?? null

    const post = await extractPost($, item, {
      channel: 'ExampleChannel',
      telegramHost: 'telegram.me',
      staticProxy: '/static/',
      reactionsEnabled: false,
    })

    expect(post.id).toBe('ExampleChannel.42')
    expect(post.channel).toBe('ExampleChannel')
    expect(post.title).toBe('Release notes')
    expect(post.datetime).toBe('2026-07-14T08:30:00+00:00')
    expect(post.tags).toEqual(['release', 'astro'])
    expect(post.text).toBe('Release notes。Details for #release and #astro')
    expect(post.content).toBe('Release notes。Details for <a href="/search/result?q=%23release" title="#release">#release</a> and <a href="/search/result?q=%23astro" title="#astro">#astro</a>')
    expect(post.reactions).toEqual([])
  })

  it('strips media + Telegram jump-links but keeps ordinary website links', async () => {
    const html = `
      <div class="tgme_widget_message_wrap">
        <div class="tgme_widget_message" data-post="ExampleChannel/43">
          <div class="tgme_widget_message_text js-message_text">
            正文内容。详见 <a href="https://example.com/doc">官网说明</a>，
            频道 <a href="https://t.me/otherchan">@otherchan</a> 也有。
            私信 <a href="tg://resolve?domain=bot">打开机器人</a>。
            <img src="https://cdn.t.me/photo.jpg" />
            <video src="https://cdn.t.me/clip.mp4"></video>
          </div>
          <a class="tgme_widget_message_date"><time datetime="2026-07-15T08:30:00+00:00"></time></a>
          <div class="tgme_widget_message_forwarded_from">Forwarded from <a href="https://t.me/origin">@origin</a></div>
        </div>
      </div>
    `
    const $ = load(html)
    const item = $('.tgme_widget_message_wrap').get(0) ?? null

    const post = await extractPost($, item, {
      channel: 'ExampleChannel',
      telegramHost: 'telegram.me',
      staticProxy: '/static/',
      reactionsEnabled: false,
    })

    expect(post.content).not.toContain('<img')
    expect(post.content).not.toContain('<video')
    expect(post.content).not.toContain('t.me')
    expect(post.content).not.toContain('tg://')
    expect(post.content).toContain('href="https://example.com/doc"')
    expect(post.content).toContain('@otherchan')
    expect(post.content).toContain('打开机器人')
    // Forwarded-from ("source") must not leak into the post body.
    expect(post.content).not.toContain('Forwarded from')
  })

  it('lifts a standalone title paragraph into a clickable heading (titleSplit)', async () => {
    const html = `
      <div class="tgme_widget_message_wrap">
        <div class="tgme_widget_message" data-post="ExampleChannel/44">
          <div class="tgme_widget_message_text js-message_text">
            <p>重磅更新来袭</p>
            <p>本次更新包含多项改进，详见 <a href="https://example.com/notes">更新说明</a>。</p>
          </div>
          <a class="tgme_widget_message_date"><time datetime="2026-07-16T08:30:00+00:00"></time></a>
        </div>
      </div>
    `
    const $ = load(html)
    const item = $('.tgme_widget_message_wrap').get(0) ?? null

    const post = await extractPost($, item, {
      channel: 'ExampleChannel',
      telegramHost: 'telegram.me',
      staticProxy: '/static/',
      reactionsEnabled: false,
    })

    expect(post.title).toBe('重磅更新来袭')
    expect(post.titleSplit).toBe(true)
    // The title must NOT be duplicated inside the body.
    expect(post.content).not.toContain('重磅更新来袭')
    // The remaining body (and its ordinary link) must be preserved.
    expect(post.content).toContain('本次更新包含多项改进')
    expect(post.content).toContain('href="https://example.com/notes"')
  })

  it('keeps the full body when there is no standalone title paragraph', async () => {
    const html = `
      <div class="tgme_widget_message_wrap">
        <div class="tgme_widget_message" data-post="ExampleChannel/45">
          <div class="tgme_widget_message_text js-message_text">
            <p>这是一段没有独立标题的普通正文，开头就是内容本身。</p>
          </div>
          <a class="tgme_widget_message_date"><time datetime="2026-07-17T08:30:00+00:00"></time></a>
        </div>
      </div>
    `
    const $ = load(html)
    const item = $('.tgme_widget_message_wrap').get(0) ?? null

    const post = await extractPost($, item, {
      channel: 'ExampleChannel',
      telegramHost: 'telegram.me',
      staticProxy: '/static/',
      reactionsEnabled: false,
    })

    expect(post.titleSplit).toBe(false)
    // No body content is ever lost.
    expect(post.content).toContain('这是一段没有独立标题的普通正文')
  })
})
