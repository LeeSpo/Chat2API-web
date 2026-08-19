import { createHash, randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { PassThrough } from 'stream'
import axios, { type AxiosResponse } from 'axios'
import {
  chromium,
  type BrowserContext,
  type Page,
} from 'rebrowser-playwright-core'
import type { Account } from '../../../shared/types'

const QWEN_ORIGIN = 'https://chat.qwen.ai'
const BAXIA_READY_TIMEOUT_MS = 30_000
const RESPONSE_START_TIMEOUT_MS = 60_000
const VIEWPORT = { width: 1440, height: 900 }
const SIDECAR_REQUEST_TIMEOUT_MS = 75_000

type BrowserSession = {
  accountId: string
  credentialFingerprint: string
  context: BrowserContext
  page: Page
  ready: boolean
  lastUsedAt: number
  lastError?: string
}

type BrowserEvent =
  | { taskId: string; type: 'start'; status: number; headers?: Record<string, string> }
  | { taskId: string; type: 'chunk'; data: string }
  | { taskId: string; type: 'end' }
  | { taskId: string; type: 'error'; message?: string }

type PendingTask = {
  accountId: string
  stream: PassThrough
  started: boolean
  resolve: (response: AxiosResponse) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
  abortCleanup?: () => void
}

export type QwenAiBrowserStatus = {
  available: boolean
  initialized: boolean
  verificationRequired: boolean
  viewport: { width: number; height: number }
  lastError?: string
}

export type QwenAiBrowserDragPoint = {
  x: number
  y: number
  delayMs?: number
}

function browserError(message: string, code = 'qwen_ai_playwright_failed', status = 502): Error {
  const error = new Error(message) as Error & { status?: number; code?: string; accountFault?: boolean }
  error.status = status
  error.code = code
  error.accountFault = false
  return error
}

function isBrowserError(error: unknown): error is Error & { status: number; code: string; accountFault: false } {
  const typed = error as Error & { status?: unknown; code?: unknown; accountFault?: unknown }
  return typed instanceof Error
    && typeof typed.status === 'number'
    && typeof typed.code === 'string'
    && typed.accountFault === false
}

function verificationError(message = 'Qwen AI browser verification is required'): Error {
  return browserError(message, 'qwen_ai_browser_verification_required', 503)
}

function readCredential(account: Account, key: string): string {
  const value = account.credentials?.[key]
  return typeof value === 'string' ? value : ''
}

function credentialFingerprint(account: Account): string {
  const material = [
    readCredential(account, 'token'),
    readCredential(account, 'cookies'),
    readCredential(account, 'qwenWebVersion'),
    readCredential(account, 'browserUserAgent'),
    readCredential(account, 'x5secStorage'),
  ].join('\u0000')
  return createHash('sha256').update(material, 'utf8').digest('hex')
}

function profileDirectory(accountId: string): string {
  const root = process.env.CHAT2API_DATA_DIR || '/data'
  const safeId = createHash('sha256').update(accountId, 'utf8').digest('hex').slice(0, 24)
  return path.join(root, 'qwen-browser-profiles', safeId)
}

function findChromiumExecutable(): string | undefined {
  const configured = process.env.QWEN_AI_BROWSER_EXECUTABLE_PATH?.trim()
  const candidates = [
    configured,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter((value): value is string => Boolean(value))
  return candidates.find((candidate) => fs.existsSync(candidate))
}

function parseCookies(input: string): Array<{
  name: string
  value: string
  url: string
  secure: boolean
  sameSite: 'Lax'
}> {
  return input
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const separator = part.indexOf('=')
      if (separator <= 0) return []
      const name = part.slice(0, separator).trim()
      const value = part.slice(separator + 1)
      if (!name) return []
      return [{ name, value, url: `${QWEN_ORIGIN}/`, secure: true, sameSite: 'Lax' as const }]
    })
}

function browserSafeHeaders(headers: Record<string, unknown>): Record<string, string> {
  const allowed = new Set([
    'accept',
    'content-type',
    'version',
    'source',
    'x-request-id',
    'timezone',
  ])
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([key, value]) => allowed.has(key.toLowerCase()) && typeof value === 'string')
      .map(([key, value]) => [key, String(value)]),
  )
}

function qwenPath(url: string): string {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'chat.qwen.ai') {
    throw browserError('Qwen AI Playwright transport rejected a non-Qwen request')
  }
  return `${parsed.pathname}${parsed.search}`
}

