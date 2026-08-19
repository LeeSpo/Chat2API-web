import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { buildBookmarkletSource } from '../../backend/oauth/bookmarkletScript'
import { glmBookmarklet } from '../../backend/providers/glm/bookmarklet'
import { kimiBookmarklet } from '../../backend/providers/kimi/bookmarklet'
import { minimaxBookmarklet } from '../../backend/providers/minimax/bookmarklet'
import { mimoBookmarklet } from '../../backend/providers/mimo/bookmarklet'
import { perplexityBookmarklet } from '../../backend/providers/perplexity/bookmarklet'
import { zaiBookmarklet } from '../../backend/providers/zai/bookmarklet'
import { resolveGlmRefreshToken } from '../../backend/providers/glm/credentials'
import { MimoAdapter } from '../../backend/providers/mimo/oauth'
import { PerplexityAdapter } from '../../backend/providers/perplexity/oauth'
import { expandKimiImportedSession } from '../../backend/providers/kimi/credentials'
import { parseMimoCredentials } from '../../frontend/src/lib/mimoCredentials'

type StorageKind = 'localStorage' | 'cookie'

async function runBookmarklet(
  providerType: 'glm' | 'kimi' | 'minimax' | 'mimo' | 'perplexity' | 'zai',
  spec: Parameters<typeof buildBookmarkletSource>[0]['spec'],
  options: {
    localStorage?: Record<string, string | null>
    cookies?: string
  } = {},
): Promise<{ payload: any; alerts: string[] }> {
  let payload: unknown
  const alerts: string[] = []
  const localStorage = {
    getItem: (key: string) => options.localStorage?.[key] ?? null,
  }
  const document = {
    cookie: options.cookies || '',
  }
  const context = {
    alert: (message: string) => alerts.push(message),
    document,
    fetch: async (_url: string, init: { body: string }) => {
      payload = JSON.parse(init.body)
      return { ok: true, json: async () => ({ success: true }) }
    },
    window: { document, localStorage },
  }

  vm.runInNewContext(
    buildBookmarkletSource({
      ticket: 'test-ticket',
      ingestUrl: 'http://127.0.0.1:8080/v0/management/oauth/bookmarklet/ingest',
      providerType,
      spec,
    }),
    context,
  )
  await new Promise((resolve) => setImmediate(resolve))
  return { payload, alerts }
}

test('GLM bookmarklet reads chatglm_refresh_token from cookie or localStorage', async () => {
  const fromCookie = await runBookmarklet('glm', glmBookmarklet, {
    cookies: 'chatglm_refresh_token=glm-refresh-cookie',
  })
  assert.deepEqual(fromCookie.payload?.credentials, { token: 'glm-refresh-cookie' })

  const fromStorage = await runBookmarklet('glm', glmBookmarklet, {
    localStorage: { chatglm_refresh_token: 'glm-refresh-storage' },
  })
  assert.deepEqual(fromStorage.payload?.credentials, { token: 'glm-refresh-storage' })
})

test('GLM refresh-token resolver accepts the stored aliases used by import and the adapter', () => {
  assert.equal(resolveGlmRefreshToken({ refresh_token: 'a' }), 'a')
  assert.equal(resolveGlmRefreshToken({ refreshToken: 'b' }), 'b')
  assert.equal(resolveGlmRefreshToken({ chatglm_refresh_token: 'c' }), 'c')
  assert.equal(resolveGlmRefreshToken({ token: 'd' }), 'd')
})

test('MiniMax bookmarklet reads agent.minimaxi.com _token and optional user id sources', async () => {
  assert.equal(minimaxBookmarklet.expectedOrigin, 'https://agent.minimaxi.com')

  const jwtOnly = await runBookmarklet('minimax', minimaxBookmarklet, {
    localStorage: { _token: 'eyJminimax' },
  })
  assert.deepEqual(jwtOnly.payload?.credentials, { token: 'eyJminimax' })
  assert.equal(jwtOnly.alerts.some((message) => /missing/i.test(message)), false)

  const withUser = await runBookmarklet('minimax', minimaxBookmarklet, {
    localStorage: {
      _token: 'eyJminimax',
      _userId: 'user-1',
    },
  })
  assert.equal(withUser.payload?.credentials.token, 'eyJminimax')
  assert.equal(withUser.payload?.credentials.realUserID, 'user-1')

  const fromDetail = await runBookmarklet('minimax', minimaxBookmarklet, {
    localStorage: {
      _token: 'eyJminimax',
      user_detail_agent: JSON.stringify({ id: 'user-2' }),
    },
  })
  assert.equal(fromDetail.payload?.credentials.realUserID, 'user-2')
})

