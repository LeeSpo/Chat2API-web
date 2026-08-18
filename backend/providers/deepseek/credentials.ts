const DEEPSEEK_INVALID_TOKEN_CODES = new Set([40002, 40003])

type ApiRecord = Record<string, unknown>

function asRecord(value: unknown): ApiRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as ApiRecord
    : null
}

function getNumericCode(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * DeepSeek's current web client stores userToken with its storage metadata:
 * `{ "value": "<bearer token>", "__version": "0" }`.
 * Older clients stored the bearer token directly, so both formats remain
 * supported at every credential boundary.
 */
export function normalizeDeepSeekUserToken(value: unknown): string {
  if (typeof value !== 'string') return ''

  const raw = value.trim()
  if (!raw) return ''

  try {
    const wrapped = asRecord(JSON.parse(raw))
    if (wrapped) {
      const token = wrapped.value
      return typeof token === 'string' && token.trim() ? token.trim() : ''
    }
    return raw
  } catch {
    return raw
  }
}

export function getDeepSeekUserData(body: unknown): ApiRecord | null {
  const response = asRecord(body)
  const data = asRecord(response?.data)
  return asRecord(data?.biz_data) ?? asRecord(response?.biz_data)
}

/**
 * Returns a safe, user-actionable validation error. Do not expose the
 * upstream response body because it can contain account information.
 */
export function getDeepSeekTokenValidationError(status: number, body: unknown): string | null {
  const response = asRecord(body)
  const data = asRecord(response?.data)
  const code = getNumericCode(response?.code) ?? getNumericCode(data?.biz_code)

  if (code !== null && DEEPSEEK_INVALID_TOKEN_CODES.has(code)) {
    return 'DeepSeek userToken is invalid or expired. Sign in to chat.deepseek.com and import it again with the bookmarklet.'
  }

  if (status === 401 || status === 403) {
    return 'DeepSeek rejected the userToken. Sign in to chat.deepseek.com and import it again with the bookmarklet.'
  }

  if (status !== 200) {
    return `DeepSeek token validation failed (HTTP ${status}). Please try again later.`
  }

  if (code !== null && code !== 0) {
    return `DeepSeek rejected the userToken (code ${code}). Sign in to chat.deepseek.com and import it again with the bookmarklet.`
  }

  if (!getDeepSeekUserData(body)) {
    return 'DeepSeek returned an unexpected account response. Sign in to chat.deepseek.com and import the userToken again.'
  }

  return null
}

/**
 * Mirrors the current public DeepSeek web client's identifying request
 * headers. The browser-provided headers are deliberately not spoofed.
 */
export function createDeepSeekWebHeaders(locale = 'zh_CN'): Record<string, string> {
  return {
    Accept: '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Origin: 'https://chat.deepseek.com',
    Referer: 'https://chat.deepseek.com/',
    'X-Client-Bundle-Id': 'com.deepseek.chat',
    'X-Client-Platform': 'web',
    'X-Client-Version': '2.3.0',
    'X-Client-Locale': locale,
    'X-Client-Timezone-Offset': String(-new Date().getTimezoneOffset() * 60),
  }
}
