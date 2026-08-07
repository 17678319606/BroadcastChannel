import type { NavItem } from '../types'

type Env = Record<string, string | undefined>

export const DEFAULT_TELEGRAM_HOST = 'telegram.me'

/**
 * Comma / semicolon separated list of channel usernames (the string after `t.me/`).
 * When set, it takes precedence over the legacy single `CHANNEL` variable.
 */
export const CHANNELS_ENV = 'CHANNELS'
const LEGACY_CHANNEL_ENV = 'CHANNEL'

/**
 * Normalize a raw channel value into the bare Telegram username.
 * Accepts `t.me/foo`, `https://t.me/s/foo`, `foo/`, leading/trailing whitespace, etc.
 */
function normalizeChannel(raw: string): string {
  let value = raw.trim()
  value = value.replace(/^https?:\/\//i, '')
  value = value.replace(/^t\.me\//i, '')
  value = value.replace(/^s\//i, '')
  value = value.replace(/\/+$/, '')
  return value.trim()
}

/**
 * Resolve the list of configured channels.
 * `CHANNELS` wins; falls back to the legacy single `CHANNEL`.
 * Returns an empty array when neither is configured.
 */
export function getChannelList(env: Env | undefined): string[] {
  const explicit = getEnv(env, CHANNELS_ENV)
  if (explicit) {
    return explicit
      .split(/[,;]/)
      .map(normalizeChannel)
      .filter(Boolean)
  }

  const legacy = getEnv(env, LEGACY_CHANNEL_ENV)
  const normalizedLegacy = legacy ? normalizeChannel(legacy) : ''
  return normalizedLegacy ? [normalizedLegacy] : []
}

/** The first configured channel, used as the default source and site identity fallback. */
export function getPrimaryChannel(env: Env | undefined): string | undefined {
  return getChannelList(env)[0]
}

function getProcessEnv(name: string): string | undefined {
  return (Reflect.get(globalThis, 'process') as { env?: Env } | undefined)?.env?.[name]
}

/**
 * Runtime envs must win over Vite's build-time import.meta.env values.
 */
export function getEnv(env: Env | undefined, name: string): string | undefined {
  return getProcessEnv(name) ?? env?.[name]
}

export function getStaticProxy(env: Env): string {
  return getEnv(env, 'STATIC_PROXY') ?? '/static/'
}

export function getTelegramHost(env: Env): string {
  return getEnv(env, 'TELEGRAM_HOST') ?? DEFAULT_TELEGRAM_HOST
}

export function getTargetWhitelist(env: Env | undefined): string[] {
  const hostnames = parseCsvList(getEnv(env, 'TARGET_WHITELIST'))
    .map(hostname => hostname.toLowerCase())
    .filter(isValidHostname)

  return [...new Set(hostnames)]
}

export function getBooleanEnv(env: Env, name: string): boolean | undefined {
  const value = getEnv(env, name)
  return value === undefined ? undefined : value === 'true' || value === '1'
}

export function parseDelimitedItems(value = ''): NavItem[] {
  return value
    .split(';')
    .map(item => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [title = '', href = ''] = item.split(',').map(part => part.trim())
      return { title, href }
    })
    .filter(item => item.title.length > 0 && item.href.length > 0)
}

export function parseCsvList(value = ''): string[] {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function isValidHostname(hostname: string): boolean {
  if (hostname.length > 253 || !hostname.includes('.'))
    return false

  const labels = hostname.split('.')
  if (labels.every(label => /^\d+$/.test(label)))
    return false

  return labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
}
