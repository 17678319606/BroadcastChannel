import type { Env } from './env'
import { getBooleanEnv, getEnv } from './env'
import { isBlockedContent } from './safety'

export type AdSlotName = 'AD_SLOT_TOP' | 'AD_SLOT_INLINE' | 'AD_SLOT_BOTTOM'

/** Master switch for every ad slot and the global JS snippet. Defaults to ON. */
export function adsEnabled(env: Env): boolean {
  return getBooleanEnv(env, 'AD_ENABLED') !== false
}

/**
 * Resolve a configured HTML ad slot.
 * Returns null when ads are disabled, the slot is empty, or its content trips the
 * adult / gambling / drug / gray-black financial safety filter.
 */
export function getAdSlot(env: Env, name: AdSlotName): string | null {
  if (!adsEnabled(env)) {
    return null
  }

  const raw = getEnv(env, name)
  if (!raw) {
    return null
  }

  if (isBlockedContent(raw)) {
    if (import.meta.env.DEV) {
      console.warn(`BroadcastChannel: ad slot ${name} blocked by content safety filter`)
    }
    return null
  }

  return raw
}

/** Global raw JS snippet (e.g. an ad-network auto-ads loader). Null when disabled/empty/blocked. */
export function getAdJs(env: Env): string | null {
  if (!adsEnabled(env)) {
    return null
  }

  const raw = getEnv(env, 'AD_JS')
  if (!raw) {
    return null
  }

  if (isBlockedContent(raw)) {
    if (import.meta.env.DEV) {
      console.warn('BroadcastChannel: AD_JS blocked by content safety filter')
    }
    return null
  }

  return raw
}

/** How many posts to show between two inline ad slots. Defaults to 5. */
export function getAdEvery(env: Env): number {
  const value = Number(getEnv(env, 'AD_EVERY'))
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 5
}
