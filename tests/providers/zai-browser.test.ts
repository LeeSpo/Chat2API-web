import test from 'node:test'
import assert from 'node:assert/strict'

import {
  attachZaiCaptchaParam,
  createZaiCaptchaCache,
  htmlLooksLikeVisibleZaiCaptcha,
  parseZaiCaptchaVerifyParam,
  zaiCredentialFingerprint,
} from '../../backend/providers/zai/captcha.ts'
import { configuredZaiBrowserMode } from '../../backend/providers/zai/playwrightTransport.ts'

test('parseZaiCaptchaVerifyParam accepts a raw string or wrapped object', () => {
  assert.equal(parseZaiCaptchaVerifyParam('abc.def'), 'abc.def')
  assert.equal(parseZaiCaptchaVerifyParam({ captcha_verify_param: 'token-1' }), 'token-1')
  assert.equal(parseZaiCaptchaVerifyParam({ captchaVerifyParam: 'token-2' }), 'token-2')
  assert.equal(parseZaiCaptchaVerifyParam({ data: { captcha_verify_param: 'token-3' } }), 'token-3')
})

test('parseZaiCaptchaVerifyParam rejects empty or unknown values', () => {
  assert.equal(parseZaiCaptchaVerifyParam(''), undefined)
  assert.equal(parseZaiCaptchaVerifyParam('   '), undefined)
  assert.equal(parseZaiCaptchaVerifyParam(null), undefined)
  assert.equal(parseZaiCaptchaVerifyParam({}), undefined)
  assert.equal(parseZaiCaptchaVerifyParam(12), undefined)
})

test('captcha cache returns the same value within TTL and drops it after expiry', () => {
  let now = 1_000
  const cache = createZaiCaptchaCache({
    ttlMs: 120_000,
    now: () => now,
  })
  const fingerprint = zaiCredentialFingerprint('eyJhbGciOiJIUzI1NiJ9.e30.sig')

  cache.set('acc-1', fingerprint, 'fresh-param')
  assert.equal(cache.get('acc-1', fingerprint), 'fresh-param')

  now = 1_000 + 119_000
  assert.equal(cache.get('acc-1', fingerprint), 'fresh-param')

  now = 1_000 + 121_000
  assert.equal(cache.get('acc-1', fingerprint), undefined)
})

test('captcha cache invalidates when the token fingerprint changes', () => {
  const cache = createZaiCaptchaCache({ ttlMs: 120_000, now: () => 5_000 })
  const first = zaiCredentialFingerprint('token-a')
  const second = zaiCredentialFingerprint('token-b')
  assert.notEqual(first, second)

  cache.set('acc-1', first, 'old-param')
  assert.equal(cache.get('acc-1', second), undefined)
  cache.invalidate('acc-1')
  assert.equal(cache.get('acc-1', first), undefined)
})

test('attachZaiCaptchaParam copies the request body and only sets a non-empty param', () => {
  const original = { model: 'glm-4.7', messages: [] }
  const without = attachZaiCaptchaParam(original)
  assert.deepEqual(without, original)
  assert.notEqual(without, original)
  assert.equal('captcha_verify_param' in without, false)

  const withParam = attachZaiCaptchaParam(original, '  live-token  ')
  assert.equal(withParam.captcha_verify_param, 'live-token')
  assert.equal('captcha_verify_param' in original, false)
})

test('htmlLooksLikeVisibleZaiCaptcha detects the leftover Alibaba Cloud widget', () => {
  assert.equal(htmlLooksLikeVisibleZaiCaptcha('<div>Alibaba Cloud</div>'), true)
  assert.equal(htmlLooksLikeVisibleZaiCaptcha('<iframe src="https://o.alicdn.com/captcha-frontend/x"></iframe>'), true)
  assert.equal(htmlLooksLikeVisibleZaiCaptcha('<div id="chat-captcha-element"></div>'), true)
  assert.equal(htmlLooksLikeVisibleZaiCaptcha('<main>Hello GLM</main>'), false)
})

test('configuredZaiBrowserMode follows explicit mode, then sidecar URL, then local Chrome', () => {
  assert.equal(configuredZaiBrowserMode({ explicit: 'off', sidecarUrl: 'http://qwen-browser:3000', localAvailable: true }), 'off')
  assert.equal(configuredZaiBrowserMode({ explicit: 'sidecar', sidecarUrl: '', localAvailable: true }), 'sidecar')
  assert.equal(configuredZaiBrowserMode({ explicit: '', sidecarUrl: 'http://qwen-browser:3000', localAvailable: false }), 'sidecar')
  assert.equal(configuredZaiBrowserMode({ explicit: '', sidecarUrl: '', localAvailable: true }), 'local')
  assert.equal(configuredZaiBrowserMode({ explicit: '', sidecarUrl: '', localAvailable: false }), 'off')
})
