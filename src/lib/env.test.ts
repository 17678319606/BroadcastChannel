import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getBooleanEnv,
  getChannelList,
  getEnv,
  getPageSize,
  getPrimaryChannel,
  getStaticProxy,
  getTargetWhitelist,
  getTelegramHost,
  parseCsvList,
  parseDelimitedItems,
} from './env'

describe('getEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('prefers process.env over import.meta.env', () => {
    vi.stubEnv('TEST_ENV_PRIORITY', 'process-value')

    expect(
      getEnv(
        { TEST_ENV_PRIORITY: 'import-value' },
        'TEST_ENV_PRIORITY',
      ),
    ).toBe('process-value')
  })

  it('prefers an empty process env value over import.meta.env', () => {
    vi.stubEnv('TEST_ENV_PRIORITY', '')

    expect(
      getEnv(
        { TEST_ENV_PRIORITY: 'import-value' },
        'TEST_ENV_PRIORITY',
      ),
    ).toBe('')
  })

  it('falls back to import.meta.env when process env is missing', () => {
    expect(
      getEnv(
        { TEST_ENV_PRIORITY: 'import-value' },
        'TEST_ENV_PRIORITY',
      ),
    ).toBe('import-value')
  })
})

describe('getStaticProxy', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults to /static/ when unset', () => {
    vi.stubEnv('STATIC_PROXY', undefined)

    expect(getStaticProxy({})).toBe('/static/')
  })

  it('preserves an explicitly empty value', () => {
    vi.stubEnv('STATIC_PROXY', '')

    expect(getStaticProxy({})).toBe('')
  })
})

describe('getBooleanEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each([
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
    ['', false],
  ])('parses %j as %s', (value, expected) => {
    vi.stubEnv('TEST_BOOLEAN_ENV', value)

    expect(getBooleanEnv({}, 'TEST_BOOLEAN_ENV')).toBe(expected)
  })

  it('returns undefined when unset', () => {
    vi.stubEnv('TEST_BOOLEAN_ENV', undefined)

    expect(getBooleanEnv({}, 'TEST_BOOLEAN_ENV')).toBeUndefined()
  })
})

describe('getTelegramHost', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults to telegram.me', () => {
    vi.stubEnv('TELEGRAM_HOST', undefined)

    expect(getTelegramHost({})).toBe('telegram.me')
  })

  it('uses the configured host', () => {
    vi.stubEnv('TELEGRAM_HOST', 'telegram.dog')

    expect(getTelegramHost({})).toBe('telegram.dog')
  })
})

describe('getTargetWhitelist', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns no additions when unset', () => {
    vi.stubEnv('TARGET_WHITELIST', undefined)

    expect(getTargetWhitelist({})).toEqual([])
  })

  it('returns no additions when the environment object is unavailable', () => {
    vi.stubEnv('TARGET_WHITELIST', undefined)

    expect(() => getTargetWhitelist(undefined)).not.toThrow()
    expect(getTargetWhitelist(undefined)).toEqual([])
  })

  it('prefers the runtime value and normalizes hostnames', () => {
    vi.stubEnv('TARGET_WHITELIST', ' A.com, b.COM, a.com, sub.Example.com ')

    expect(getTargetWhitelist({ TARGET_WHITELIST: 'build.example' })).toEqual([
      'a.com',
      'b.com',
      'sub.example.com',
    ])
  })

  it('ignores values that are not DNS hostnames', () => {
    vi.stubEnv(
      'TARGET_WHITELIST',
      'https://a.com,a.com:443,a.com/path,a.com?x=1,a.com#x,*.a.com,127.0.0.1,::1,localhost',
    )

    expect(getTargetWhitelist({})).toEqual([])
  })
})

describe('env parsing helpers', () => {
  it('parses semicolon-delimited nav items and ignores empty entries', () => {
    expect(parseDelimitedItems('Home,/; ; Blog,/blog; Invalid; About,/about')).toEqual([
      { title: 'Home', href: '/' },
      { title: 'Blog', href: '/blog' },
      { title: 'About', href: '/about' },
    ])
  })

  it('parses comma-delimited lists and ignores empty entries', () => {
    expect(parseCsvList('alpha, , beta,, gamma ')).toEqual(['alpha', 'beta', 'gamma'])
  })
})

describe('getChannelList', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns a single channel from the legacy CHANNEL var', () => {
    vi.stubEnv('CHANNEL', 'miantiao_me')
    expect(getChannelList({})).toEqual(['miantiao_me'])
  })

  it('prefers CHANNELS over the legacy CHANNEL var', () => {
    vi.stubEnv('CHANNEL', 'legacy_chan')
    vi.stubEnv('CHANNELS', 'a, b ; c')
    expect(getChannelList({})).toEqual(['a', 'b', 'c'])
  })

  it('splits CHANNELS on commas and semicolons and drops empties', () => {
    vi.stubEnv('CHANNELS', 'alpha, , beta;; gamma ,')
    expect(getChannelList({})).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('returns an empty array when neither var is set', () => {
    vi.stubEnv('CHANNEL', undefined)
    vi.stubEnv('CHANNELS', undefined)
    expect(getChannelList({})).toEqual([])
  })

  it('strips t.me / https prefixes and trailing slashes from channel entries', () => {
    vi.stubEnv('CHANNELS', 't.me/foo, https://t.me/s/bar/, baz/')
    expect(getChannelList({})).toEqual(['foo', 'bar', 'baz'])
  })

  it('exposes the first channel as the primary channel', () => {
    vi.stubEnv('CHANNELS', 'first,second')
    expect(getPrimaryChannel({})).toBe('first')
  })
})

describe('getPageSize', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults to 30 when PAGE_SIZE is unset', () => {
    vi.stubEnv('PAGE_SIZE', undefined)
    expect(getPageSize({})).toBe(30)
  })

  it('parses a valid PAGE_SIZE value', () => {
    vi.stubEnv('PAGE_SIZE', '50')
    expect(getPageSize({})).toBe(50)
  })

  it('clamps values below the minimum (10) up to 10', () => {
    vi.stubEnv('PAGE_SIZE', '3')
    expect(getPageSize({})).toBe(10)
  })

  it('clamps values above the maximum (100) down to 100', () => {
    vi.stubEnv('PAGE_SIZE', '500')
    expect(getPageSize({})).toBe(100)
  })

  it('falls back to 30 for non-numeric input', () => {
    vi.stubEnv('PAGE_SIZE', 'abc')
    expect(getPageSize({})).toBe(30)
  })
})
