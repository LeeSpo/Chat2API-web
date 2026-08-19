const REFRESH_PAGE_PATTERN = /请刷新页面以更新应用后重试/
const CAPTCHA_CODES = new Set([
  'FRONTEND_CAPTCHA_REQUIRED',
  'CAPTCHA_VERIFICATION_FAILED',
  'CAPTCHA_UNAVAILABLE',
])

export class ZaiUpstreamError extends Error {
  code: string
  status: number
  type: string

  constructor(message: string, code: string, status: number) {
    super(message)
    this.name = 'ZaiUpstreamError'
    this.code = code
    this.status = status
    this.type = 'upstream_protocol_error'
  }
}

export function zaiVerificationRequiredError(detail?: string): ZaiUpstreamError {
  return new ZaiUpstreamError(
    detail || 'Z.ai 需要在管理页完成浏览器验证。打开「供应商 → Z.ai 账号 → 浏览器验证」，若截图有滑块请拖动后再重试。',
    'zai_browser_verification_required',
    503,
  )
}

export function toZaiUpstreamError(error: unknown): ZaiUpstreamError {
  const { code, detail } = extractZaiErrorFields(error)

  if (CAPTCHA_CODES.has(code) || /captcha/i.test(code) || /captcha/i.test(detail)) {
    return new ZaiUpstreamError(
      detail || 'Z.ai requires frontend captcha verification',
      'frontend_captcha_required',
      403,
    )
  }

  if (REFRESH_PAGE_PATTERN.test(detail) || REFRESH_PAGE_PATTERN.test(code)) {
    return new ZaiUpstreamError(
      detail || '请刷新页面以更新应用后重试。',
      'frontend_version_outdated',
      409,
    )
  }

  return new ZaiUpstreamError(
    detail || (typeof error === 'string' ? error : 'Z.ai upstream error'),
    code || 'zai_upstream_error',
    502,
  )
}

function extractZaiErrorFields(error: unknown): { code: string; detail: string } {
  if (typeof error === 'string') {
    return { code: '', detail: error }
  }
  if (!error || typeof error !== 'object') {
    return { code: '', detail: '' }
  }

  const record = error as Record<string, unknown>
  const nested = record.error && typeof record.error === 'object'
    ? record.error as Record<string, unknown>
    : record
  const code = stringifyField(
    nested.code
    ?? nested.error_code
    ?? nested.errorCode
    ?? nested.captcha_error_type
    ?? record.code
    ?? record.error_code,
  )
  const detail = stringifyField(
    nested.detail
    ?? nested.message
    ?? nested.error_msg
    ?? record.detail
    ?? record.message,
  )
  return { code, detail }
}

function stringifyField(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}
