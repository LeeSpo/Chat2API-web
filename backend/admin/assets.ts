import { existsSync, readFileSync } from 'fs'
import { extname, join, normalize, resolve, sep } from 'path'
import type Koa from 'koa'

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const API_PREFIXES = ['/v0/', '/v1/', '/v1beta/', '/upload/']

function resolveAdminDir(): string {
  return resolve(process.cwd(), 'out-admin')
}

function isInside(baseDir: string, targetPath: string): boolean {
  const normalizedBase = normalize(baseDir + sep)
  const normalizedTarget = normalize(targetPath)
  return normalizedTarget.startsWith(normalizedBase)
}

function isApiPath(path: string): boolean {
  if (path === '/health' || path === '/stats') {
    return true
  }
  return API_PREFIXES.some((prefix) => path.startsWith(prefix))
}

function sendFile(ctx: Koa.Context, filePath: string): void {
  ctx.type = CONTENT_TYPES[extname(filePath)] || 'application/octet-stream'
  ctx.body = readFileSync(filePath)
}

export function mountWebAdminAssets(app: Koa): void {
  app.use(async (ctx, next) => {
    if (ctx.path === '/admin' || ctx.path === '/admin/') {
      ctx.redirect('/')
      return
    }

    if (isApiPath(ctx.path)) {
      await next()
      return
    }

    const adminDir = resolveAdminDir()
    const indexPath = join(adminDir, 'admin.html')

    if (!existsSync(indexPath)) {
      await next()
      return
    }

    const rawPath = ctx.path === '/' ? 'admin.html' : decodeURIComponent(ctx.path.replace(/^\//, ''))
    const assetPath = join(adminDir, rawPath)

    if (rawPath && isInside(adminDir, assetPath) && existsSync(assetPath)) {
      sendFile(ctx, assetPath)
      return
    }

    sendFile(ctx, indexPath)
  })
}
