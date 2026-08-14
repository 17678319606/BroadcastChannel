import { getTargetWhitelist } from './env'

const DEFAULT_TARGET_WHITELIST = [
  't.me',
  'telegram.org',
  'telegram.me',
  'telegram.dog',
  'cdn-telegram.org',
  'telesco.pe',
]

const FORWARDED_REQUEST_HEADERS = new Set([
  'accept',
  'accept-language',
  'if-modified-since',
  'if-none-match',
  'range',
  'user-agent',
])

export function resolveStaticProxyTarget(rawTarget: string): URL {
  const normalizedTarget = rawTarget.startsWith('//') ? `https:${rawTarget}` : rawTarget
  return new URL(normalizedTarget)
}

export function isStaticProxyWhitelisted(target: URL): boolean {
  const isAllowedProtocol = target.protocol === 'http:' || target.protocol === 'https:'
  const targetWhitelist = [
    ...DEFAULT_TARGET_WHITELIST,
    ...getTargetWhitelist(import.meta.env),
  ]
  return isAllowedProtocol && targetWhitelist.some(domain => target.hostname === domain || target.hostname.endsWith(`.${domain}`))
}

function getForwardedRequestHeaders(request: Request): Headers {
  const headers = new Headers()

  for (const [key, value] of request.headers.entries()) {
    if (FORWARDED_REQUEST_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value)
    }
  }

  return headers
}

export async function createStaticProxyResponse(request: Request, rawTarget: string): Promise<Response> {
  let target: URL

  try {
    target = resolveStaticProxyTarget(rawTarget)
  }
  catch {
    return new Response('Invalid proxy target', { status: 400 })
  }

  if (!isStaticProxyWhitelisted(target)) {
    return new Response('Proxy target not allowed', { status: 403 })
  }

  let response: Response

  try {
    response = await fetch(target.toString(), {
      headers: getForwardedRequestHeaders(request),
    })
  }
  catch {
    return new Response('Upstream fetch failed', { status: 502 })
  }

  // Copy upstream headers but strip response-shaping / cookie headers so the
  // proxy can't reflect a third-party `set-cookie` onto our origin domain or
  // double-decode a transferred body.
  const headers = new Headers(response.headers)
  headers.delete('set-cookie')
  headers.delete('set-cookie2')
  headers.delete('transfer-encoding')
  headers.delete('content-encoding')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
