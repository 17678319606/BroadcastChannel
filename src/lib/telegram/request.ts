import type { GetChannelInfoParams } from '../../types'
import type { LoadedChannelDocument } from './types'
import * as cheerio from 'cheerio'
import { defineCachedFunction } from 'ocache'
import { $fetch } from 'ofetch'
import { getBooleanEnv, getPrimaryChannel, getStaticProxy, getTelegramHost } from '../env'

interface TelegramHtmlParams {
  host: string
  channel: string
  id?: string
  before?: string
  after?: string
  q?: string
  headers: Record<string, string>
}

export function getTelegramRequestHeaders(): Record<string, string> {
  return {
    'accept': 'text/html,application/xhtml+xml',
    'user-agent': 'BroadcastChannel/0.2.0',
  }
}

async function fetchTelegramHtml({ host, channel, id, before, after, q, headers }: TelegramHtmlParams): Promise<string> {
  const requestUrl = id
    ? `https://${host}/${channel}/${id}?embed=1&mode=tme`
    : `https://${host}/s/${channel}`

  return await $fetch<string, 'text'>(requestUrl, {
    headers,
    query: {
      before: before || undefined,
      after: after || undefined,
      q: q || undefined,
    },
    responseType: 'text',
    timeout: 15000,
    retry: 3,
    retryDelay: 100,
  })
}

// Cloudflare Workers / EdgeOne edge runtimes expose the Cache API (`caches.default`).
// Elsewhere (Node standalone, local dev) we fall back to a process-local in-memory cache
// so the app still works without a KV/Cache binding.
const USE_CACHE_API = typeof caches !== 'undefined'
const MEMORY_TTL_MS = 5 * 60 * 1000
const memoryStore = new Map<string, { value: string, expires: number }>()

async function memoryCachedFetch(params: TelegramHtmlParams): Promise<string> {
  const key = JSON.stringify(params)
  const now = Date.now()
  const hit = memoryStore.get(key)
  if (hit && hit.expires > now) {
    return hit.value
  }
  const value = await fetchTelegramHtml(params)
  memoryStore.set(key, { value, expires: now + MEMORY_TTL_MS })
  return value
}

const loadTelegramHtml = USE_CACHE_API
  ? defineCachedFunction(fetchTelegramHtml, {
      name: 'telegram-html',
      maxAge: 60 * 5,
      // A detached refresh has no Cloudflare waitUntil context and can leave a stuck pending promise.
      swr: false,
      getKey: ({ host, channel, id, before, after, q }) => JSON.stringify({
        host,
        channel,
        id: id || '',
        before: before || '',
        after: after || '',
        q: q || '',
      }),
    })
  : memoryCachedFetch

export async function loadChannelDocument(
  params: GetChannelInfoParams & { id?: string } = {},
): Promise<LoadedChannelDocument> {
  const { before, after, q, id, channel = getPrimaryChannel(import.meta.env) } = params

  if (!channel) {
    throw new Error('Missing required env: CHANNEL or CHANNELS')
  }

  const host = getTelegramHost(import.meta.env)
  const staticProxy = getStaticProxy(import.meta.env)
  const reactionsEnabled = getBooleanEnv(import.meta.env, 'REACTIONS')
  const html = await loadTelegramHtml({
    host,
    channel,
    id,
    before,
    after,
    q,
    headers: getTelegramRequestHeaders(),
  })

  return {
    $: cheerio.load(html, {}, false),
    channel,
    telegramHost: host,
    staticProxy,
    reactionsEnabled,
  }
}