test('Mimo bookmarklet reads the three website cookies and login persists adapter keys', async () => {
  const result = await runBookmarklet('mimo', mimoBookmarklet, {
    cookies: 'serviceToken=svc-1; userId=user-9; xiaomichatbot_ph=ph-3',
  })
  assert.equal(result.payload?.credentials.token, 'svc-1')
  assert.equal(result.payload?.credentials.user_id || result.payload?.credentials.mimoUserId, 'user-9')
  assert.equal(result.payload?.credentials.ph_token || result.payload?.credentials.mimoPhToken, 'ph-3')

  const adapter = new MimoAdapter({
    providerId: 'mimo',
    providerType: 'mimo',
    authMethods: ['manual'],
    callbackPort: 8311,
  })
  assert.equal(typeof adapter.loginWithToken, 'function')
  const login = await adapter.loginWithToken('mimo', 'svc-1', undefined, 'user-9', 'ph-3')
  assert.equal(login.success, true)
  assert.equal(login.credentials?.service_token, 'svc-1')
  assert.equal(login.credentials?.user_id, 'user-9')
  assert.equal(login.credentials?.ph_token, 'ph-3')
})

test('Mimo cURL import extracts the cookies sent by the authenticated browser request', () => {
  assert.deepEqual(
    parseMimoCredentials(`curl 'https://aistudio.xiaomimimo.com/open-apis/bot/chat' \\
      -H 'Content-Type: application/json' \\
      -H 'Cookie: serviceToken=svc=token; userId=user-9; xiaomichatbot_ph=ph-3'`),
    {
      success: true,
      credentials: {
        service_token: 'svc=token',
        user_id: 'user-9',
        ph_token: 'ph-3',
      },
    },
  )

  assert.deepEqual(
    parseMimoCredentials('Cookie: serviceToken=svc-1; userId=user-2'),
    { success: false, missing: ['xiaomichatbot_ph'] },
  )

  assert.deepEqual(
    parseMimoCredentials(`curl --url 'https://aistudio.xiaomimimo.com/open-apis/chat/conversation/genTitle?xiaomichatbot_ph=ph' \\
      -b 'xiaomichatbot_serviceToken="svc/current=="; userId=123456; xiaomichatbot_ph="ph/current=="'`),
    {
      success: true,
      credentials: {
        service_token: 'svc/current==',
        user_id: '123456',
        ph_token: 'ph/current==',
      },
    },
  )
})

test('Perplexity bookmarklet accepts either session cookie name and login stores sessionToken', async () => {
  const secure = await runBookmarklet('perplexity', perplexityBookmarklet, {
    cookies: '__Secure-next-auth.session-token=secure-session',
  })
  assert.equal(secure.payload?.credentials.token, 'secure-session')

  const fallback = await runBookmarklet('perplexity', perplexityBookmarklet, {
    cookies: 'next-auth.session-token=plain-session',
  })
  assert.equal(fallback.payload?.credentials.token, 'plain-session')

  const hidden = await runBookmarklet('perplexity', perplexityBookmarklet, {
    cookies: 'unrelated=1',
  })
  assert.match(hidden.alerts.join('\n'), /DevTools|session-token/i)

  const adapter = new PerplexityAdapter({
    providerId: 'perplexity',
    providerType: 'perplexity',
    authMethods: ['manual'],
    callbackPort: 8311,
  })
  assert.equal(typeof adapter.loginWithToken, 'function')
  const login = await adapter.loginWithToken('perplexity', 'secure-session')
  assert.equal(login.success, true)
  assert.equal(login.credentials?.sessionToken, 'secure-session')
})

test('Kimi bookmarklet keeps refresh_token and volcano request identifiers', async () => {
  const volcano = JSON.stringify({ webId: 'web-1', ssid: 'sid-2', userId: 'uid-3' })
  const result = await runBookmarklet('kimi', kimiBookmarklet, {
    localStorage: {
      access_token: 'eyJaccess',
      refresh_token: 'kimi-refresh',
      'volcano-token-info': volcano,
    },
  })
  assert.equal(result.payload?.credentials.token, 'eyJaccess')
  assert.equal(result.payload?.credentials.refreshToken, 'kimi-refresh')
  assert.ok(result.payload?.credentials.volcanoTokenInfo || result.payload?.credentials.deviceId)

  assert.deepEqual(
    expandKimiImportedSession({
      token: 'eyJaccess',
      refreshToken: 'kimi-refresh',
      volcanoTokenInfo: volcano,
    }),
    {
      token: 'eyJaccess',
      refreshToken: 'kimi-refresh',
      deviceId: 'web-1',
      sessionId: 'sid-2',
      trafficId: 'uid-3',
    },
  )
})

test('Z.ai bookmarklet reads token from localStorage or cookie and unwraps storage JSON', async () => {
  const fromStorage = await runBookmarklet('zai', zaiBookmarklet, {
    localStorage: { token: JSON.stringify({ value: 'eyJzai', __version: '0' }) },
  })
  assert.equal(fromStorage.payload?.credentials.token, 'eyJzai')

  const fromCookie = await runBookmarklet('zai', zaiBookmarklet, {
    cookies: 'token=eyJzai-cookie',
  })
  assert.equal(fromCookie.payload?.credentials.token, 'eyJzai-cookie')
})
