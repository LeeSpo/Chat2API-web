import Router from '@koa/router'
import type { Context } from 'koa'
import AccountManager from '../../../store/accounts'
import { managementAuthMiddleware } from '../../middleware/managementAuth'
import {
  qwenAiPlaywrightTransport,
  type QwenAiBrowserDragPoint,
} from '../../../providers/qwen-ai/playwrightTransport'

const router = new Router({ prefix: '/v0/management/qwen-ai-browser' })

function errorResponse(ctx: Context, error: unknown): void {
  const typed = error as Error & { status?: number; code?: string }
  ctx.status = typed.status || 500
  ctx.body = {
    success: false,
    error: {
      code: typed.code || 'qwen_ai_browser_error',
      message: typed.message || 'Qwen AI browser operation failed',
    },
  }
}

function getQwenAccount(ctx: Context) {
  const account = AccountManager.getById(ctx.params.accountId, true)
  if (!account || account.providerId !== 'qwen-ai') {
    ctx.status = 404
    ctx.body = {
      success: false,
      error: { code: 'account_not_found', message: 'Qwen AI account not found' },
    }
    return undefined
  }
  return account
}

router.get('/accounts/:accountId/status', managementAuthMiddleware, async (ctx: Context) => {
  const account = getQwenAccount(ctx)
  if (!account) return
  try {
    ctx.body = { success: true, data: await qwenAiPlaywrightTransport.status(account) }
  } catch (error) {
    errorResponse(ctx, error)
  }
})

router.post('/accounts/:accountId/start', managementAuthMiddleware, async (ctx: Context) => {
  const account = getQwenAccount(ctx)
  if (!account) return
  try {
    ctx.body = { success: true, data: await qwenAiPlaywrightTransport.startVerification(account) }
  } catch (error) {
    errorResponse(ctx, error)
  }
})

router.get('/accounts/:accountId/screenshot', managementAuthMiddleware, async (ctx: Context) => {
  const account = getQwenAccount(ctx)
  if (!account) return
  try {
    const screenshot = await qwenAiPlaywrightTransport.screenshot(account)
    ctx.set('Cache-Control', 'no-store')
    ctx.type = 'image/png'
    ctx.body = screenshot
  } catch (error) {
    errorResponse(ctx, error)
  }
})

router.post('/accounts/:accountId/drag', managementAuthMiddleware, async (ctx: Context) => {
  const account = getQwenAccount(ctx)
  if (!account) return
  const points = (ctx.request.body as { points?: QwenAiBrowserDragPoint[] } | undefined)?.points
  if (!Array.isArray(points)) {
    ctx.status = 400
    ctx.body = {
      success: false,
      error: { code: 'invalid_request', message: 'Missing verification drag points' },
    }
    return
  }
  try {
    ctx.body = { success: true, data: await qwenAiPlaywrightTransport.drag(account, points) }
  } catch (error) {
    errorResponse(ctx, error)
  }
})

export default router
