import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const transport = fs.readFileSync('backend/providers/qwen-ai/playwrightTransport.ts', 'utf8')
const routes = fs.readFileSync('backend/proxy/routes/management/qwenAiBrowser.ts', 'utf8')
const sidecar = fs.readFileSync('backend/qwenBrowserSidecar.ts', 'utf8')
const routeIndex = fs.readFileSync('backend/proxy/routes/management/index.ts', 'utf8')
const accountList = fs.readFileSync('frontend/src/components/providers/AccountList.tsx', 'utf8')
const dockerfile = fs.readFileSync('Dockerfile', 'utf8')
const compose = fs.readFileSync('docker-compose.yml', 'utf8')

test('Qwen AI Playwright transport uses persistent, invisible Chromium profiles', () => {
  assert.match(transport, /launchPersistentContext/)
  assert.match(transport, /headless:\s*true/)
  assert.match(transport, /qwen-browser-profiles/)
  assert.match(transport, /Authorization:\s*`Bearer/)
  assert.match(transport, /source:\s*'desktop'/)
  assert.match(transport, /__chat2apiQwenEmit/)
  assert.match(transport, /verificationRequired/)
})

test('Qwen AI browser verification is authenticated and exposed in account UI', () => {
  assert.match(routes, /managementAuthMiddleware/)
  assert.match(routes, /\/accounts\/:accountId\/screenshot/)
  assert.match(routes, /\/accounts\/:accountId\/drag/)
  assert.match(routeIndex, /qwenAiBrowserRouter/)
  assert.match(accountList, /serverBrowserVerification/)
})

test('Docker keeps Chromium in an optional authenticated sidecar', () => {
  const appStage = dockerfile.slice(dockerfile.indexOf('FROM runtime-base AS app'))
  assert.match(dockerfile, /FROM \$\{NODE_IMAGE\} AS qwen-browser-os[\s\S]*apk add --no-cache[\s\S]*chromium[\s\S]*FROM qwen-browser-os AS qwen-browser/)
  assert.doesNotMatch(appStage, /chromium|QWEN_AI_BROWSER_EXECUTABLE_PATH/)
  assert.doesNotMatch(dockerfile, /xvfb|novnc/i)
  assert.match(compose, /profiles:\s*\["qwen-browser"\]/)
  assert.match(compose, /CHAT2API_QWEN_AI_BROWSER_MODE:\s*"\$\{CHAT2API_QWEN_AI_BROWSER_MODE:-off\}"/)
  assert.match(compose, /target:\s*qwen-browser/)
  assert.match(sidecar, /timingSafeEqual/)
  assert.match(sidecar, /QWEN_AI_BROWSER_SIDECAR_SECRET must not be empty/)
  assert.match(transport, /QwenAiRemotePlaywrightTransport/)
  assert.match(transport, /QWEN_AI_BROWSER_SIDECAR_URL/)
})
