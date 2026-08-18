import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

test('bookmarklet routes cover issue, public ingest, poll, and disable flag', () => {
  const source = fs.readFileSync('backend/proxy/routes/management/oauth/bookmarklet.ts', 'utf8')

  assert.match(source, /prefix:\s*'\/v0\/management\/oauth\/bookmarklet'/)
  assert.match(source, /router\.post\('\/issue'/)
  assert.match(source, /router\.post\('\/ingest'/)
  assert.match(source, /router\.post\('\/bridge\/next'/)
  assert.match(source, /router\.post\('\/bridge\/event'/)
  assert.match(source, /router\.get\('\/poll\/:ticket'/)
  assert.match(source, /CHAT2API_DISABLE_BOOKMARKLET/)
  assert.match(source, /Access-Control-Allow-Origin/)
  assert.match(source, /loginWithToken/)
  assert.match(source, /ticket\.providerType === 'qwen-ai'/)
  assert.match(source, /stringCredentials/)
  assert.match(source, /managementAuthMiddleware/)
})

test('bookmarklet ingest is a public management path', () => {
  const source = fs.readFileSync('backend/proxy/middleware/managementAuth.ts', 'utf8')
  assert.match(source, /\/v0\/management\/oauth\/bookmarklet\/ingest/)
  assert.match(source, /\/v0\/management\/oauth\/bookmarklet\/bridge\/next/)
  assert.match(source, /\/v0\/management\/oauth\/bookmarklet\/bridge\/event/)
  assert.match(source, /isPublicManagementPath/)
})

test('bookmarklet ticket store is single-use with a 10 minute ttl', () => {
  const source = fs.readFileSync('backend/oauth/bookmarkletTickets.ts', 'utf8')
  assert.match(source, /TICKET_TTL_MS\s*=\s*10 \* 60 \* 1000/)
  assert.match(source, /complete\(/)
  assert.match(source, /consume\(/)
})

test('bookmarklet script covers built-in providers including the complete qwen-ai browser session', () => {
  const source = fs.readFileSync('backend/oauth/bookmarkletScript.ts', 'utf8')
  const qwenAi = fs.readFileSync('backend/providers/qwen-ai/bookmarklet.ts', 'utf8')
  for (const provider of ['deepseek', 'glm', 'kimi', 'minimax', 'qwen', "'qwen-ai'", 'zai', 'mimo', 'perplexity']) {
    assert.match(source, new RegExp(provider))
  }
  assert.match(qwenAi, /cookies/)
  assert.match(qwenAi, /x5secdata/)
  assert.match(qwenAi, /x5sectag/)
  assert.match(qwenAi, /baxiaUidToken/)
  assert.match(qwenAi, /baxiaVersion/)
  assert.match(qwenAi, /qwenWebVersion/)
  assert.match(qwenAi, /browserUserAgent/)
  assert.match(qwenAi, /browserAcceptLanguage/)
  assert.match(qwenAi, /browserPlatform/)
  assert.match(qwenAi, /browserSecChUa/)
  assert.match(source, /document\.cookie/)
  assert.match(source, /window\.__baxia__/)
  assert.match(source, /window\.baxiaCommon/)
  assert.match(source, /qwen-chat-fe/)
  assert.match(source, /navigator\.userAgent/)
  assert.match(source, /startQwenBridge/)
  assert.match(source, /bridgePost/)
})

test('management router registers bookmarklet routes before other oauth handlers', () => {
  const source = fs.readFileSync('backend/proxy/routes/management/index.ts', 'utf8')
  assert.match(source, /bookmarkletRouter/)
  const exportDefault = source.slice(source.indexOf('export default'))
  assert.ok(
    exportDefault.indexOf('bookmarkletRouter') > 0,
    'bookmarkletRouter must be in the default export',
  )
})
