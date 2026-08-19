import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'

import {
  FALLBACK_X_FE_VERSION,
  createZaiFeVersionResolver,
  parseZaiFeVersion,
} from '../../backend/providers/zai/frontendVersion.ts'
import { toZaiUpstreamError, zaiVerificationRequiredError } from '../../backend/providers/zai/errors.ts'
import { ZaiStreamHandler } from '../../backend/providers/zai/adapter.ts'

test('parseZaiFeVersion reads the prod-fe version from chat.z.ai HTML', () => {
  const html = [
    '<script src="https://z-cdn.chatglm.cn/z-ai/frontend/prod-fe-1.1.88/assets/index-DoXury07.js"></script>',
    '<link href="https://z-cdn.chatglm.cn/z-ai/frontend/prod-fe-1.1.88/assets/index-URa9L_iT.css" />',
  ].join('\n')

  assert.equal(parseZaiFeVersion(html), 'prod-fe-1.1.88')
})

test('parseZaiFeVersion returns null when HTML has no frontend version', () => {
  assert.equal(parseZaiFeVersion('<html><body>Z.ai</body></html>'), null)
})

test('fallback X-FE-Version matches the current chat.z.ai frontend', () => {
  assert.equal(FALLBACK_X_FE_VERSION, 'prod-fe-1.1.88')
})

test('resolver prefers the live HTML version and caches it', async () => {
  let fetches = 0
  const resolve = createZaiFeVersionResolver({
    fetchHtml: async () => {
      fetches += 1
      return '<script src="/z-ai/frontend/prod-fe-1.1.90/assets/index.js"></script>'
    },
    now: () => 1_000,
    cacheMs: 60_000,
  })

  assert.equal(await resolve(), 'prod-fe-1.1.90')
  assert.equal(await resolve(), 'prod-fe-1.1.90')
  assert.equal(fetches, 1)
})

test('resolver falls back when HTML fetch fails or has no version', async () => {
  const failing = createZaiFeVersionResolver({
    fetchHtml: async () => {
      throw new Error('network down')
    },
  })
  assert.equal(await failing(), FALLBACK_X_FE_VERSION)

  const empty = createZaiFeVersionResolver({
    fetchHtml: async () => '<html></html>',
  })
  assert.equal(await empty(), FALLBACK_X_FE_VERSION)
})

test('maps refresh-page errors to a frontend-version API error', () => {
  const mapped = toZaiUpstreamError({ detail: '请刷新页面以更新应用后重试。' })

  assert.equal(mapped.code, 'frontend_version_outdated')
  assert.equal(mapped.status, 409)
  assert.match(mapped.message, /请刷新页面以更新应用后重试/)
})

test('maps captcha risk-control errors to a captcha API error', () => {
  const mapped = toZaiUpstreamError({
    code: 'FRONTEND_CAPTCHA_REQUIRED',
    detail: 'Please complete verification',
  })

  assert.equal(mapped.code, 'frontend_captcha_required')
  assert.equal(mapped.status, 403)
  assert.match(mapped.message, /captcha|verification/i)
})

test('classifies refresh-page text as captcha when Z.ai also sends a captcha code', () => {
  const mapped = toZaiUpstreamError({
    captcha_error_type: 'missing_param',
    code: 'FRONTEND_CAPTCHA_REQUIRED',
    detail: '请刷新页面以更新应用后重试。',
    error_code: 'FRONTEND_CAPTCHA_REQUIRED',
  })

  assert.equal(mapped.code, 'frontend_captcha_required')
  assert.equal(mapped.status, 403)
  assert.match(mapped.message, /请刷新页面以更新应用后重试/)
})

test('verification-required error tells the user to open the admin browser dialog', () => {
  const error = zaiVerificationRequiredError()
  assert.equal(error.code, 'zai_browser_verification_required')
  assert.equal(error.status, 503)
  assert.match(error.message, /浏览器验证/)
})

test('non-stream handler rejects refresh-page errors instead of returning assistant content', async () => {
  const handler = new ZaiStreamHandler('glm-4.7')
  const stream = Readable.from([
    'data: {"type":"chat:completion","data":{"error":{"detail":"请刷新页面以更新应用后重试。"}}}\n\n',
  ])

  await assert.rejects(
    () => handler.handleNonStream(stream),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      const mapped = error as Error & { code?: string; status?: number }
      assert.equal(mapped.code, 'frontend_version_outdated')
      assert.equal(mapped.status, 409)
      assert.match(mapped.message, /请刷新页面以更新应用后重试/)
      return true
    },
  )
})
