import { createHash, randomBytes, randomUUID } from 'crypto'
import { PassThrough } from 'stream'
import type { AxiosResponse } from 'axios'

const BRIDGE_SESSION_TTL_MS = 12 * 60 * 60 * 1000
const BRIDGE_ACTIVE_WINDOW_MS = 45 * 1000
const BRIDGE_POLL_TIMEOUT_MS = 20 * 1000
const BRIDGE_START_TIMEOUT_MS = 45 * 1000

export interface QwenAiBrowserBridgeTask {
  id: string
  method: 'POST'
  path: string
  headers: Record<string, string>
  payload: string
}

type BridgeSession = {
  bridgeToken: string
  credentialKey: string
  createdAt: number
  expiresAt: number
  lastSeenAt: number
  pendingTaskIds: string[]
}

type PendingPoll = {
  resolve: (task: QwenAiBrowserBridgeTask | null) => void
  timer: NodeJS.Timeout
}

type PendingTask = {
  sessionToken: string
  wire: QwenAiBrowserBridgeTask
  stream: PassThrough
  started: boolean
  resolve: (response: AxiosResponse) => void
  reject: (error: Error) => void
  startTimer: NodeJS.Timeout
  abortCleanup?: () => void
}

export type QwenAiBrowserBridgeRegistration = {
  bridgeToken: string
  expiresAt: number
}

export type QwenAiBrowserBridgeEvent =
  | { taskId: string; type: 'start'; status: number; headers?: Record<string, string> }
  | { taskId: string; type: 'chunk'; data: string }
  | { taskId: string; type: 'end' }
  | { taskId: string; type: 'error'; message?: string }

function credentialKey(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

function bridgeError(message: string, status = 502): Error {
  const error = new Error(message) as Error & { status?: number; code?: string; accountFault?: boolean }
  error.status = status
  error.code = 'qwen_ai_browser_bridge_failed'
  error.accountFault = false
  return error
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
    throw bridgeError('Qwen AI browser bridge rejected a non-Qwen request')
  }
  return `${parsed.pathname}${parsed.search}`
}

export class QwenAiBrowserBridgeManager {
  private sessions = new Map<string, BridgeSession>()
  private sessionTokensByCredential = new Map<string, string>()
  private polls = new Map<string, PendingPoll>()
  private tasks = new Map<string, PendingTask>()

  register(token: string): QwenAiBrowserBridgeRegistration {
    const key = credentialKey(token)
    const previousToken = this.sessionTokensByCredential.get(key)
    if (previousToken) this.removeSession(previousToken)

    const now = Date.now()
    const bridgeToken = randomBytes(32).toString('base64url')
    const session: BridgeSession = {
      bridgeToken,
      credentialKey: key,
      createdAt: now,
      expiresAt: now + BRIDGE_SESSION_TTL_MS,
      lastSeenAt: now,
      pendingTaskIds: [],
    }
    this.sessions.set(bridgeToken, session)
    this.sessionTokensByCredential.set(key, bridgeToken)
    return { bridgeToken, expiresAt: session.expiresAt }
  }

  hasActiveSession(token: string, now = Date.now()): boolean {
    const session = this.findSession(token, now)
    return Boolean(session && now - session.lastSeenAt <= BRIDGE_ACTIVE_WINDOW_MS)
  }

  async poll(bridgeToken: string): Promise<QwenAiBrowserBridgeTask | null | undefined> {
    const session = this.getSession(bridgeToken)
    if (!session) return undefined

    const touched = { ...session, lastSeenAt: Date.now() }
    const immediateTaskId = touched.pendingTaskIds[0]
    if (immediateTaskId) {
      this.sessions.set(bridgeToken, {
        ...touched,
        pendingTaskIds: touched.pendingTaskIds.slice(1),
      })
      return this.tasks.get(immediateTaskId)?.wire ?? null
    }
    this.sessions.set(bridgeToken, touched)

    const existing = this.polls.get(bridgeToken)
    if (existing) {
      clearTimeout(existing.timer)
      existing.resolve(null)
    }

    return new Promise<QwenAiBrowserBridgeTask | null>((resolve) => {
      const timer = setTimeout(() => {
        if (this.polls.get(bridgeToken)?.timer === timer) this.polls.delete(bridgeToken)
        resolve(null)
      }, BRIDGE_POLL_TIMEOUT_MS)
      if (typeof timer.unref === 'function') timer.unref()
      this.polls.set(bridgeToken, { resolve, timer })
    })
  }

