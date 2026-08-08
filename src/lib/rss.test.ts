import type { ChannelInfo, FeedData, Post } from '../types'
import { describe, expect, it } from 'vitest'
import { buildWordPressRss } from './rss'

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'xx123pan6025.12518',
    channel: 'xx123pan6025',
    title: '测试标题 & <特殊字符>',
    type: 'text',
    datetime: '2026-08-08T04:02:01.000Z',
    tags: ['动画', '动作冒险'],
    text: '这是正文摘要内容，用于 RSS description 的纯文本截断测试，长度需要超过一定数量以便验证截断逻辑是否生效。',
    content: '<p>全文内容 <a href="https://example.com">链接</a></p><p>第二段</p>',
    reactions: [],
    ...overrides,
  }
}

function makeFeed(posts: Post[]): FeedData {
  const channel: ChannelInfo = {
    posts,
    title: '123云盘资源分享',
    description: '123云盘资源分享 ',
    descriptionHTML: null,
    avatar: 'https://cdn-telegram.org/avatar.png',
  }
  return {
    channel,
    posts,
    siteUrl: new URL('https://123yunpan.lixuehanwork.workers.dev'),
    title: '123云盘资源分享',
  }
}

describe('buildWordPressRss', () => {
  const xml = buildWordPressRss(makeFeed([makePost()]))

  it('declares the full WordPress namespace set', () => {
    expect(xml).toContain('xmlns:content="http://purl.org/rss/1.0/modules/content/"')
    expect(xml).toContain('xmlns:wfw="http://wellformedweb.org/CommentAPI/"')
    expect(xml).toContain('xmlns:dc="http://purl.org/dc/elements/1.1/"')
    expect(xml).toContain('xmlns:atom="http://www.w3.org/2005/Atom"')
    expect(xml).toContain('xmlns:sy="http://purl.org/rss/1.0/modules/syndication/"')
    expect(xml).toContain('xmlns:slash="http://purl.org/rss/1.0/modules/slash/"')
  })

  it('emits WordPress-style channel metadata', () => {
    expect(xml).toContain('<atom:link href="https://123yunpan.lixuehanwork.workers.dev/rss.xml" rel="self" type="application/rss+xml" />')
    expect(xml).toContain('<language>zh-CN</language>')
    expect(xml).toContain('<sy:updatePeriod>hourly</sy:updatePeriod>')
    expect(xml).toContain('<sy:updateFrequency>1</sy:updateFrequency>')
    expect(xml).toContain('<generator>BroadcastChannel (Astro)</generator>')
    expect(xml).toContain('<image>')
    expect(xml).toContain('<lastBuildDate>')
  })

  it('per-item carries dc:creator, category, guid, description and content:encoded', () => {
    expect(xml).toContain('<dc:creator>xx123pan6025</dc:creator>')
    expect(xml).toContain('<category><![CDATA[动画]]></category>')
    expect(xml).toContain('<category><![CDATA[动作冒险]]></category>')
    expect(xml).toContain('<guid isPermaLink="true">https://123yunpan.lixuehanwork.workers.dev/posts/xx123pan6025.12518</guid>')
    expect(xml).toContain('<description>')
    expect(xml).toContain('<content:encoded>')
  })

  it('outputs full-text content (not truncated) inside CDATA', () => {
    expect(xml).toContain('<content:encoded><![CDATA[<p>全文内容')
    expect(xml).toContain('https://example.com')
    expect(xml).toContain('第二段')
  })

  it('escapes special characters in text-only fields', () => {
    expect(xml).toContain('测试标题 &amp; &lt;特殊字符&gt;')
  })

  it('formats pubDate as RFC-822 with +0000', () => {
    const match = xml.match(/<pubDate>([^<]+)<\/pubDate>/)
    expect(match).not.toBeNull()
    // Sat, 08 Aug 2026 04:02:01 +0000
    expect(match![1]).toMatch(/^\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} \+0000$/)
  })

  it('renders one <item> per valid post and strips HTML from description', () => {
    const itemCount = (xml.match(/<item>/g) ?? []).length
    expect(itemCount).toBe(1)
    const descMatch = xml.match(/<description>([^<]*)<\/description>/)
    expect(descMatch).not.toBeNull()
    expect(descMatch![1]).not.toContain('<')
  })

  it('skips posts missing id or datetime', () => {
    const feed = makeFeed([makePost(), makePost({ id: '', datetime: '' })])
    const out = buildWordPressRss(feed)
    expect((out.match(/<item>/g) ?? []).length).toBe(1)
  })

  it('omits <image> when avatar is absent', () => {
    const channelNoAvatar: ChannelInfo = { ...makeFeed([]).channel, avatar: undefined }
    const feed: FeedData = { ...makeFeed([]), channel: channelNoAvatar }
    expect(buildWordPressRss(feed)).not.toContain('<image>')
  })
})
