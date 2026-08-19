import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const transport = fs.readFileSync('backend/providers/zai/playwrightTransport.ts', 'utf8')
const captcha = fs.readFileSync('backend/providers/zai/captcha.ts', 'utf8')
const adapter = fs.readFileSync('backend/providers/zai/adapter.ts', 'utf8')
const routes = fs.readFileSync('backend/proxy/routes/management/zaiBrowser.ts', 'utf8')
const sidecar = fs.readFileSync('backend/qwenBrowserSidecar.ts', 'utf8')
const routeIndex = fs.readFileSync('backend/proxy/routes/management/index.ts', 'utf8')
const accountList = fs.readFileSync('frontend/src/components/providers/AccountList.tsx', 'utf8')
const dockerfile = fs.readFileSync('Dockerfile', 'utf8')
const compose = fs.readFileSync('docker-compose.yml', 'utf8')

test('Z.ai Playwright transport mints Aliyun captcha instead of proxying chat', () => {
  assert.match(transport, /launchPersistentContext/)
  assert.match(transport, /headless:\s*true/)
  assert.match(transport, /zai-browser-profiles/)
  assert.match(transport, /AliyunCaptcha\.js/)
  assert.match(transport, /36qgs6xb/)
  assert.match(transport, /chat-captcha-element/)
  assert.match(transport, /chat-captcha-trigger/)
  assert.match(transport, /async mint\(/)
  assert.doesNotMatch(transport, /\/api\/v2\/chat\/completions/)
  assert.match(captcha, /createZaiCaptchaCache/)
  assert.match(adapter, /resolveCaptchaParam/)
  assert.match(adapter, /attachZaiCaptchaParam/)
})

test('Z.ai browser verification is authenticated and exposed in account UI', () => {
  assert.match(routes, /managementAuthMiddleware/)
  assert.match(routes, /\/accounts\/:accountId\/screenshot/)
  assert.match(routes, /\/accounts\/:accountId\/drag/)
  assert.match(routeIndex, /zaiBrowserRouter/)
  assert.match(accountList, /providerId === 'zai'/)
  assert.match(accountList, /serverBrowserVerification/)
})

test('Docker keeps Chromium in the existing authenticated sidecar for Z.ai mint', () => {
  const appStage = dockerfile.slice(dockerfile.indexOf('FROM runtime-base AS app'))
  assert.doesNotMatch(appStage, /chromium|ZAI_BROWSER_EXECUTABLE_PATH/)
  assert.match(compose, /profiles:\s*\["qwen-browser"\]/)
  assert.match(sidecar, /\/v1\/zai\/mint/)
  assert.match(sidecar, /providerId === 'zai'|providerId,/)
  assert.match(sidecar, /A valid Z.ai account is required/)
  assert.match(transport, /ZaiRemotePlaywrightTransport/)
  assert.match(transport, /QWEN_AI_BROWSER_SIDECAR_URL/)
})

function extractMethod(source, name) {
  const start = source.search(new RegExp(`(?:private\\s+|public\\s+)?async\\s+${name}\\s*\\(`))
  assert.notEqual(start, -1, `missing ${name}()`)
  let index = source.indexOf('{', start)
  assert.notEqual(index, -1, `missing ${name}() body`)
  let depth = 0
  for (let i = index; i < source.length; i += 1) {
    const char = source[i]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error(`unterminated ${name}()`)
}

test('Z.ai verification stays under the 75s sidecar HTTP timeout', () => {
  assert.match(transport, /SIDECAR_REQUEST_TIMEOUT_MS\s*=\s*75_000/)
  assert.match(transport, /SESSION_CREATE_TIMEOUT_MS\s*=\s*(2\d|3\d|4[0-5])_000/)
  assert.match(transport, /START_PROBE_TIMEOUT_MS\s*=\s*[1-5]_?000/)
  assert.match(transport, /ZAI_CAPTCHA_HOST_HTML/)

  const createSession = extractMethod(transport, 'createSession')
  assert.match(createSession, /setContent\(|route\.fulfill\(/)
  assert.match(createSession, /ZAI_CAPTCHA_HOST_HTML/)
  assert.doesNotMatch(createSession, /networkidle/)

  const startVerification = extractMethod(transport, 'startVerification')
  assert.match(startVerification, /START_PROBE_TIMEOUT_MS/)
  assert.doesNotMatch(startVerification, /mintOnPage/)

  const mintOnPage = extractMethod(transport, 'mintOnPage')
  assert.match(transport, /MINT_ATTEMPTS\s*=\s*1/)
  assert.match(mintOnPage, /attempt < MINT_ATTEMPTS/)
})
