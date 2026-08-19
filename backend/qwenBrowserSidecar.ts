import { timingSafeEqual } from 'crypto'
import Router from '@koa/router'
import Koa, { type Context } from 'koa'
import bodyParser from 'koa-bodyparser'
import type { Account } from '../shared/types'
import {
  QwenAiLocalPlaywrightTransport,
  type QwenAiBrowserDragPoint,
} from './providers/qwen-ai/playwrightTransport'
import {
  ZaiLocalPlaywrightTransport,
  type ZaiBrowserDragPoint,
} from './providers/zai/playwrightTransport'

const transport = new QwenAiLocalPlaywrightTransport()
const zaiTransport = new ZaiLocalPlaywrightTransport()
const port = Number.parseInt(process.env.QWEN_AI_BROWSER_SIDECAR_PORT || '3000', 10)
const host = process.env.QWEN_AI_BROWSER_SIDECAR_HOST || '0.0.0.0'
const secret = process.env.QWEN_AI_BROWSER_SIDECAR_SECRET?.trim() || ''

function authorized(ctx: Context): boolean {
  if (!secret) return false
  const value = ctx.get('Authorization')
  const supplied = value.startsWith('Bearer ') ? value.slice(7) : ''
  const expectedBuffer = Buffer.from(secret)
  const suppliedBuffer = Buffer.from(supplied)
  return expectedBuffer.length === suppliedBuffer.length
    && timingSafeEqual(expectedBuffer, suppliedBuffer)
}

function requireAuthorization(ctx: Context): boolean {
  if (authorized(ctx)) return true
  ctx.status = 401
  ctx.body = {
    success: false,
    error: { code: 'unauthorized', message: 'Invalid Qwen browser sidecar secret' },
  }
  return false
}

function readProviderAccount(ctx: Context, providerId: 'qwen-ai' | 'zai'): Account | undefined {
  const raw = (ctx.request.body as { account?: unknown } | undefined)?.account
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const candidate = raw as Partial<Account>
  if (
    typeof candidate.id !== 'string'
    || candidate.id.length === 0
    || candidate.id.length > 256
    || candidate.providerId !== providerId
    || !candidate.credentials
    || typeof candidate.credentials !== 'object'
    || Array.isArray(candidate.credentials)
  ) return undefined

  const credentialEntries = Object.entries(candidate.credentials)
  if (
    credentialEntries.length > 64
    || credentialEntries.some(([key, value]) => key.length > 128 || typeof value !== 'string' || value.length > 1_000_000)
  ) return undefined

  const now = Date.now()
  return {
    id: candidate.id,
    providerId,
    name: typeof candidate.name === 'string' ? candidate.name.slice(0, 256) : candidate.id,
    email: typeof candidate.email === 'string' ? candidate.email.slice(0, 512) : undefined,
    credentials: Object.fromEntries(credentialEntries),
    status: 'active',
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : now,
  }
}

function readAccount(ctx: Context): Account | undefined {
  return readProviderAccount(ctx, 'qwen-ai')
}

function readZaiAccount(ctx: Context): Account | undefined {
  return readProviderAccount(ctx, 'zai')
}

function requireAccount(ctx: Context): Account | undefined {
  const account = readAccount(ctx)
  if (account) return account
  ctx.status = 400
  ctx.body = {
    success: false,
    error: { code: 'invalid_request', message: 'A valid Qwen AI account is required' },
  }
  return undefined
}

function requireZaiAccount(ctx: Context): Account | undefined {
  const account = readZaiAccount(ctx)
  const token = account?.credentials.token || ''
  if (account && token.startsWith('eyJ') && token.split('.').length === 3) return account
  ctx.status = 400
  ctx.body = {
    success: false,
    error: { code: 'invalid_request', message: 'A valid Z.ai account is required' },
  }
  return undefined
}

