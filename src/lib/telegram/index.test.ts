import type { Post } from '../../types'
import { describe, expect, it } from 'vitest'
import { buildChannelCursor, decodeCursorMap, encodeCursorMap, isRenderablePost } from './index'

function createPost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'chan.123',
    channel: 'chan',
    title: 'Title',
    type: 'text',
    datetime: '2026-01-02T03:04:05.000Z',
    tags: [],
    text: 'Text',
    content: '<p>Text</p>',
    reactions: [],
    ...overrides,
  }
}

describe('post renderability', () => {
  it('accepts text posts with an id and content', () => {
    expect(isRenderablePost(createPost())).toBe(true)
  })

  it('rejects posts without an id', () => {
    expect(isRenderablePost(createPost({ id: '' }))).toBe(false)
  })

  it('rejects posts without content', () => {
    expect(isRenderablePost(createPost({ content: '' }))).toBe(false)
  })

  it('rejects service posts', () => {
    expect(isRenderablePost(createPost({ type: 'service' }))).toBe(false)
  })

  it('rejects nullish posts', () => {
    expect(isRenderablePost(null)).toBe(false)
    expect(isRenderablePost(undefined)).toBe(false)
  })
})

function makePost(channel: string, messageId: number): Post {
  return {
    id: `${channel}.${messageId}`,
    channel,
    title: 't',
    type: 'text',
    datetime: '2026-01-02T03:04:05.000Z',
    tags: [],
    text: 'x',
    content: '<p>x</p>',
    reactions: [],
  }
}

describe('aggregated cursor helpers', () => {
  it('round-trips a per-channel cursor map through encode/decode', () => {
    const map = { a: '10', b: '20' }
    expect(decodeCursorMap(encodeCursorMap(map))).toEqual(map)
  })

  it('returns an empty map for an empty or malformed cursor', () => {
    expect(decodeCursorMap('')).toEqual({})
    expect(decodeCursorMap('not-base64!!!')).toEqual({})
  })

  it('builds a before cursor from the oldest id per channel', () => {
    const posts = [makePost('a', 100), makePost('a', 90), makePost('b', 50), makePost('b', 40)]
    expect(buildChannelCursor(posts, 'before')).toEqual({ a: '90', b: '40' })
  })

  it('builds an after cursor from the newest id per channel', () => {
    const posts = [makePost('a', 100), makePost('a', 90), makePost('b', 50), makePost('b', 40)]
    expect(buildChannelCursor(posts, 'after')).toEqual({ a: '100', b: '50' })
  })

  it('returns null when there are no posts', () => {
    expect(buildChannelCursor([], 'before')).toBeNull()
  })
})
