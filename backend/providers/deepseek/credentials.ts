const DEEPSEEK_INVALID_TOKEN_CODES = new Set([40002, 40003])

type ApiRecord = Record<string, unknown>

export interface DeepSeekCompletionFailure {
  status: number
  code: string
  message: string
  retryable: boolean
  accountFault: boolean
  retryScope?: 'next-account'
  muteUntil?: number
}

function asRecord(value: unknown): ApiRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as ApiRecord
    : null
}

function getNumericCode(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function safeUpstreamMessage(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
    : ''
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
 * DeepSeek can return HTTP 200 with a JSON business-error envelope from the
 * chat completion endpoint. Treat it as a failure before the SSE parser sees
 * the body; otherwise the JSON is ignored and becomes an empty success.
 */
export function getDeepSeekCompletionFailure(
  status: number,
  body: unknown,
): DeepSeekCompletionFailure {
  const response = asRecord(body)
  const data = asRecord(response?.data)
  const bizData = asRecord(data?.biz_data) ?? asRecord(response?.biz_data)
  const topLevelCode = getNumericCode(response?.code)
  const bizCode = getNumericCode(data?.biz_code) ?? getNumericCode(response?.biz_code)
  const isMuted = bizData?.is_muted === 1 || bizData?.is_muted === true
  const muteUntilValue = bizData?.mute_until
  const muteUntil = typeof muteUntilValue === 'number' && Number.isFinite(muteUntilValue)
    ? muteUntilValue
    : undefined

  if (isMuted || bizCode === 5) {
    const until = muteUntil === undefined
      ? ''
      : ` until ${new Date(muteUntil * 1000).toISOString()}`
    return {
      status: 429,
      code: 'deepseek_user_muted',
      message: `DeepSeek account is temporarily muted${until}.`,
      retryable: false,
      accountFault: true,
      retryScope: 'next-account',
      muteUntil,
    }
  }

  const upstreamMessage = safeUpstreamMessage(data?.biz_msg)
    || safeUpstreamMessage(response?.msg)
    || safeUpstreamMessage(response?.message)
  const invalidToken = (topLevelCode !== null && DEEPSEEK_INVALID_TOKEN_CODES.has(topLevelCode))
    || status === 401
    || status === 403

  return {
    status: invalidToken ? 401 : status >= 400 ? status : 502,
    code: invalidToken ? 'deepseek_invalid_token' : 'deepseek_completion_rejected',
    message: invalidToken
      ? 'DeepSeek rejected the userToken. Sign in to chat.deepseek.com and import it again.'
      : upstreamMessage
        ? `DeepSeek rejected the chat completion: ${upstreamMessage}`
        : `DeepSeek returned an unexpected JSON response (business code ${bizCode ?? topLevelCode ?? 'unknown'}).`,
    retryable: false,
    accountFault: invalidToken,
    retryScope: invalidToken ? 'next-account' : undefined,
  }
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