async function withZaiLog(route: string, ctx: Context, work: () => Promise<void>): Promise<void> {
  const startedAt = Date.now()
  console.log(`[Z.ai] ${route} begin`)
  try {
    await work()
    console.log(`[Z.ai] ${route} end ${Date.now() - startedAt}ms status=${ctx.status}`)
  } catch (error) {
    console.warn(`[Z.ai] ${route} failed ${Date.now() - startedAt}ms`, error instanceof Error ? error.message : error)
    throw error
  }
}

function errorResponse(ctx: Context, error: unknown): void {
  const typed = error as Error & { status?: number; code?: string }
  ctx.status = typed.status || 500
  ctx.set('X-Chat2API-Browser-Error', '1')
  ctx.body = {
    success: false,
    error: {
      code: typed.code || 'qwen_ai_browser_sidecar_failed',
      message: typed.message || 'Qwen AI browser sidecar operation failed',
    },
  }
}

const router = new Router()

router.get('/health', (ctx: Context) => {
  const chromium = transport.isAvailable() || zaiTransport.isAvailable()
  ctx.body = {
    status: chromium ? 'ok' : 'unavailable',
    chromium,
  }
  ctx.status = chromium ? 200 : 503
})

router.post('/v1/execute', async (ctx: Context) => {
  if (!requireAuthorization(ctx)) return
  const account = requireAccount(ctx)
  if (!account) return
  const body = ctx.request.body as {
    url?: unknown
    payload?: unknown
    options?: { headers?: Record<string, unknown> }
  }
  if (typeof body.url !== 'string') {
    ctx.status = 400
    ctx.body = {
      success: false,
      error: { code: 'invalid_request', message: 'A Qwen AI request URL is required' },
    }
    return
  }
  try {
    const response = await transport.execute(account, body.url, body.payload, {
      headers: body.options?.headers || {},
    })
    if (!response) throw Object.assign(new Error('Chromium is not available'), {
      status: 503,
      code: 'qwen_ai_playwright_unavailable',
    })
    ctx.status = response.status
    const contentType = response.headers['content-type']
    const retryAfter = response.headers['retry-after']
    if (contentType) ctx.set('Content-Type', String(contentType))
    if (retryAfter) ctx.set('Retry-After', String(retryAfter))
    ctx.body = response.data
  } catch (error) {
    errorResponse(ctx, error)
  }
})

router.post('/v1/status', async (ctx: Context) => {
  if (!requireAuthorization(ctx)) return
  const account = requireAccount(ctx)
  if (!account) return
  try {
    ctx.body = { success: true, data: await transport.status(account) }
  } catch (error) {
    errorResponse(ctx, error)
  }
})

router.post('/v1/verification/start', async (ctx: Context) => {
  if (!requireAuthorization(ctx)) return
  const account = requireAccount(ctx)
  if (!account) return
  try {
    ctx.body = { success: true, data: await transport.startVerification(account) }
  } catch (error) {
    errorResponse(ctx, error)
  }
})

router.post('/v1/screenshot', async (ctx: Context) => {
  if (!requireAuthorization(ctx)) return
  const account = requireAccount(ctx)
  if (!account) return
  try {
    ctx.set('Cache-Control', 'no-store')
    ctx.type = 'image/png'
    ctx.body = await transport.screenshot(account)
  } catch (error) {
    errorResponse(ctx, error)
  }
})

router.post('/v1/verification/drag', async (ctx: Context) => {
  if (!requireAuthorization(ctx)) return
  const account = requireAccount(ctx)
  if (!account) return
  const points = (ctx.request.body as { points?: QwenAiBrowserDragPoint[] }).points
  if (!Array.isArray(points)) {
    ctx.status = 400
    ctx.body = {
      success: false,
      error: { code: 'invalid_request', message: 'Verification drag points are required' },
    }
    return
  }
  try {
    ctx.body = { success: true, data: await transport.drag(account, points) }
  } catch (error) {
    errorResponse(ctx, error)
  }
})

