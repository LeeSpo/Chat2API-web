import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import axios, { type AxiosResponse } from 'axios'
import {
  chromium,
  type BrowserContext,
  type Page,
} from 'rebrowser-playwright-core'
import type { Account } from '../../../shared/types'
import {
  configuredZaiBrowserMode,
  createZaiCaptchaCache,
  parseZaiCaptchaVerifyParam,
  zaiCredentialFingerprint,
  type ZaiBrowserMode,
} from './captcha'

export { configuredZaiBrowserMode } from './captcha'
export type { ZaiBrowserMode } from './captcha'

export const ZAI_ORIGIN = 'https://chat.z.ai'
export const ZAI_CAPTCHA_SCRIPT = 'https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js'
export const ZAI_CAPTCHA_SCENE_ID = '36qgs6xb'
export const ZAI_CAPTCHA_PREFIX = 'no8xfe'
export const ZAI_CAPTCHA_REGION = 'sgp'
export const ZAI_CAPTCHA_MODE = 'embed'
export const ZAI_CAPTCHA_ELEMENT_ID = 'chat-captcha-element'
export const ZAI_CAPTCHA_TRIGGER_ID = 'chat-captcha-trigger'
export const ZAI_CAPTCHA_HOST_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>Z.ai 浏览器验证</title>
  <style>
    body { margin: 0; min-height: 100vh; background: #f5f6fa; font-family: "WenQuanYi Zen Hei", "Noto Sans CJK SC", sans-serif; }
    #hint { text-align: center; padding: 28px 16px 8px; color: #222; font-size: 16px; }
  </style>
</head>
<body>
  <div id="hint">请完成下方验证。若出现蓝色按钮或滑块，请点击或拖动。</div>
</body>
</html>`
const VIEWPORT = { width: 1440, height: 900 }
const SIDECAR_REQUEST_TIMEOUT_MS = 75_000
const SESSION_CREATE_TIMEOUT_MS = 35_000
const SESSION_GOTO_TIMEOUT_MS = 20_000
const START_PROBE_TIMEOUT_MS = 3_000
const MINT_TIMEOUT_MS = 8_000
const MINT_ATTEMPTS = 1
const PAGE_OP_TIMEOUT_MS = 2_000

export type ZaiBrowserStatus = {
  available: boolean
  initialized: boolean
  verificationRequired: boolean
  viewport: { width: number; height: number }
  lastError?: string
}

export type ZaiBrowserDragPoint = {
  x: number
  y: number
  delayMs?: number
}

export type ZaiCaptchaMintResult = {
  captchaVerifyParam?: string
  status: ZaiBrowserStatus
}

type BrowserSession = {
  accountId: string
  credentialFingerprint: string
  context: BrowserContext
  page: Page
  ready: boolean
  lastUsedAt: number
  lastError?: string
}

function browserError(message: string, code = 'zai_browser_failed', status = 502): Error {
  const error = new Error(message) as Error & { status?: number; code?: string; accountFault?: boolean }
  error.status = status
  error.code = code
  error.accountFault = false
  return error
}

function isBrowserError(error: unknown): error is Error & { status: number; code: string } {
  const typed = error as Error & { status?: unknown; code?: unknown }
  return typed instanceof Error && typeof typed.status === 'number' && typeof typed.code === 'string'
}

function verificationError(message = 'Z.ai browser verification is required'): Error {
  return browserError(message, 'zai_browser_verification_required', 503)
}

function readToken(account: Account): string {
  const credentials = account.credentials || {}
  const value = credentials.token || credentials.accessToken || credentials.jwt || ''
  return typeof value === 'string' ? value : ''
}

function profileDirectory(accountId: string): string {
  const root = process.env.CHAT2API_DATA_DIR || '/data'
  const safeId = createHash('sha256').update(accountId, 'utf8').digest('hex').slice(0, 24)
  return path.join(root, 'zai-browser-profiles', safeId)
}

function findChromiumExecutable(): string | undefined {
  const configured = process.env.QWEN_AI_BROWSER_EXECUTABLE_PATH?.trim()
    || process.env.ZAI_BROWSER_EXECUTABLE_PATH?.trim()
  const candidates = [
    configured,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter((value): value is string => Boolean(value))
  return candidates.find((candidate) => fs.existsSync(candidate))
}

function sidecarBaseUrl(): string {
  return (process.env.QWEN_AI_BROWSER_SIDECAR_URL || '').trim().replace(/\/$/, '')
}

function sidecarHeaders(): Record<string, string> {
  const secret = process.env.QWEN_AI_BROWSER_SIDECAR_SECRET?.trim()
  return {
    'Content-Type': 'application/json',
    ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
  }
}

function accountForSidecar(account: Account): Account {
  return {
    ...account,
    providerId: 'zai',
    credentials: { ...account.credentials },
  }
}

function unavailableStatus(message: string): ZaiBrowserStatus {
  return {
    available: false,
    initialized: false,
    verificationRequired: false,
    viewport: VIEWPORT,
    lastError: message,
  }
}

function resolveMode(localAvailable: boolean): ZaiBrowserMode {
  return configuredZaiBrowserMode({
    explicit: process.env.CHAT2API_ZAI_BROWSER_MODE || process.env.CHAT2API_QWEN_AI_BROWSER_MODE,
    sidecarUrl: sidecarBaseUrl(),
    localAvailable,
  })
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(browserError(message, 'zai_browser_timeout', 504))
        }, timeoutMs)
        if (typeof timer.unref === 'function') timer.unref()
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export class ZaiLocalPlaywrightTransport {
  private sessions = new Map<string, Promise<BrowserSession>>()
  private cache = createZaiCaptchaCache()

  isAvailable(): boolean {
    return Boolean(findChromiumExecutable())
  }

  async mint(account: Account, options: { force?: boolean } = {}): Promise<ZaiCaptchaMintResult> {
    if (!this.isAvailable()) {
      return { status: this.unavailableStatus() }
    }
    const fingerprint = zaiCredentialFingerprint(readToken(account))
    if (!options.force) {
      const cached = this.cache.get(account.id, fingerprint)
      if (cached) {
        const session = await this.ensureSession(account).catch(() => undefined)
        return {
          captchaVerifyParam: cached,
          status: session
            ? this.sessionStatus(session, false)
            : { available: true, initialized: true, verificationRequired: false, viewport: VIEWPORT },
        }
      }
    }

    const session = await this.ensureSession(account)
    if (await this.hasVisibleCaptcha(session.page)) {
      session.lastError = 'Z.ai requires a visible captcha puzzle'
      throw verificationError()
    }

    const minted = await this.mintOnPage(session.page)
    if (minted) {
      this.cache.set(account.id, fingerprint, minted)
      session.lastError = undefined
      return { captchaVerifyParam: minted, status: this.sessionStatus(session, false) }
    }

    session.lastError = 'Z.ai requires browser verification in the admin UI'
    throw verificationError()
  }

  invalidate(accountId: string): void {
    this.cache.invalidate(accountId)
  }

  async startVerification(account: Account): Promise<ZaiBrowserStatus> {
    if (!this.isAvailable()) return this.unavailableStatus()
    const session = await this.ensureSession(account)
    await this.triggerCaptcha(session.page)
    const minted = await this.waitForMintedParam(session.page, START_PROBE_TIMEOUT_MS)
    if (minted) {
      this.cache.set(account.id, zaiCredentialFingerprint(readToken(account)), minted)
      session.lastError = undefined
    }
    const visible = await this.hasVisibleCaptcha(session.page)
    const verificationRequired = !minted || visible
    if (verificationRequired) {
      session.lastError = visible
        ? '截图中的阿里云验证框还在。请点击蓝色按钮或拖动滑块；完成后框应消失，再重试对话。'
        : '验证组件仍在加载，请点「刷新验证」。'
      if (visible && minted) this.cache.invalidate(account.id)
    }
    return this.sessionStatus(session, verificationRequired)
  }

  async status(account: Account): Promise<ZaiBrowserStatus> {
    if (!this.isAvailable()) return this.unavailableStatus()
    const session = await this.ensureSession(account)
    return this.sessionStatus(session, await this.hasVisibleCaptcha(session.page))
  }

  async screenshot(account: Account): Promise<Buffer> {
    if (!this.isAvailable()) {
      throw browserError('Chromium is not available for Z.ai verification', 'zai_browser_unavailable', 503)
    }
    const session = await this.ensureSession(account)
    return this.captureScreenshot(session.page)
  }

  async drag(account: Account, points: ZaiBrowserDragPoint[]): Promise<ZaiBrowserStatus> {
    if (points.length < 2 || points.length > 500) {
      throw browserError('A verification drag must contain between 2 and 500 points', 'invalid_request', 400)
    }
    const normalized = points.map((point) => ({
      x: Math.max(0, Math.min(VIEWPORT.width, Number(point.x))),
      y: Math.max(0, Math.min(VIEWPORT.height, Number(point.y))),
      delayMs: Math.max(0, Math.min(100, Number(point.delayMs) || 0)),
    }))
    if (normalized.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
      throw browserError('Verification drag contains invalid coordinates', 'invalid_request', 400)
    }

    const session = await this.ensureSession(account)
    await session.page.mouse.move(normalized[0].x, normalized[0].y)
    await session.page.mouse.down()
    for (const point of normalized.slice(1)) {
      await session.page.mouse.move(point.x, point.y)
      if (point.delayMs) await new Promise((resolve) => setTimeout(resolve, point.delayMs))
    }
    await session.page.mouse.up()
    await new Promise((resolve) => setTimeout(resolve, 1_800))
    const verificationRequired = await this.hasVisibleCaptcha(session.page)
    session.lastError = verificationRequired ? 'Verification is still required; retry the puzzle' : undefined
    if (!verificationRequired) {
      try {
        const minted = await this.mintOnPage(session.page)
        if (minted) {
          this.cache.set(account.id, zaiCredentialFingerprint(readToken(account)), minted)
        }
      } catch {}
    }
    return this.sessionStatus(session, verificationRequired)
  }

  private unavailableStatus(): ZaiBrowserStatus {
    return unavailableStatus('Chromium is not available in this deployment')
  }

  private sessionStatus(session: BrowserSession, verificationRequired: boolean): ZaiBrowserStatus {
    return {
      available: true,
      initialized: session.ready,
      verificationRequired,
      viewport: VIEWPORT,
      ...(session.lastError ? { lastError: session.lastError } : {}),
    }
  }

  private async ensureSession(account: Account): Promise<BrowserSession> {
    const fingerprint = zaiCredentialFingerprint(readToken(account))
    const existingPromise = this.sessions.get(account.id)
    if (existingPromise) {
      try {
        const existing = await withTimeout(
          existingPromise,
          SESSION_CREATE_TIMEOUT_MS,
          'Z.ai browser session is still starting',
        )
        if (existing.credentialFingerprint === fingerprint && !existing.page.isClosed()) return existing
        await existing.context.close().catch(() => undefined)
      } catch {
        void existingPromise.then((session) => session.context.close()).catch(() => undefined)
      }
      this.sessions.delete(account.id)
    }

    const created = this.createSession(account, fingerprint).catch((error) => {
      this.sessions.delete(account.id)
      throw error
    })
    this.sessions.set(account.id, created)
    return created
  }

  private async createSession(account: Account, fingerprint: string): Promise<BrowserSession> {
    const executablePath = findChromiumExecutable()
    if (!executablePath) {
      throw browserError('Chromium is not installed for Z.ai Playwright transport', 'zai_browser_unavailable', 503)
    }
    const userDataDir = profileDirectory(account.id)
    fs.mkdirSync(userDataDir, { recursive: true })
    for (const lockName of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
      fs.rmSync(path.join(userDataDir, lockName), { force: true })
    }
    const token = readToken(account)
    let context: BrowserContext | undefined
    const startedAt = Date.now()
    console.log('[Z.ai] Opening verification page for', account.id)

    try {
      return await withTimeout((async () => {
    const launched = await chromium.launchPersistentContext(userDataDir, {
      executablePath,
      headless: true,
      viewport: VIEWPORT,
      locale: 'zh-CN',
      timezoneId: process.env.QWEN_AI_BROWSER_TIMEZONE || 'Asia/Shanghai',
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-sandbox',
        '--renderer-process-limit=2',
      ],
    })
    context = launched

    if (token) {
      await launched.addCookies([{
        name: 'token',
        value: token,
        url: `${ZAI_ORIGIN}/`,
        secure: true,
        sameSite: 'Lax',
      }])
    }
    await launched.addInitScript(({ token, captcha }) => {
      try {
        Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => undefined })
        if (location.hostname === 'chat.z.ai' && token) {
          localStorage.setItem('token', token)
        }
      } catch {}
      const startCaptcha = () => {
        const host = window as typeof window & {
          __zaiCaptchaParam?: unknown
          __zaiCaptchaError?: string
          __zaiStartCaptcha?: () => void
          initAliyunCaptcha?: Function
          AliyunCaptchaConfig?: { region: string; prefix: string }
        }
        if (document.documentElement.dataset.zaiCaptchaStarted === '1') return
        document.documentElement.dataset.zaiCaptchaStarted = '1'
        host.__zaiCaptchaError = undefined
        const panelStyle = 'position:fixed;left:50%;top:28%;transform:translateX(-50%);z-index:2147483646;width:360px;min-height:80px;background:#fff;padding:12px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);'
        const buttonStyle = 'position:fixed;left:50%;top:16%;transform:translateX(-50%);z-index:2147483647;padding:8px 16px;border-radius:6px;background:#1a73e8;color:#fff;border:0;font-size:14px;'
        const ensure = (id: string, tag: 'div' | 'button', style: string) => {
          let node = document.getElementById(id)
          if (!node) {
            node = document.createElement(tag)
            node.id = id
            document.body.appendChild(node)
          }
          if (tag === 'button') {
            ;(node as HTMLButtonElement).type = 'button'
            if (!node.textContent) node.textContent = '点击开始验证'
          }
          node.setAttribute('style', style)
        }
        const loadScript = () => new Promise<void>((resolve, reject) => {
          if (typeof host.initAliyunCaptcha === 'function') {
            resolve()
            return
          }
          const existing = document.querySelector(`script[src="${captcha.scriptUrl}"]`)
          if (existing) {
            existing.addEventListener('load', () => resolve())
            existing.addEventListener('error', () => reject(new Error('captcha script load failed')))
            return
          }
          const script = document.createElement('script')
          script.src = captcha.scriptUrl
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('captcha script load failed'))
          document.head.appendChild(script)
        })
        void loadScript().then(() => {
          if (typeof host.initAliyunCaptcha !== 'function') throw new Error('initAliyunCaptcha missing')
          host.AliyunCaptchaConfig = { region: captcha.region, prefix: captcha.prefix }
          ensure(captcha.elementId, 'div', panelStyle)
          ensure(captcha.triggerId, 'button', buttonStyle)
          host.initAliyunCaptcha({
            SceneId: captcha.sceneId,
            mode: captcha.mode,
            element: `#${captcha.elementId}`,
            button: `#${captcha.triggerId}`,
            language: 'cn',
            timeout: 10_000,
            delayBeforeSuccess: false,
            success: (value: unknown) => { host.__zaiCaptchaParam = value },
            fail: (reason: unknown) => {
              host.__zaiCaptchaError = typeof reason === 'string' ? reason : 'captcha verify failed'
            },
            onError: (reason: unknown) => {
              host.__zaiCaptchaError = typeof reason === 'string' ? reason : 'captcha service error'
            },
            onClose: () => { host.__zaiCaptchaError = 'captcha cancelled by user' },
          })
          document.getElementById(captcha.triggerId)?.click()
        }).catch((error) => {
          host.__zaiCaptchaError = error instanceof Error ? error.message : String(error)
        })
      }
      ;(window as typeof window & { __zaiStartCaptcha?: () => void }).__zaiStartCaptcha = startCaptcha
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startCaptcha, { once: true })
      } else {
        startCaptcha()
      }
    }, {
      token,
      captcha: {
        scriptUrl: ZAI_CAPTCHA_SCRIPT,
        sceneId: ZAI_CAPTCHA_SCENE_ID,
        prefix: ZAI_CAPTCHA_PREFIX,
        region: ZAI_CAPTCHA_REGION,
        mode: ZAI_CAPTCHA_MODE,
        elementId: ZAI_CAPTCHA_ELEMENT_ID,
        triggerId: ZAI_CAPTCHA_TRIGGER_ID,
      },
    })

    await launched.route('https://chat.z.ai/**', async (route) => {
      if (route.request().resourceType() === 'document') {
        await route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: ZAI_CAPTCHA_HOST_HTML,
        })
        return
      }
      await route.continue()
    })

    const pages = launched.pages()
    const page = pages[0] || await launched.newPage()
    const session: BrowserSession = {
      accountId: account.id,
      credentialFingerprint: fingerprint,
      context: launched,
      page,
      ready: false,
      lastUsedAt: Date.now(),
    }
    await page.goto(`${ZAI_ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: SESSION_GOTO_TIMEOUT_MS })
    await this.waitForPageContext(page)
    if (token) {
      await page.evaluate((value) => {
        try { localStorage.setItem('token', value) } catch {}
      }, token).catch(() => undefined)
    }
    session.ready = true
    console.log('[Z.ai] Verification page ready for', account.id, `${Date.now() - startedAt}ms`)
    return session
      })(), SESSION_CREATE_TIMEOUT_MS, 'Z.ai browser session timed out while opening the verification page')
    } catch (error) {
      await context?.close().catch(() => undefined)
      throw error
    }
  }

  private async waitForPageContext(page: Page): Promise<void> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const ready = await page.evaluate(() => document.readyState)
        if (ready === 'interactive' || ready === 'complete') return
      } catch (error) {
        console.warn('[Z.ai] Waiting for Chromium execution context:', error instanceof Error ? error.message : error)
      }
      await new Promise((resolve) => setTimeout(resolve, 750))
    }
  }

  private async triggerCaptcha(page: Page): Promise<void> {
    await page.evaluate(() => {
      const start = (window as typeof window & { __zaiStartCaptcha?: () => void }).__zaiStartCaptcha
      start?.()
    }).catch(() => undefined)
  }

  private async waitForMintedParam(page: Page, timeoutMs: number): Promise<string | undefined> {
    try {
      const result = await page.waitForFunction(() => {
        const host = window as typeof window & { __zaiCaptchaParam?: unknown; __zaiCaptchaError?: string }
        if (host.__zaiCaptchaParam !== undefined) return { ok: true, value: host.__zaiCaptchaParam }
        if (host.__zaiCaptchaError) return { ok: false, error: host.__zaiCaptchaError }
        return false
      }, undefined, { timeout: timeoutMs })
      const payload = await result.jsonValue() as { ok?: boolean; value?: unknown; error?: string }
      if (payload?.ok) return parseZaiCaptchaVerifyParam(payload.value)
      console.warn('[Z.ai] Captcha mint failed:', payload?.error || 'captcha mint failed')
    } catch (error) {
      console.warn('[Z.ai] Captcha mint probe ended:', error instanceof Error ? error.message : error)
    }
    return undefined
  }

  private async mintOnPage(page: Page): Promise<string | undefined> {
    await this.waitForPageContext(page)
    let lastError: unknown
    for (let attempt = 0; attempt < MINT_ATTEMPTS; attempt += 1) {
      try {
        await this.triggerCaptcha(page)
        const minted = await this.waitForMintedParam(page, MINT_TIMEOUT_MS)
        if (minted) return minted
        lastError = new Error('captcha mint returned an empty parameter')
      } catch (error) {
        lastError = error
        console.warn('[Z.ai] Captcha evaluate failed:', error instanceof Error ? error.message : error)
      }
    }
    if (lastError) {
      console.warn('[Z.ai] Captcha mint exhausted retries:', lastError instanceof Error ? lastError.message : lastError)
    }
    return undefined
  }

  private async hasVisibleCaptcha(page: Page): Promise<boolean> {
    if (page.isClosed()) return false
    try {
      return await withTimeout(this.detectVisibleCaptcha(page), PAGE_OP_TIMEOUT_MS, 'Z.ai captcha inspect timed out')
    } catch {
      return true
    }
  }

  private async captureScreenshot(page: Page): Promise<Buffer> {
    const client = await page.context().newCDPSession(page)
    try {
      const result = await withTimeout(
        client.send('Page.captureScreenshot', { format: 'png', fromSurface: true, optimizeForSpeed: true }),
        5_000,
        'Z.ai browser screenshot timed out',
      )
      return Buffer.from(result.data, 'base64')
    } finally {
      void client.detach().catch(() => undefined)
    }
  }

  private async detectVisibleCaptcha(page: Page): Promise<boolean> {
    return page.evaluate(() => {
      const text = document.body?.innerText || ''
      if (/Alibaba Cloud|阿里云|请按住滑块|请完成安全验证/i.test(text)) return true
      const panel = document.getElementById('chat-captcha-element')
      if (panel) {
        const rect = panel.getBoundingClientRect()
        if (rect.width > 40 && rect.height > 40 && rect.left > -100) return true
        if (panel.querySelector('iframe, canvas, img, svg')) return true
      }
      return [...document.querySelectorAll('iframe')].some((iframe) => {
        const src = iframe.getAttribute('src') || ''
        const rect = iframe.getBoundingClientRect()
        return rect.width > 40 && rect.height > 40 && /alicdn|aliyun|captcha/i.test(src)
      })
    }).catch(() => false)
  }
}

export class ZaiRemotePlaywrightTransport {
  isAvailable(): boolean {
    return Boolean(sidecarBaseUrl())
  }

  async mint(account: Account, options: { force?: boolean } = {}): Promise<ZaiCaptchaMintResult> {
    const response = await this.request('/v1/zai/mint', {
      account: accountForSidecar(account),
      force: Boolean(options.force),
    }, 'json')
    const data = response.data?.data as ZaiCaptchaMintResult | undefined
    if (!data?.status) {
      throw browserError('Z.ai browser sidecar returned an empty mint result', 'zai_browser_sidecar_failed', 502)
    }
    return {
      captchaVerifyParam: parseZaiCaptchaVerifyParam(data.captchaVerifyParam),
      status: data.status,
    }
  }

  invalidate(accountId: string): void {
    void this.request('/v1/zai/invalidate', { accountId }, 'json').catch(() => undefined)
  }

  async startVerification(account: Account): Promise<ZaiBrowserStatus> {
    return this.jsonStatus('/v1/zai/verification/start', { account: accountForSidecar(account) })
  }

  async status(account: Account): Promise<ZaiBrowserStatus> {
    return this.jsonStatus('/v1/zai/status', { account: accountForSidecar(account) })
  }

  async screenshot(account: Account): Promise<Buffer> {
    const response = await this.request('/v1/zai/screenshot', { account: accountForSidecar(account) }, 'arraybuffer')
    return Buffer.from(response.data)
  }

  async drag(account: Account, points: ZaiBrowserDragPoint[]): Promise<ZaiBrowserStatus> {
    return this.jsonStatus('/v1/zai/verification/drag', { account: accountForSidecar(account), points })
  }

  private async jsonStatus(endpoint: string, body: Record<string, unknown>): Promise<ZaiBrowserStatus> {
    const response = await this.request(endpoint, body, 'json')
    return response.data.data as ZaiBrowserStatus
  }

  private async request(
    endpoint: string,
    body: Record<string, unknown>,
    responseType: 'json' | 'arraybuffer',
  ): Promise<AxiosResponse> {
    const baseUrl = sidecarBaseUrl()
    if (!baseUrl) throw browserError('Z.ai browser sidecar is disabled', 'zai_browser_unavailable', 503)
    try {
      const response = await axios.post(`${baseUrl}${endpoint}`, body, {
        headers: sidecarHeaders(),
        responseType,
        validateStatus: () => true,
        timeout: SIDECAR_REQUEST_TIMEOUT_MS,
        proxy: false,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      })
      if (response.status >= 400) {
        const payload = responseType === 'arraybuffer'
          ? JSON.parse(Buffer.from(response.data).toString('utf8'))
          : response.data
        throw browserError(
          payload?.error?.message || `Z.ai browser sidecar returned HTTP ${response.status}`,
          payload?.error?.code || 'zai_browser_sidecar_failed',
          response.status,
        )
      }
      return response
    } catch (error) {
      if (isBrowserError(error)) throw error
      throw browserError(
        `Z.ai browser sidecar is unavailable: ${error instanceof Error ? error.message : String(error)}`,
        'zai_browser_unavailable',
        503,
      )
    }
  }
}

export class ZaiPlaywrightTransport {
  private readonly local = new ZaiLocalPlaywrightTransport()
  private readonly remote = new ZaiRemotePlaywrightTransport()

  private mode(): ZaiBrowserMode {
    return resolveMode(this.local.isAvailable())
  }

  isAvailable(): boolean {
    const mode = this.mode()
    return mode === 'local' ? this.local.isAvailable() : mode === 'sidecar' && this.remote.isAvailable()
  }

  async mint(account: Account, options: { force?: boolean } = {}): Promise<ZaiCaptchaMintResult> {
    const mode = this.mode()
    if (mode === 'local') return this.local.mint(account, options)
    if (mode === 'sidecar') return this.remote.mint(account, options)
    return { status: unavailableStatus('Z.ai browser transport is disabled') }
  }

  invalidate(accountId: string): void {
    const mode = this.mode()
    if (mode === 'local') this.local.invalidate(accountId)
    if (mode === 'sidecar') this.remote.invalidate(accountId)
  }

  async startVerification(account: Account): Promise<ZaiBrowserStatus> {
    const mode = this.mode()
    if (mode === 'local') return this.local.startVerification(account)
    if (mode === 'sidecar') return this.remote.startVerification(account)
    return unavailableStatus('Z.ai browser transport is disabled')
  }

  async status(account: Account): Promise<ZaiBrowserStatus> {
    const mode = this.mode()
    if (mode === 'local') return this.local.status(account)
    if (mode === 'sidecar') return this.remote.status(account)
    return unavailableStatus('Z.ai browser transport is disabled')
  }

  async screenshot(account: Account): Promise<Buffer> {
    const mode = this.mode()
    if (mode === 'local') return this.local.screenshot(account)
    if (mode === 'sidecar') return this.remote.screenshot(account)
    throw browserError('Z.ai browser transport is disabled', 'zai_browser_unavailable', 503)
  }

  async drag(account: Account, points: ZaiBrowserDragPoint[]): Promise<ZaiBrowserStatus> {
    const mode = this.mode()
    if (mode === 'local') return this.local.drag(account, points)
    if (mode === 'sidecar') return this.remote.drag(account, points)
    throw browserError('Z.ai browser transport is disabled', 'zai_browser_unavailable', 503)
  }
}

export const zaiPlaywrightTransport = new ZaiPlaywrightTransport()