  async execute(
    token: string,
    url: string,
    payload: unknown,
    options: Record<string, any>,
  ): Promise<AxiosResponse | undefined> {
    const session = this.findSession(token)
    if (!session || Date.now() - session.lastSeenAt > BRIDGE_ACTIVE_WINDOW_MS) return undefined

    const id = randomUUID()
    const stream = new PassThrough()
    const serializedPayload = typeof payload === 'string' ? payload : JSON.stringify(payload)
    const wire: QwenAiBrowserBridgeTask = {
      id,
      method: 'POST',
      path: qwenPath(url),
      headers: {
        ...browserSafeHeaders(options.headers || {}),
        source: 'web',
      },
      payload: serializedPayload,
    }

    const responsePromise = new Promise<AxiosResponse>((resolve, reject) => {
      const startTimer = setTimeout(() => {
        this.failTask(id, bridgeError('Qwen AI browser bridge did not accept the request in time', 504))
      }, BRIDGE_START_TIMEOUT_MS)
      if (typeof startTimer.unref === 'function') startTimer.unref()

      const pending: PendingTask = {
        sessionToken: session.bridgeToken,
        wire,
        stream,
        started: false,
        resolve,
        reject,
        startTimer,
      }

      this.tasks.set(id, pending)

      const signal = options.signal as AbortSignal | undefined
      if (signal) {
        const onAbort = () => this.failTask(id, bridgeError('Qwen AI browser bridge request was cancelled', 499))
        signal.addEventListener('abort', onAbort, { once: true })
        pending.abortCleanup = () => signal.removeEventListener('abort', onAbort)
        if (signal.aborted) onAbort()
      }

    })

    if (!this.tasks.has(id)) return responsePromise

    const waitingPoll = this.polls.get(session.bridgeToken)
    if (waitingPoll) {
      clearTimeout(waitingPoll.timer)
      this.polls.delete(session.bridgeToken)
      waitingPoll.resolve(wire)
    } else {
      this.sessions.set(session.bridgeToken, {
        ...session,
        pendingTaskIds: [...session.pendingTaskIds, id],
      })
    }

    return responsePromise
  }

  handleEvent(bridgeToken: string, event: QwenAiBrowserBridgeEvent): boolean {
    const session = this.getSession(bridgeToken)
    const task = this.tasks.get(event.taskId)
    if (!session || !task || task.sessionToken !== bridgeToken) return false

    this.sessions.set(bridgeToken, { ...session, lastSeenAt: Date.now() })
    if (event.type === 'start') {
      if (task.started) return true
      clearTimeout(task.startTimer)
      const updated = { ...task, started: true }
      this.tasks.set(event.taskId, updated)
      task.resolve({
        status: Number.isFinite(event.status) ? event.status : 502,
        statusText: '',
        headers: event.headers || {},
        config: {},
        data: task.stream,
      })
      return true
    }

    if (event.type === 'chunk') {
      if (!task.started) return false
      try {
        task.stream.write(Buffer.from(event.data, 'base64'))
        return true
      } catch {
        this.failTask(event.taskId, bridgeError('Qwen AI browser bridge returned an invalid stream chunk'))
        return false
      }
    }

    if (event.type === 'end') {
      if (!task.started) return false
      task.stream.end()
      this.finishTask(event.taskId)
      return true
    }

    this.failTask(
      event.taskId,
      bridgeError(`Qwen AI browser bridge failed${event.message ? `: ${event.message}` : ''}`),
    )
    return true
  }

  private findSession(token: string, now = Date.now()): BridgeSession | undefined {
    const bridgeToken = this.sessionTokensByCredential.get(credentialKey(token))
    if (!bridgeToken) return undefined
    return this.getSession(bridgeToken, now)
  }

  private getSession(bridgeToken: string, now = Date.now()): BridgeSession | undefined {
    const session = this.sessions.get(bridgeToken)
    if (!session) return undefined
    if (now > session.expiresAt) {
      this.removeSession(bridgeToken)
      return undefined
    }
    return session
  }

  private failTask(id: string, error: Error): void {
    const task = this.tasks.get(id)
    if (!task) return
    clearTimeout(task.startTimer)
    task.abortCleanup?.()
    if (task.started) task.stream.destroy(error)
    else task.reject(error)
    this.tasks.delete(id)
  }

  private finishTask(id: string): void {
    const task = this.tasks.get(id)
    if (!task) return
    clearTimeout(task.startTimer)
    task.abortCleanup?.()
    this.tasks.delete(id)
  }

  private removeSession(bridgeToken: string): void {
    const session = this.sessions.get(bridgeToken)
    if (!session) return
    const poll = this.polls.get(bridgeToken)
    if (poll) {
      clearTimeout(poll.timer)
      poll.resolve(null)
      this.polls.delete(bridgeToken)
    }
    for (const task of this.tasks.values()) {
      if (task.sessionToken === bridgeToken) {
        this.failTask(task.wire.id, bridgeError('Qwen AI browser bridge session expired', 503))
      }
    }
    this.sessions.delete(bridgeToken)
    if (this.sessionTokensByCredential.get(session.credentialKey) === bridgeToken) {
      this.sessionTokensByCredential.delete(session.credentialKey)
    }
  }
}

export const qwenAiBrowserBridgeManager = new QwenAiBrowserBridgeManager()