router.post('/v1/zai/mint', async (ctx: Context) => {
  if (!requireAuthorization(ctx)) return
  const account = requireZaiAccount(ctx)
  if (!account) return
  const force = Boolean((ctx.request.body as { force?: unknown } | undefined)?.force)
  await withZaiLog('mint', ctx, async () => {
    try {
      ctx.body = { success: true, data: await zaiTransport.mint(account, { force }) }
    } catch (error) {
      errorResponse(ctx, error)
    }
  })
})

router.post('/v1/zai/invalidate', async (ctx: Context) => {
  if (!requireAuthorization(ctx)) return
  const accountId = (ctx.request.body as { accountId?: unknown } | undefined)?.accountId
  if (typeof accountId !== 'string' || !accountId) {
    ctx.status = 400
    ctx.body = {
      success: false,
      error: { code: 'invalid_request', message: 'accountId is required' },
    }
    return
  }
  zaiTransport.invalidate(accountId)
  ctx.body = { success: true, data: { invalidated: true } }
})

router.post('/v1/zai/status', async (ctx: Context) => {
  if (!requireAuthorization(ctx)) return
  const account = requireZaiAccount(ctx)
  if (!account) return
  await withZaiLog('status', ctx, async () => {
    try {
      ctx.body = { success: true, data: await zaiTransport.status(account) }
    } catch (error) {
      errorResponse(ctx, error)
    }
  })
})

router.post('/v1/zai/verification/start', async (ctx: Context) => {
  if (!requireAuthorization(ctx)) return
  const account = requireZaiAccount(ctx)
  if (!account) return
  await withZaiLog('verification/start', ctx, async () => {
    try {
      ctx.body = { success: true, data: await zaiTransport.startVerification(account) }
    } catch (error) {
      errorResponse(ctx, error)
    }
  })
})

router.post('/v1/zai/screenshot', async (ctx: Context) => {
  if (!requireAuthorization(ctx)) return
  const account = requireZaiAccount(ctx)
  if (!account) return
  await withZaiLog('screenshot', ctx, async () => {
    try {
      ctx.set('Cache-Control', 'no-store')
      ctx.type = 'image/png'
      ctx.body = await zaiTransport.screenshot(account)
    } catch (error) {
      errorResponse(ctx, error)
    }
  })
})

router.post('/v1/zai/verification/drag', async (ctx: Context) => {
  if (!requireAuthorization(ctx)) return
  const account = requireZaiAccount(ctx)
  if (!account) return
  const points = (ctx.request.body as { points?: ZaiBrowserDragPoint[] }).points
  if (!Array.isArray(points)) {
    ctx.status = 400
    ctx.body = {
      success: false,
      error: { code: 'invalid_request', message: 'Verification drag points are required' },
    }
    return
  }
  try {
    ctx.body = { success: true, data: await zaiTransport.drag(account, points) }
  } catch (error) {
    errorResponse(ctx, error)
  }
})

async function main(): Promise<void> {
  if (!secret) throw new Error('QWEN_AI_BROWSER_SIDECAR_SECRET must not be empty')
  if (!Number.isFinite(port) || port < 1 || port > 65_535) {
    throw new Error('QWEN_AI_BROWSER_SIDECAR_PORT must be a valid TCP port')
  }
  if (!transport.isAvailable()) throw new Error('Chromium executable was not found')

  const app = new Koa()
  app.use(bodyParser({ jsonLimit: '100mb' }))
  app.use(router.routes())
  app.use(router.allowedMethods())
  const server = app.listen(port, host, () => {
    console.log(`[QwenBrowser] Sidecar listening on ${host}:${port}`)
  })

  const shutdown = (signal: string) => {
    console.log(`[QwenBrowser] Received ${signal}, shutting down`)
    server.close(() => process.exit(0))
  }
  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))
}

void main().catch((error) => {
  console.error('[QwenBrowser] Startup failed:', error)
  process.exit(1)
})
