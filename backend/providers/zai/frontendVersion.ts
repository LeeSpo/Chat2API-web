export const FALLBACK_X_FE_VERSION = 'prod-fe-1.1.88'
export const X_FE_VERSION_CACHE_MS = 60 * 60 * 1000
const ZAI_HOME = 'https://chat.z.ai/'
const ZAI_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'

const FE_VERSION_PATTERN = /prod-fe-\d+\.\d+\.\d+/

export function parseZaiFeVersion(html: string): string | null {
  const match = html.match(FE_VERSION_PATTERN)
  return match?.[0] ?? null
}

export interface ZaiFeVersionResolverOptions {
  fetchHtml?: () => Promise<string>
  now?: () => number
  cacheMs?: number
  fallback?: string
}

export function createZaiFeVersionResolver(options: ZaiFeVersionResolverOptions = {}) {
  const fetchHtml = options.fetchHtml ?? defaultFetchZaiHtml
  const now = options.now ?? Date.now
  const cacheMs = options.cacheMs ?? X_FE_VERSION_CACHE_MS
  const fallback = options.fallback ?? FALLBACK_X_FE_VERSION

  let cachedVersion: string | null = null
  let cachedAt = 0
  let inflight: Promise<string> | null = null

  return async function resolveZaiFeVersion(): Promise<string> {
    const timestamp = now()
    if (cachedVersion && timestamp - cachedAt < cacheMs) {
      return cachedVersion
    }
    if (inflight) {
      return inflight
    }

    inflight = (async () => {
      try {
        const html = await fetchHtml()
        const parsed = parseZaiFeVersion(html)
        cachedVersion = parsed || fallback
        cachedAt = now()
        return cachedVersion
      } catch (error) {
        console.warn(
          '[Z.ai] Failed to resolve frontend version, using fallback:',
          error instanceof Error ? error.message : error,
        )
        cachedVersion = fallback
        cachedAt = now()
        return cachedVersion
      } finally {
        inflight = null
      }
    })()

    return inflight
  }
}

async function defaultFetchZaiHtml(): Promise<string> {
  const response = await fetch(ZAI_HOME, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': ZAI_USER_AGENT,
    },
    signal: AbortSignal.timeout(8000),
  })
  return response.text()
}

export const resolveZaiFeVersion = createZaiFeVersionResolver()
