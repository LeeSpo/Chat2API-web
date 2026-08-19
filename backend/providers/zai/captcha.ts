import { createHash } from 'crypto'

export const ZAI_CAPTCHA_TTL_MS = 120_000

export function htmlLooksLikeVisibleZaiCaptcha(html: string): boolean {
  return /Alibaba Cloud|阿里云|alicdn|aliyunCaptcha|chat-captcha-element|请按住滑块|请完成安全验证/i.test(html)
}

export function parseZaiCaptchaVerifyParam(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || undefined
  }
  if (!value || typeof value !== 'object') return undefined

  const record = value as Record<string, unknown>
  const nested = record.data && typeof record.data === 'object'
    ? record.data as Record<string, unknown>
    : undefined
  return parseZaiCaptchaVerifyParam(
    record.captcha_verify_param
    ?? record.captchaVerifyParam
    ?? nested?.captcha_verify_param
    ?? nested?.captchaVerifyParam,
  )
}

export function zaiCredentialFingerprint(token: string): string {
  return createHash('sha256').update(token || '', 'utf8').digest('hex')
}

export interface ZaiCaptchaCache {
  get(accountId: string, fingerprint: string): string | undefined
  set(accountId: string, fingerprint: string, param: string): void
  invalidate(accountId: string): void
}

export function createZaiCaptchaCache(options: {
  ttlMs?: number
  now?: () => number
} = {}): ZaiCaptchaCache {
  const ttlMs = options.ttlMs ?? ZAI_CAPTCHA_TTL_MS
  const now = options.now ?? Date.now
  const entries = new Map<string, { fingerprint: string; param: string; expiresAt: number }>()

  return {
    get(accountId, fingerprint) {
      const entry = entries.get(accountId)
      if (!entry) return undefined
      if (entry.fingerprint !== fingerprint || now() >= entry.expiresAt) {
        entries.delete(accountId)
        return undefined
      }
      return entry.param
    },
    set(accountId, fingerprint, param) {
      const value = param.trim()
      if (!value) {
        entries.delete(accountId)
        return
      }
      entries.set(accountId, {
        fingerprint,
        param: value,
        expiresAt: now() + ttlMs,
      })
    },
    invalidate(accountId) {
      entries.delete(accountId)
    },
  }
}

export function attachZaiCaptchaParam<T extends Record<string, unknown>>(
  body: T,
  param?: string,
): T & { captcha_verify_param?: string } {
  const next = { ...body }
  const value = parseZaiCaptchaVerifyParam(param)
  if (value) next.captcha_verify_param = value
  return next
}

export type ZaiBrowserMode = 'off' | 'local' | 'sidecar'

export function configuredZaiBrowserMode(input: {
  explicit?: string
  sidecarUrl?: string
  localAvailable: boolean
}): ZaiBrowserMode {
  const explicit = (input.explicit || '').trim().toLowerCase()
  if (explicit === 'off' || explicit === 'disabled' || explicit === '0') return 'off'
  if (explicit === 'sidecar' || explicit === 'remote') return 'sidecar'
  if (explicit === 'local') return 'local'
  if ((input.sidecarUrl || '').trim()) return 'sidecar'
  return input.localAvailable ? 'local' : 'off'
}
