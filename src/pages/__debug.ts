import type { APIRoute } from 'astro'
import process from 'node:process'
import { getChannelList } from '../lib/env'
import { getChannelInfo } from '../lib/telegram'

export const GET: APIRoute = async (Astro) => {
  const locals = Astro.locals as { runtime?: { env?: Record<string, unknown> } }
  const runtimeEnv = locals.runtime?.env as Record<string, unknown> | undefined

  const out: Record<string, unknown> = {
    processEnvChannels: process.env.CHANNELS ?? null,
    importMetaChannels: (import.meta.env as Record<string, unknown>).CHANNELS ?? null,
    runtimeExists: !!locals.runtime,
    runtimeEnvKeys: runtimeEnv ? Object.keys(runtimeEnv) : [],
    runtimeEnvChannels: (runtimeEnv?.CHANNELS as string | undefined) ?? null,
    channelListViaMeta: getChannelList(import.meta.env as Record<string, string | undefined>),
    channelListViaProcess: getChannelList(process.env as Record<string, string | undefined>),
  }

  try {
    const info = await getChannelInfo()
    out.posts = info.posts.length
    out.title = info.title
  }
  catch (e) {
    const err = e as { message?: string, stack?: string }
    out.error = err?.message ?? String(e)
    out.stack = (err?.stack ?? '').split('\n').slice(0, 6)
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
