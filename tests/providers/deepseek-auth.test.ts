import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { buildBookmarkletSource } from '../../backend/oauth/bookmarkletScript'
import { deepseekBookmarklet } from '../../backend/providers/deepseek/bookmarklet'
import {
  createDeepSeekWebHeaders,
  getDeepSeekTokenValidationError,
  getDeepSeekUserData,
  normalizeDeepSeekUserToken,
} from '../../backend/providers/deepseek/credentials'

const token = 'deepseek-user-token-for-test'

function buildDeepSeekBookmarklet(): string {
  return buildBookmarkletSource({
    ticket: 'test-ticket',
    ingestUrl: 'http://127.0.0.1:8080/v0/management/oauth/bookmarklet/ingest',
    providerType: 'deepseek',
    spec: deepseekBookmarklet,
  })
}

async function runBookmarklet(storedValue: string | null): Promise<{
  payload: unknown
  alerts: string[]
  cookieReads: number
}> {
  let payload: unknown
  let cookieReads = 0
  const alerts: string[] = []
  const document = {
    get cookie() {
      cookieReads += 1
      return 'session=should-not-be-read'
    },
  }
  const context = {
    alert: (message: string) => alerts.push(message),
    document,
    fetch: async (_url: string, init: { body: string }) => {
      payload = JSON.parse(init.body)
      return { ok: true, json: async () => ({ success: true }) }
    },
    window: {
      document,
      localStorage: { getItem: () => storedValue },
    },
  }

  vm.runInNewContext(buildDeepSeekBookmarklet(), context)
  await new Promise((resolve) => setImmediate(resolve))
  return { payload, alerts, cookieReads }
}

test('normalizes current DeepSeek storage wrappers and legacy raw userToken values', () => {
  assert.equal(normalizeDeepSeekUserToken(JSON.stringify({ value: token, __version: '0' })), token)
  assert.equal(normalizeDeepSeekUserToken(token), token)
  assert.equal(normalizeDeepSeekUserToken(JSON.stringify({ value: '' })), '')
  assert.equal(normalizeDeepSeekUserToken(''), '')
})

test('DeepSeek bookmarklet sends only the wrapped userToken value and never reads cookies', async () => {
  const result = await runBookmarklet(JSON.stringify({ value: token, __version: '0' }))

  assert.deepEqual(result.payload, {
    ticket: 'test-ticket',
    providerType: 'deepseek',
    credentials: { token },
  })
  assert.equal(result.cookieReads, 0)
})

test('DeepSeek bookmarklet keeps compatibility with legacy raw userToken values', async () => {
  const result = await runBookmarklet(token)
  assert.deepEqual(result.payload, {
    ticket: 'test-ticket',
    providerType: 'deepseek',
    credentials: { token },
  })
})

test('maps DeepSeek invalid-token and malformed-account responses to actionable errors', () => {
  const invalid = { code: 40003, msg: 'Authorization Failed', data: null }
  assert.match(getDeepSeekTokenValidationError(200, invalid) || '', /userToken is invalid or expired/)
  assert.match(
    getDeepSeekTokenValidationError(200, { code: 0, data: { biz_code: 0, biz_data: null } }) || '',
    /unexpected account response/,
  )

  const valid = { code: 0, data: { biz_code: 0, biz_data: { id: 'account-id' } } }
  assert.equal(getDeepSeekTokenValidationError(200, valid), null)
  assert.deepEqual(getDeepSeekUserData(valid), { id: 'account-id' })
})

test('uses the current public DeepSeek client header contract', () => {
  const headers = createDeepSeekWebHeaders()
  assert.equal(headers['X-Client-Bundle-Id'], 'com.deepseek.chat')
  assert.equal(headers['X-Client-Platform'], 'web')
  assert.equal(headers['X-Client-Version'], '2.3.0')
  assert.match(headers['X-Client-Timezone-Offset'], /^-?\d+$/)
  assert.equal('X-App-Version' in headers, false)
})
