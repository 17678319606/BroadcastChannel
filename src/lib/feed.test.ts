import type { APIContext } from 'astro'
import type { ChannelInfo, Post } from '../types'
import type { RssPagination } from './feed'
import { describe, expect, it } from 'vitest'
import { buildJsonFeed, resolvePagination } from './feed'

function makeChannel(): ChannelInfo {
  return {
    posts: [],
    title: 'Channel title',
    description: 'Channel description',
    descriptionHTML: null,
    avatar: undefined,
  }
}

function makePosts(count: number): Post[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `chan.${i + 1}`,
    channel: 'chan',
    title: `Post ${i + 1}`,
    type: 'text',
    datetime: '2026-01-02T03:04:05.000Z',
    tags: ['tag'],
    text: `Post text ${i + 1}`,
    description: `Post summary ${i + 1}`,
    content: '<p>Hello</p>',
    reactions: [],
  }))
}

describe('json feed builder', () => {
  it('emits JSON Feed 1.1 metadata and valid item fields', () => {
    const channel: ChannelInfo = makeChannel()
    const posts: Post[] = [{
      id: 'chan.123',
      channel: 'chan',
      title: 'Post title',
      type: 'text',
      datetime: '2026-01-02T03:04:05.000Z',
      tags: ['tag'],
      text: 'Post text',
      description: 'Post summary',
      content: '<p>Hello</p><pre class="code"><code class="language-js"><span class="token keyword">const</span></code></pre><script>alert(1)</script>',
      reactions: [],
    }]

    const feed = buildJsonFeed({
      channel,
      posts,
      siteUrl: new URL('https://example.com/blog/'),
      title: 'Feed title',
    })

    expect(feed).toMatchObject({
      version: 'https://jsonfeed.org/version/1.1',
      title: 'Feed title',
      home_page_url: 'https://example.com/blog/',
      feed_url: 'https://example.com/blog/rss.json',
    })
    expect(feed.items).toHaveLength(1)
    expect(feed.items[0]).toMatchObject({
      id: 'https://example.com/blog/posts/chan.123',
      url: 'https://example.com/blog/posts/chan.123',
      title: 'Post title',
      summary: 'Post summary',
      tags: ['tag'],
      content_html: '<p>Hello</p><pre class="code"><code class="language-js"><span class="token keyword">const</span></code></pre>',
    })
    expect(typeof feed.items[0]?.date_published).toBe('string')
  })

  it('without pagination returns the full feed and no next_url', () => {
    const feed = buildJsonFeed({
      channel: makeChannel(),
      posts: makePosts(5),
      siteUrl: new URL('https://example.com/blog/'),
      title: 'Feed title',
    })

    expect(feed.items).toHaveLength(5)
    expect(feed.next_url).toBeUndefined()
    expect(feed.prev_url).toBeUndefined()
    expect(feed.feed_url).toBe('https://example.com/blog/rss.json')
  })

  it('first page slices to page size and adds next_url (no prev_url)', () => {
    const pagination: RssPagination = {
      page: 1,
      pageSize: 2,
      totalPages: 3,
      selfUrl: 'https://example.com/blog/rss.json',
      nextUrl: 'https://example.com/blog/rss.json?page=2',
    }

    const feed = buildJsonFeed({
      channel: makeChannel(),
      posts: makePosts(6),
      siteUrl: new URL('https://example.com/blog/'),
      title: 'Feed title',
    }, pagination)

    expect(feed.items).toHaveLength(2)
    expect(feed.items[0]?.title).toBe('Post 1')
    expect(feed.items[1]?.title).toBe('Post 2')
    expect(feed.feed_url).toBe('https://example.com/blog/rss.json')
    expect(feed.next_url).toBe('https://example.com/blog/rss.json?page=2')
    expect(feed.prev_url).toBeUndefined()
  })

  it('middle page adds both prev_url and next_url', () => {
    const pagination: RssPagination = {
      page: 2,
      pageSize: 2,
      totalPages: 3,
      selfUrl: 'https://example.com/blog/rss.json?page=2',
      prevUrl: 'https://example.com/blog/rss.json',
      nextUrl: 'https://example.com/blog/rss.json?page=3',
    }

    const feed = buildJsonFeed({
      channel: makeChannel(),
      posts: makePosts(6),
      siteUrl: new URL('https://example.com/blog/'),
      title: 'Feed title',
    }, pagination)

    expect(feed.items).toHaveLength(2)
    expect(feed.items[0]?.title).toBe('Post 3')
    expect(feed.items[1]?.title).toBe('Post 4')
    expect(feed.feed_url).toBe('https://example.com/blog/rss.json?page=2')
    expect(feed.prev_url).toBe('https://example.com/blog/rss.json')
    expect(feed.next_url).toBe('https://example.com/blog/rss.json?page=3')
  })

  it('last page adds prev_url and omits next_url', () => {
    const pagination: RssPagination = {
      page: 3,
      pageSize: 2,
      totalPages: 3,
      selfUrl: 'https://example.com/blog/rss.json?page=3',
      prevUrl: 'https://example.com/blog/rss.json?page=2',
    }

    const feed = buildJsonFeed({
      channel: makeChannel(),
      posts: makePosts(6),
      siteUrl: new URL('https://example.com/blog/'),
      title: 'Feed title',
    }, pagination)

    expect(feed.items).toHaveLength(2)
    expect(feed.items[0]?.title).toBe('Post 5')
    expect(feed.items[1]?.title).toBe('Post 6')
    expect(feed.prev_url).toBe('https://example.com/blog/rss.json?page=2')
    expect(feed.next_url).toBeUndefined()
  })

  it('skips posts without id or datetime when paginating', () => {
    const posts = makePosts(4)
    // Mark two posts as invalid — they should be excluded from the slice math.
    posts[1]!.datetime = ''
    posts[3]!.id = ''

    const pagination: RssPagination = {
      page: 1,
      pageSize: 2,
      totalPages: 1,
      selfUrl: 'https://example.com/blog/rss.json',
    }

    const feed = buildJsonFeed({
      channel: makeChannel(),
      posts,
      siteUrl: new URL('https://example.com/blog/'),
      title: 'Feed title',
    }, pagination)

    expect(feed.items).toHaveLength(2)
    expect(feed.items.map(i => i.title)).toEqual(['Post 1', 'Post 3'])
  })
})

describe('resolvePagination', () => {
  const ctx = (url: string): APIContext => ({ url: new URL(url) }) as APIContext

  it('preserves the tag filter but drops stray params (e.g. cache-busters)', () => {
    const p = resolvePagination(ctx('https://ex.com/rss.json?tag=foo&ts=123&page=2'), 200, 30)

    expect(p.page).toBe(2)
    expect(p.totalPages).toBe(7)
    expect(p.selfUrl).toBe('https://ex.com/rss.json?tag=foo&page=2')
    // page 2 → prev drops the page param entirely.
    expect(p.prevUrl).toBe('https://ex.com/rss.json?tag=foo')
    expect(p.nextUrl).toBe('https://ex.com/rss.json?tag=foo&page=3')
  })

  it('falls back to page 1 for non-numeric / missing page param', () => {
    const p = resolvePagination(ctx('https://ex.com/rss.json?tag=bar&page=abc'), 50, 30)

    expect(p.page).toBe(1)
    expect(p.totalPages).toBe(2)
    expect(p.selfUrl).toBe('https://ex.com/rss.json?tag=bar')
    expect(p.nextUrl).toBe('https://ex.com/rss.json?tag=bar&page=2')
    expect(p.prevUrl).toBeUndefined()
  })
})