export class QwenAiLocalPlaywrightTransport {
  private sessions = new Map<string, Promise<BrowserSession>>()
  private tasks = new Map<string, PendingTask>()

  isAvailable(): boolean {
    return Boolean(findChromiumExecutable())
  }

  async execute(
    account: Account,
    url: string,
    payload: unknown,
    options: Record<string, any>,
  ): Promise<AxiosResponse | undefined> {
    if (!this.isAvailable()) return undefined
    const session = await this.ensureSession(account)
    if (await this.hasVerificationPrompt(session.page)) {
      throw verificationError()
    }

    const taskId = randomUUID()
    const stream = new PassThrough()
    const serializedPayload = typeof payload === 'string' ? payload : JSON.stringify(payload)
    const requestPath = qwenPath(url)
    const headers = {
      ...browserSafeHeaders(options.headers || {}),
      Authorization: `Bearer ${readCredential(account, 'token')}`,
      source: 'desktop',
    }

    const responsePromise = new Promise<AxiosResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.failTask(taskId, browserError('Qwen AI Playwright transport did not receive a response in time', 'qwen_ai_playwright_timeout', 504))
      }, RESPONSE_START_TIMEOUT_MS)
      if (typeof timer.unref === 'function') timer.unref()
      const pending: PendingTask = {
        accountId: account.id,
        stream,
        started: false,
        resolve,
        reject,
        timer,
      }
      this.tasks.set(taskId, pending)

      const signal = options.signal as AbortSignal | undefined
      if (signal) {
        const onAbort = () => this.failTask(taskId, browserError('Qwen AI Playwright request was cancelled', 'qwen_ai_playwright_cancelled', 499))
        signal.addEventListener('abort', onAbort, { once: true })
        pending.abortCleanup = () => signal.removeEventListener('abort', onAbort)
        if (signal.aborted) onAbort()
      }
    })

    if (!this.tasks.has(taskId)) return responsePromise

    session.lastUsedAt = Date.now()
    void session.page.evaluate(async (request) => {
      const emit = (window as any).__chat2apiQwenEmit as (event: BrowserEvent) => Promise<void>
      try {
        const response = await fetch(request.path, {
          method: 'POST',
          credentials: 'include',
          headers: request.headers,
          body: request.payload,
        })
        await emit({
          taskId: request.taskId,
          type: 'start',
          status: response.status,
          headers: {
            'content-type': response.headers.get('content-type') || '',
            'retry-after': response.headers.get('retry-after') || '',
          },
        })

        if (!response.body) {
          const bytes = new Uint8Array(await response.arrayBuffer())
          await emit({ taskId: request.taskId, type: 'chunk', data: bytesToBase64(bytes) })
          await emit({ taskId: request.taskId, type: 'end' })
          return
        }

        const reader = response.body.getReader()
        while (true) {
          const part = await reader.read()
          if (part.done) break
          if (part.value?.length) {
            await emit({ taskId: request.taskId, type: 'chunk', data: bytesToBase64(part.value) })
          }
        }
        await emit({ taskId: request.taskId, type: 'end' })
      } catch (error) {
        await emit({
          taskId: request.taskId,
          type: 'error',
          message: String((error as Error)?.message || error).slice(0, 300),
        }).catch(() => undefined)
      }

      function bytesToBase64(bytes: Uint8Array): string {
        let binary = ''
        const step = 32_768
        for (let index = 0; index < bytes.length; index += step) {
          binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + step, bytes.length)))
        }
        return btoa(binary)
      }
    }, {
      taskId,
      path: requestPath,
      headers,
      payload: serializedPayload,
    }).catch(async (error) => {
      await new Promise((resolve) => setTimeout(resolve, 500))
      if (await this.hasVerificationPrompt(session.page).catch(() => false)) {
        session.lastError = 'Qwen AI requires browser verification'
        this.failTask(taskId, verificationError())
      } else {
        this.failTask(taskId, browserError(`Qwen AI Playwright execution failed: ${error instanceof Error ? error.message : String(error)}`))
      }
    })

    return responsePromise
  }

  async startVerification(account: Account): Promise<QwenAiBrowserStatus> {
    if (!this.isAvailable()) return this.unavailableStatus()
    const session = await this.ensureSession(account)
    if (await this.hasVerificationPrompt(session.page)) return this.sessionStatus(session, true)

    const token = readCredential(account, 'token')
    const version = readCredential(account, 'qwenWebVersion') || '0.2.86'
    try {
      const result = await session.page.evaluate(async ({ token, version }) => {
        const response = await fetch('/api/v2/chats/new', {
          method: 'POST',
          credentials: 'include',
          headers: {
            Accept: 'application/json, text/plain, */*',
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            source: 'desktop',
            Version: version,
          },
          body: JSON.stringify({
            title: 'Chat2API browser verification',
            models: ['qwen3.7-plus'],
            chat_mode: 'normal',
            chat_type: 't2t',
            timestamp: Date.now(),
            project_id: '',
          }),
        })
        const contentType = response.headers.get('content-type') || ''
        if (!contentType.includes('json')) return { verified: false }
        const body = await response.json().catch(() => undefined)
        return { verified: Boolean(body?.data?.id) }
      }, { token, version })
      session.lastError = result.verified ? undefined : 'Qwen AI did not accept the browser session'
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 800))
    }
    const verificationRequired = await this.hasVerificationPrompt(session.page)
    return this.sessionStatus(session, verificationRequired)
  }

  async status(account: Account): Promise<QwenAiBrowserStatus> {
    if (!this.isAvailable()) return this.unavailableStatus()
    const session = await this.ensureSession(account)
    return this.sessionStatus(session, await this.hasVerificationPrompt(session.page))
  }

  async screenshot(account: Account): Promise<Buffer> {
    if (!this.isAvailable()) throw browserError('Chromium is not available for Qwen AI verification', 'qwen_ai_playwright_unavailable', 503)
    const session = await this.ensureSession(account)
    return session.page.screenshot({ type: 'png' })
  }

  async drag(account: Account, points: QwenAiBrowserDragPoint[]): Promise<QwenAiBrowserStatus> {
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
    const verificationRequired = await this.hasVerificationPrompt(session.page)
    session.lastError = verificationRequired ? 'Verification is still required; retry the puzzle' : undefined
    return this.sessionStatus(session, verificationRequired)
  }

  private async ensureSession(account: Account): Promise<BrowserSession> {
    const fingerprint = credentialFingerprint(account)
    const existingPromise = this.sessions.get(account.id)
    if (existingPromise) {
      const existing = await existingPromise
      if (existing.credentialFingerprint === fingerprint && !existing.page.isClosed()) return existing
      await existing.context.close().catch(() => undefined)
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
    if (!executablePath) throw browserError('Chromium is not installed for Qwen AI Playwright transport', 'qwen_ai_playwright_unavailable', 503)
    const userDataDir = profileDirectory(account.id)
    fs.mkdirSync(userDataDir, { recursive: true })

    const context = await chromium.launchPersistentContext(userDataDir, {
      executablePath,
      headless: true,
      viewport: VIEWPORT,
      locale: 'en-US',
      timezoneId: process.env.QWEN_AI_BROWSER_TIMEZONE || 'Asia/Shanghai',
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-sandbox',
      ],
    })

    const cookies = parseCookies(readCredential(account, 'cookies'))
    if (cookies.length) await context.addCookies(cookies)
    const token = readCredential(account, 'token')
    const x5secStorage = readCredential(account, 'x5secStorage')
    await context.addInitScript(({ token, x5secStorage }) => {
      try {
        Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => undefined })
        if (location.hostname === 'chat.qwen.ai') {
          if (token) localStorage.setItem('token', token)
          if (x5secStorage) localStorage.setItem('x5secStroage', x5secStorage)
        }
      } catch {}
    }, { token, x5secStorage })

    const pages = context.pages()
    const page = pages[0] || await context.newPage()
    const session: BrowserSession = {
      accountId: account.id,
      credentialFingerprint: fingerprint,
      context,
      page,
      ready: false,
      lastUsedAt: Date.now(),
    }
    await page.exposeBinding('__chat2apiQwenEmit', async (_source, event: BrowserEvent) => {
      this.handleEvent(account.id, event)
    })
    await page.goto(`${QWEN_ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForFunction(() => Boolean(
      (window as any).baxiaCommon
      && (window as any).__baxia__?.getFYModule?.getUidToken?.(),
    ), null, { timeout: BAXIA_READY_TIMEOUT_MS })
    await page.mouse.move(180, 140)
    await page.mouse.move(1040, 720, { steps: 18 })
    session.ready = true
    return session
  }

  private handleEvent(accountId: string, event: BrowserEvent): void {
    const task = this.tasks.get(event.taskId)
    if (!task || task.accountId !== accountId) return
    if (event.type === 'start') {
      if (task.started) return
      clearTimeout(task.timer)
      task.started = true
      task.resolve({
        status: Number.isFinite(event.status) ? event.status : 502,
        statusText: '',
        headers: event.headers || {},
        config: {} as AxiosResponse['config'],
        data: task.stream,
      })
      return
    }
    if (event.type === 'chunk') {
      if (task.started) task.stream.write(Buffer.from(event.data, 'base64'))
      return
    }
    if (event.type === 'end') {
      if (task.started) task.stream.end()
      this.finishTask(event.taskId)
      return
    }
    this.failTask(event.taskId, browserError(`Qwen AI Playwright stream failed${event.message ? `: ${event.message}` : ''}`))
  }

  private failTask(taskId: string, error: Error): void {
    const task = this.tasks.get(taskId)
    if (!task) return
    clearTimeout(task.timer)
    task.abortCleanup?.()
    if (task.started) task.stream.destroy(error)
    else task.reject(error)
    this.tasks.delete(taskId)
  }

  private finishTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task) return
    clearTimeout(task.timer)
    task.abortCleanup?.()
    this.tasks.delete(taskId)
  }

  private async hasVerificationPrompt(page: Page): Promise<boolean> {
    if (page.isClosed()) return false
    return page.getByText('Access Verification', { exact: true }).isVisible().catch(() => false)
  }

  private sessionStatus(session: BrowserSession, verificationRequired: boolean): QwenAiBrowserStatus {
    return {
      available: true,
      initialized: session.ready,
      verificationRequired,
      viewport: VIEWPORT,
      ...(session.lastError ? { lastError: session.lastError } : {}),
    }
  }

  private unavailableStatus(): QwenAiBrowserStatus {
    return {
      available: false,
      initialized: false,
      verificationRequired: false,
      viewport: VIEWPORT,
      lastError: 'Chromium is not available in this deployment',
    }
  }
}

type QwenAiBrowserMode = 'off' | 'local' | 'sidecar'

function configuredBrowserMode(localAvailable: boolean): QwenAiBrowserMode {
  if (process.env.CHAT2API_QWEN_AI_PLAYWRIGHT === '0') return 'off'
  const configured = process.env.CHAT2API_QWEN_AI_BROWSER_MODE?.trim().toLowerCase()
  if (configured === 'off' || configured === 'disabled' || configured === '0') return 'off'
  if (configured === 'sidecar' || configured === 'remote') return 'sidecar'
  if (configured === 'local') return 'local'
  if (process.env.QWEN_AI_BROWSER_SIDECAR_URL?.trim()) return 'sidecar'
  return localAvailable ? 'local' : 'off'
}

function unavailableStatus(message: string): QwenAiBrowserStatus {
  return {
    available: false,
    initialized: false,
    verificationRequired: false,
    viewport: VIEWPORT,
    lastError: message,
  }
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
    credentials: { ...account.credentials },
  }
}

async function readSidecarError(response: AxiosResponse): Promise<Error> {
  let body = ''
  const data = response.data as NodeJS.ReadableStream | undefined
  if (data && typeof data.on === 'function') {
    body = await new Promise<string>((resolve) => {
      const chunks: Buffer[] = []
      let length = 0
      data.on('data', (chunk: Buffer | string) => {
        if (length >= 65_536) return
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        chunks.push(value.subarray(0, Math.max(0, 65_536 - length)))
        length += value.length
      })
      data.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      data.on('error', () => resolve(''))
    })
  }
  let parsed: { error?: { code?: string; message?: string } } | undefined
  try {
    parsed = JSON.parse(body)
  } catch {}
  return browserError(
    parsed?.error?.message || `Qwen AI browser sidecar returned HTTP ${response.status}`,
    parsed?.error?.code || 'qwen_ai_browser_sidecar_failed',
    response.status || 502,
  )
}

export class QwenAiRemotePlaywrightTransport {
  isAvailable(): boolean {
    return Boolean(sidecarBaseUrl())
  }

  async execute(
    account: Account,
    url: string,
    payload: unknown,
    options: Record<string, any>,
  ): Promise<AxiosResponse | undefined> {
    const baseUrl = sidecarBaseUrl()
    if (!baseUrl) return undefined
    try {
      const response = await axios.post(`${baseUrl}/v1/execute`, {
        account: accountForSidecar(account),
        url,
        payload,
        options: { headers: { ...(options.headers || {}) } },
      }, {
        headers: sidecarHeaders(),
        responseType: 'stream',
        validateStatus: () => true,
        timeout: SIDECAR_REQUEST_TIMEOUT_MS,
        signal: options.signal,
        proxy: false,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      })
      if (response.status >= 400 && response.headers['x-chat2api-browser-error']) {
        throw await readSidecarError(response)
      }
      return response
    } catch (error) {
      if (isBrowserError(error)) throw error
      throw browserError(
        `Qwen AI browser sidecar is unavailable: ${error instanceof Error ? error.message : String(error)}`,
        'qwen_ai_browser_sidecar_unavailable',
        503,
      )
    }
  }

  async startVerification(account: Account): Promise<QwenAiBrowserStatus> {
    return this.jsonRequest('/v1/verification/start', account)
  }

  async status(account: Account): Promise<QwenAiBrowserStatus> {
    return this.jsonRequest('/v1/status', account)
  }

  async screenshot(account: Account): Promise<Buffer> {
    const response = await this.request('/v1/screenshot', { account: accountForSidecar(account) }, 'arraybuffer')
    return Buffer.from(response.data)
  }

  async drag(account: Account, points: QwenAiBrowserDragPoint[]): Promise<QwenAiBrowserStatus> {
    return this.jsonRequest('/v1/verification/drag', account, { points })
  }

  private async jsonRequest(
    endpoint: string,
    account: Account,
    extra: Record<string, unknown> = {},
  ): Promise<QwenAiBrowserStatus> {
    const response = await this.request(endpoint, { account: accountForSidecar(account), ...extra }, 'json')
    return response.data.data as QwenAiBrowserStatus
  }

  private async request(
    endpoint: string,
    body: Record<string, unknown>,
    responseType: 'json' | 'arraybuffer',
  ): Promise<AxiosResponse> {
    const baseUrl = sidecarBaseUrl()
    if (!baseUrl) throw browserError('Qwen AI browser sidecar is disabled', 'qwen_ai_browser_disabled', 503)
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
          payload?.error?.message || `Qwen AI browser sidecar returned HTTP ${response.status}`,
          payload?.error?.code || 'qwen_ai_browser_sidecar_failed',
          response.status,
        )
      }
      return response
    } catch (error) {
      if (isBrowserError(error)) throw error
      throw browserError(
        `Qwen AI browser sidecar is unavailable: ${error instanceof Error ? error.message : String(error)}`,
        'qwen_ai_browser_sidecar_unavailable',
        503,
      )
    }
  }
}

export class QwenAiPlaywrightTransport {
  private readonly local = new QwenAiLocalPlaywrightTransport()
  private readonly remote = new QwenAiRemotePlaywrightTransport()

  private mode(): QwenAiBrowserMode {
    return configuredBrowserMode(this.local.isAvailable())
  }

  isAvailable(): boolean {
    const mode = this.mode()
    return mode === 'local' ? this.local.isAvailable() : mode === 'sidecar' && this.remote.isAvailable()
  }

  async execute(
    account: Account,
    url: string,
    payload: unknown,
    options: Record<string, any>,
  ): Promise<AxiosResponse | undefined> {
    const mode = this.mode()
    if (mode === 'local') return this.local.execute(account, url, payload, options)
    if (mode === 'sidecar') return this.remote.execute(account, url, payload, options)
    return undefined
  }

  async startVerification(account: Account): Promise<QwenAiBrowserStatus> {
    const mode = this.mode()
    if (mode === 'local') return this.local.startVerification(account)
    if (mode === 'sidecar') return this.remote.startVerification(account)
    return unavailableStatus('Qwen AI browser transport is disabled')
  }

  async status(account: Account): Promise<QwenAiBrowserStatus> {
    const mode = this.mode()
    if (mode === 'local') return this.local.status(account)
    if (mode === 'sidecar') return this.remote.status(account)
    return unavailableStatus('Qwen AI browser transport is disabled')
  }

  async screenshot(account: Account): Promise<Buffer> {
    const mode = this.mode()
    if (mode === 'local') return this.local.screenshot(account)
    if (mode === 'sidecar') return this.remote.screenshot(account)
    throw browserError('Qwen AI browser transport is disabled', 'qwen_ai_browser_disabled', 503)
  }

  async drag(account: Account, points: QwenAiBrowserDragPoint[]): Promise<QwenAiBrowserStatus> {
    const mode = this.mode()
    if (mode === 'local') return this.local.drag(account, points)
    if (mode === 'sidecar') return this.remote.drag(account, points)
    throw browserError('Qwen AI browser transport is disabled', 'qwen_ai_browser_disabled', 503)
  }
}

export const qwenAiPlaywrightTransport = new QwenAiPlaywrightTransport()
