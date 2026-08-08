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

  it('declares the full WordPress namespace set (including media)', () => {
    expect(xml).toContain('xmlns:content="http://purl.org/rss/1.0/modules/content/"')
    expect(xml).toContain('xmlns:wfw="http://wellformedweb.org/CommentAPI/"')
    expect(xml).toContain('xmlns:dc="http://purl.org/dc/elements/1.1/"')
    expect(xml).toContain('xmlns:atom="http://www.w3.org/2005/Atom"')
    expect(xml).toContain('xmlns:sy="http://purl.org/rss/1.0/modules/syndication/"')
    expect(xml).toContain('xmlns:slash="http://purl.org/rss/1.0/modules/slash/"')
    expect(xml).toContain('xmlns:media="http://search.yahoo.com/mrss/"')
  })

  it('emits WordPress-style channel metadata with ttl', () => {
    expect(xml).toContain('<atom:link href="https://123yunpan.lixuehanwork.workers.dev/rss.xml" rel="self" type="application/rss+xml" />')
    expect(xml).toContain('<language>zh-CN</language>')
    expect(xml).toContain('<sy:updatePeriod>hourly</sy:updatePeriod>')
    expect(xml).toContain('<sy:updateFrequency>1</sy:updateFrequency>')
    expect(xml).toContain('<ttl>60</ttl>')
    expect(xml).toContain('<generator>BroadcastChannel (Astro)</generator>')
    expect(xml).toContain('<image>')
    expect(xml).toContain('<lastBuildDate>')
  })

  it('uses site brand name as dc:creator (not per-post channel username)', () => {
    // Brand name is "123云盘资源分享", NOT "xx123pan6025"
    expect(xml).toContain('<dc:creator>123云盘资源分享</dc:creator>')
    expect(xml).not.toContain('<dc:creator>xx123pan6025</dc:creator>')
  })

  it('per-item carries category, guid, description, content:encoded, comments', () => {
    expect(xml).toContain('<category><![CDATA[动画]]></category>')
    expect(xml).toContain('<category><![CDATA[动作冒险]]></category>')
    expect(xml).toContain('<guid isPermaLink="true">https://123yunpan.lixuehanwork.workers.dev/posts/xx123pan6025.12518</guid>')
    expect(xml).toContain('<description>')
    expect(xml).toContain('<content:encoded>')
    // <comments> points to the post URL
    expect(xml).toContain('<comments>https://123yunpan.lixuehanwork.workers.dev/posts/xx123pan6025.12518</comments>')
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

  it('emits <source> pointing to original Telegram channel', () => {
    // Post from xx123pan6025 → source url should be t.me/xx123pan6025
    expect(xml).toContain('<source url="https://t.me/xx123pan6025">123云盘资源分享</source>')
  })

  it('emits <media:thumbnail> and <enclosure> for posts with images', () => {
    const postWithImage = makePost({
      content: '<p><img src="https://cdn.example.com/poster.jpg" alt="封面"></p><p>正文</p>',
    })
    const xmlImg = buildWordPressRss(makeFeed([postWithImage]))
    expect(xmlImg).toContain('<media:thumbnail url="https://cdn.example.com/poster.jpg" />')
    expect(xmlImg).toContain('<enclosure url="https://cdn.example.com/poster.jpg" type="image/jpeg" length="0" />')
  })

  it('omits media:thumbnail and enclosure when post has no image', () => {
    // Default makePost has no <img>
    expect(xml).not.toContain('<media:thumbnail')
    expect(xml).not.toContain('<enclosure')
  })

  it('skips <source> when post.channel is empty', () => {
    const orphanPost = makePost({ channel: '' })
    const xmlOrphan = buildWordPressRss(makeFeed([orphanPost]))
    expect(xmlOrphan).not.toContain('<source')
  })
})

describe('buildWordPressRss pagination', () => {
  const manyPosts = Array.from({ length: 5 }, (_, i) =>
    makePost({ id: `xx123pan6025.${1000 + i}`, title: `标题 ${i}` }))
  const feed = makeFeed(manyPosts)

  it('omits prev/next and emits all items when pagination is absent', () => {
    const xml = buildWordPressRss(feed)
    expect((xml.match(/<item>/g) ?? []).length).toBe(5)
    expect(xml).not.toContain('rel="next"')
    expect(xml).not.toContain('rel="prev"')
    expect(xml).toContain(
      '<atom:link href="https://123yunpan.lixuehanwork.workers.dev/rss.xml" rel="self"',
    )
  })

  it('page 1: self has no page param, next points to page 2, no prev', () => {
    const xml = buildWordPressRss(feed, {
      page: 1,
      pageSize: 2,
      totalPages: 3,
      selfUrl: 'https://123yunpan.lixuehanwork.workers.dev/rss.xml',
      nextUrl: 'https://123yunpan.lixuehanwork.workers.dev/rss.xml?page=2',
    })
    expect(xml).toContain('rel="self"')
    expect(xml).toContain('href="https://123yunpan.lixuehanwork.workers.dev/rss.xml"')
    expect(xml).toContain('rel="next"')
    expect(xml).toContain('href="https://123yunpan.lixuehanwork.workers.dev/rss.xml?page=2"')
    expect(xml).not.toContain('rel="prev"')
    expect((xml.match(/<item>/g) ?? []).length).toBe(2)
  })

  it('middle page: emits both prev and next', () => {
    const xml = buildWordPressRss(feed, {
      page: 2,
      pageSize: 2,
      totalPages: 3,
      selfUrl: 'https://123yunpan.lixuehanwork.workers.dev/rss.xml?page=2',
      prevUrl: 'https://123yunpan.lixuehanwork.workers.dev/rss.xml',
      nextUrl: 'https://123yunpan.lixuehanwork.workers.dev/rss.xml?page=3',
    })
    expect(xml).toContain('rel="prev"')
    expect(xml).toContain('href="https://123yunpan.lixuehanwork.workers.dev/rss.xml"')
    expect(xml).toContain('rel="next"')
    expect(xml).toContain('href="https://123yunpan.lixuehanwork.workers.dev/rss.xml?page=3"')
    expect((xml.match(/<item>/g) ?? []).length).toBe(2)
  })

  it('last page: emits prev, omits next, and carries the remainder', () => {
    const xml = buildWordPressRss(feed, {
      page: 3,
      pageSize: 2,
      totalPages: 3,
      selfUrl: 'https://123yunpan.lixuehanwork.workers.dev/rss.xml?page=3',
      prevUrl: 'https://123yunpan.lixuehanwork.workers.dev/rss.xml?page=2',
    })
    expect(xml).toContain('rel="prev"')
    expect(xml).not.toContain('rel="next"')
    // 5 posts, page size 2 → last page has the leftover 1 item
    expect((xml.match(/<item>/g) ?? []).length).toBe(1)
  })

  it('slices the correct window per page', () => {
    const page2 = buildWordPressRss(feed, {
      page: 2,
      pageSize: 2,
      totalPages: 3,
      selfUrl: 'x',
      nextUrl: 'y',
    })
    // page 2 → slice [2, 4) → titles 2 and 3
    expect(page2).toContain('标题 2')
    expect(page2).toContain('标题 3')
    expect(page2).not.toContain('标题 0')
    expect(page2).not.toContain('标题 4')
  })
})
