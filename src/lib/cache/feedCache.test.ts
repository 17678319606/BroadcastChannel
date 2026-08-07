import type { KVNamespaceLike } from '../cloudflare'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { withFeedCache } from './feedCache'

function fakeKV(initial?: unknown) {
  const store: Record<string, unknown> = {}
  const calls = { get: 0, put: 0 }
  const kv: KVNamespaceLike & { calls: typeof calls } = {
    calls,
    async get(_key: string) {
      calls.get++
      return initial ?? store[_key]
    },
    async put(key: string, value: string) {
      calls.put++
      store[key] = JSON.parse(value)
    },
  }
  return kv
}

describe('withFeedCache', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('computes once and serves the memory cache on repeat calls', async () => {
    const compute = vi.fn(async () => 'value')
    const first = await withFeedCache('mem-test', 300, undefined, compute)
    const second = await withFeedCache('mem-test', 300, undefined, compute)

    expect(first).toBe('value')
    expect(second).toBe('value')
    expect(compute).toHaveBeenCalledTimes(1)
  })

  it('reads from a bound KV namespace without recomputing', async () => {
    const kv = fakeKV({ cachedAt: Date.now(), ttlMs: 999_999, value: 'cached' })
    const compute = vi.fn(async () => 'fresh')

    const result = await withFeedCache('kv-hit', 300, kv, compute)

    expect(result).toBe('cached')
    expect(compute).not.toHaveBeenCalled()
    expect(kv.calls.put).toBe(0)
  })

  it('computes and writes to KV on a miss', async () => {
    const kv = fakeKV()
    const compute = vi.fn(async () => 'fresh')

    const result = await withFeedCache('kv-miss', 300, kv, compute)

    expect(result).toBe('fresh')
    expect(compute).toHaveBeenCalledTimes(1)
    expect(kv.calls.put).toBe(1)
  })

  it('serves a stale value when upstream fails (stale-while-error)', async () => {
    const kv = fakeKV({ cachedAt: Date.now() - 100_000, ttlMs: 5_000, value: 'stale' })
    const compute = vi.fn(async () => {
      throw new Error('upstream down')
    })

    const result = await withFeedCache('kv-stale', 300, kv, compute)

    expect(result).toBe('stale')
  })

  it('rethrows when there is no cached value and upstream fails', async () => {
    const kv = fakeKV()
    const compute = vi.fn(async () => {
      throw new Error('upstream down')
    })

    await expect(withFeedCache('kv-rethrow', 300, kv, compute)).rejects.toThrow('upstream down')
  })
})
