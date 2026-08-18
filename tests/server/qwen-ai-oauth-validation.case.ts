import assert from 'node:assert/strict'
import test from 'node:test'
import axios from 'axios'
import { QwenAiAdapter } from '../../backend/providers/qwen-ai/oauth.ts'
import {
  DEFAULT_QWEN_AI_BAXIA_VERSION,
  DEFAULT_QWEN_AI_WEB_VERSION,
  resolveQwenAiClientHeaders,
} from '../../backend/providers/qwen-ai/client-metadata.ts'

const adapter = new QwenAiAdapter({
  providerId: 'qwen-ai',
  providerType: 'qwen-ai',
  authMethods: [],
  callbackPort: 8311,
})

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`
}

async function withMockedGet(
  get: typeof axios.get,
  run: () => Promise<void>,
): Promise<void> {
  const original = axios.get
  axios.get = get
  try {
    await run()
  } finally {
    axios.get = original
  }
}

test('Qwen AI validation sends the imported session and returns user information', async () => {
  let receivedHeaders: Record<string, string> | undefined

  await withMockedGet(async (_url, config) => {
    receivedHeaders = config?.headers as Record<string, string>
    return { status: 200, data: { success: true, data: { email: 'profile@example.com', name: 'Profile Name' } } } as any
  }, async () => {
    const result = await adapter.validateToken({
      token: jwt({ sub: 'user-123', email: 'jwt@example.com' }),
      cookies: 'token=session-token; x5secdata=cookie-x5',
      baxiaUidToken: 'uid-token',
      x5secdata: 'header-x5',
      x5sectag: 'tag-x5',
    })

    assert.equal(result.valid, true)
    assert.equal(result.accountInfo?.userId, 'user-123')
    assert.equal(result.accountInfo?.email, 'jwt@example.com')
  })

  assert.equal(receivedHeaders?.Cookie, 'token=session-token; x5secdata=cookie-x5')
  assert.equal(receivedHeaders?.Authorization, undefined)
  assert.equal(receivedHeaders?.['bx-umidtoken'], 'uid-token')
  assert.equal(receivedHeaders?.Version, DEFAULT_QWEN_AI_WEB_VERSION)
  assert.equal(receivedHeaders?.['bx-v'], DEFAULT_QWEN_AI_BAXIA_VERSION)
  assert.equal(receivedHeaders?.x5secdata, 'header-x5')
  assert.equal(receivedHeaders?.x5sectag, 'tag-x5')
})

test('Qwen AI client headers preserve imported browser and web-client metadata', () => {
  const headers = resolveQwenAiClientHeaders({
    qwenWebVersion: '0.2.test',
    baxiaVersion: '2.5.test',
    browserUserAgent: 'Captured Browser',
    browserAcceptLanguage: 'en-US,en;q=0.9',
    browserPlatform: 'Linux',
    browserSecChUa: '"Captured";v="1"',
    browserSecChUaMobile: '?1',
  })

  assert.deepEqual(headers, {
    Version: '0.2.test',
    'User-Agent': 'Captured Browser',
    'Accept-Language': 'en-US,en;q=0.9',
    'sec-ch-ua': '"Captured";v="1"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Linux"',
    'bx-v': '2.5.test',
  })
})

test('Qwen AI login preserves the complete imported browser session', async () => {
  await withMockedGet(async () => ({ status: 200, data: { success: true, data: {} } }) as any, async () => {
    const token = jwt({ sub: 'user-session' })
    const result = await adapter.loginWithToken('qwen-ai', token, {
      cookies: 'token=session-token',
      baxiaUidToken: 'uid-token',
      x5secdata: 'header-x5',
      x5sectag: 'tag-x5',
    })

    assert.equal(result.success, true)
    assert.deepEqual(result.credentials, {
      token,
      cookies: 'token=session-token',
      baxiaUidToken: 'uid-token',
      x5secdata: 'header-x5',
      x5sectag: 'tag-x5',
    })
  })
})

test('Qwen AI validation rejects an explicitly unauthorized browser session', async () => {
  await withMockedGet(async () => ({ status: 401, data: { message: 'token expired' } }) as any, async () => {
    const result = await adapter.validateToken({ token: jwt({ sub: 'user-401' }), cookies: 'token=session-token' })
    assert.equal(result.valid, false)
    assert.match(result.error || '', /rejected the imported browser session/i)
  })
})

test('Qwen AI validation falls back to JWT identity while its user-info endpoint is unavailable', async () => {
  await withMockedGet(async () => ({ status: 503, data: { message: 'temporarily unavailable' } }) as any, async () => {
    const result = await adapter.validateToken({ token: jwt({ uid: 'user-503', email: 'fallback@example.com', name: 'Fallback' }) })
    assert.equal(result.valid, true)
    assert.deepEqual(result.accountInfo, {
      userId: 'user-503',
      email: 'fallback@example.com',
      name: 'Fallback',
    })
  })
})
