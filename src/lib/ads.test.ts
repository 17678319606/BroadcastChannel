import type { Env } from './env'
import { describe, expect, it } from 'vitest'
import { getAdEvery, getAdJs, getAdSlot } from './ads'

function envWith(values: Record<string, string | undefined>): Env {
  return { ...values }
}

describe('ad slots', () => {
  it('returns null when ads are disabled', () => {
    expect(getAdSlot(envWith({ AD_ENABLED: 'false', AD_SLOT_TOP: '<b>ad</b>' }), 'AD_SLOT_TOP')).toBeNull()
  })

  it('returns the slot HTML when enabled and clean', () => {
    expect(getAdSlot(envWith({ AD_SLOT_TOP: '<b>ad</b>' }), 'AD_SLOT_TOP')).toBe('<b>ad</b>')
  })

  it('rejects a slot whose content trips the safety filter', () => {
    expect(getAdSlot(envWith({ AD_SLOT_TOP: '博彩平台 注册送彩金' }), 'AD_SLOT_TOP')).toBeNull()
  })

  it('rejects AD_JS that trips the safety filter', () => {
    expect(getAdJs(envWith({ AD_JS: '赌博 推广脚本' }))).toBeNull()
  })

  it('returns AD_JS when enabled and clean', () => {
    expect(getAdJs(envWith({ AD_JS: 'console.log("ad")' }))).toBe('console.log("ad")')
  })

  it('defaults AD_EVERY to 5', () => {
    expect(getAdEvery(envWith({}))).toBe(5)
  })

  it('reads AD_EVERY from env', () => {
    expect(getAdEvery(envWith({ AD_EVERY: '3' }))).toBe(3)
  })
})
