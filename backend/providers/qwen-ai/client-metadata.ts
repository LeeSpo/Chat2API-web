export const DEFAULT_QWEN_AI_WEB_VERSION = process.env.QWEN_AI_WEB_VERSION?.trim() || '0.2.86'
export const DEFAULT_QWEN_AI_BAXIA_VERSION = process.env.QWEN_AI_BAXIA_VERSION?.trim() || '2.5.37'

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
const DEFAULT_SEC_CH_UA = '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"'

function readCredential(credentials: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = credentials[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

/**
 * Keep Qwen's SPA metadata and the browser identity that produced the
 * imported session together. Baxia binds its device token to this context,
 * so mixing a browser token with unrelated synthetic client headers causes
 * chat completions to be rejected even when ordinary account APIs work.
 */
export function resolveQwenAiClientHeaders(
  credentials: Record<string, unknown> = {},
): Record<string, string> {
  const platform = readCredential(credentials, 'browserPlatform')
  return {
    Version: readCredential(credentials, 'qwenWebVersion', 'webVersion') || DEFAULT_QWEN_AI_WEB_VERSION,
    'User-Agent': readCredential(credentials, 'browserUserAgent', 'userAgent') || DEFAULT_USER_AGENT,
    'Accept-Language': readCredential(credentials, 'browserAcceptLanguage', 'acceptLanguage') || 'zh-CN,zh;q=0.9,en;q=0.8',
    'sec-ch-ua': readCredential(credentials, 'browserSecChUa', 'secChUa') || DEFAULT_SEC_CH_UA,
    'sec-ch-ua-mobile': readCredential(credentials, 'browserSecChUaMobile', 'secChUaMobile') || '?0',
    'sec-ch-ua-platform': platform ? `"${platform.replace(/["\\]/g, '')}"` : '"macOS"',
    'bx-v': readCredential(credentials, 'baxiaVersion', 'baxia_version', 'bxV', 'bx_v') || DEFAULT_QWEN_AI_BAXIA_VERSION,
  }
}
