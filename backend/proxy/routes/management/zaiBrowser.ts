import Router from '@koa/router'
import type { Context } from 'koa'
import AccountManager from '../../../store/accounts'
import { managementAuthMiddleware } from '../../middleware/managementAuth'
import {
  zaiPlaywrightTransport,
  type ZaiBrowserDragPoint,
} from '../../../providers/zai/playwrightTransport'

const router = new Router({ prefix: '/v0/management/zai-browser' })

function errorResponse(ctx: Context, error: unknown): void {
  const typed = error as Error & { status?: number; code?: string }
  ctx.status = typed.status || 500
  ctx.body = {
    success: false,
    error: {
      code: typed.code || 'zai_browser_error',
      message: typed.message || 'Z.ai browser operation failed',
    },
  }
}

function getZaiAccount(ctx: Context) {
  const account = AccountManager.getById(ctx.params.accountId, true)
  if (!account || account.providerId !== 'zai') {
    ctx.status = 404
    ctx.body = {
      success: false,
      error: { code: 'account_not_found', message: 'Z.ai account not found' },
    }
    return undefined
  }
  return account
}

router.get('/accounts/:accountId/status', managementAuthMiddleware, async (ctx: Context) => {
  const account = getZaiAccount(ctx)
  if (!account) return
  try {
    ctx.body = { success: true, data: await zaiPlaywrightTransport.status(account) }
  } catch (error) {
    errorResponse(ctx, error)
  }
})

router.post('/accounts/:accountId/start', managementAuthMiddleware, async (ctx: Context) => {
  const account = getZaiAccount(ctx)
  if (!account) return
  try {
    ctx.body = { success: true, data: await zaiPlaywrightTransport.startVerification(account) }
  } catch (error) {
    errorResponse(ctx, error)
  }
})

router.post('/accounts/:accountId/mint', managementAuthMiddleware, async (ctx: Context) => {
  const account = getZaiAccount(ctx)
  if (!account) return
  try {
    ctx.body = { success: true, data: await zaiPlaywrightTransport.mint(account, { force: true }) }
  } catch (error) {
    errorResponse(ctx, error)
  }
})

router.get('/accounts/:accountId/screenshot', managementAuthMiddleware, async (ctx: Context) => {
  const account = getZaiAccount(ctx)
  if (!account) return
  try {
    const screenshot = await zaiPlaywrightTransport.screenshot(account)
    ctx.set('Cache-Control', 'no-store')
    ctx.type = 'image/png'
    ctx.body = screenshot
  } catch (error) {
    errorResponse(ctx, error)
  }
})

router.post('/accounts/:accountId/drag', managementAuthMiddleware, async (ctx: Context) => {
  const account = getZaiAccount(ctx)
  if (!account) return
  const points = (ctx.request.body as { points?: ZaiBrowserDragPoint[] } | undefined)?.points
  if (!Array.isArray(points)) {
    ctx.status = 400
    ctx.body = {
      success: false,
      error: { code: 'invalid_request', message: 'Missing verification drag points' },
    }
    return
  }
  try {
    ctx.body = { success: true, data: await zaiPlaywrightTransport.drag(account, points) }
  } catch (error) {
    errorResponse(ctx, error)
  }
})

export default router
