import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

test('bookmarklet routes cover issue, public ingest, poll, and disable flag', () => {
  const source = fs.readFileSync('src/main/proxy/routes/management/oauth/bookmarklet.ts', 'utf8')

  assert.match(source, /prefix:\s*'\/v0\/management\/oauth\/bookmarklet'/)
  assert.match(source, /router\.post\('\/issue'/)
  assert.match(source, /router\.post\('\/ingest'/)
  assert.match(source, /router\.get\('\/poll\/:ticket'/)
  assert.match(source, /CHAT2API_DISABLE_BOOKMARKLET/)
  assert.match(source, /Access-Control-Allow-Origin/)
  assert.match(source, /loginWithToken/)
  assert.match(source, /managementAuthMiddleware/)
})

test('bookmarklet ingest is a public management path', () => {
  const source = fs.readFileSync('src/main/proxy/middleware/managementAuth.ts', 'utf8')
  assert.match(source, /\/v0\/management\/oauth\/bookmarklet\/ingest/)
  assert.match(source, /isPublicManagementPath/)
})

test('bookmarklet ticket store is single-use with a 10 minute ttl', () => {
  const source = fs.readFileSync('src/main/oauth/bookmarkletTickets.ts', 'utf8')
  assert.match(source, /TICKET_TTL_MS\s*=\s*10 \* 60 \* 1000/)
  assert.match(source, /complete\(/)
  assert.match(source, /consume\(/)
})

test('bookmarklet script covers built-in providers including qwen-ai cookies', () => {
  const source = fs.readFileSync('src/main/oauth/bookmarkletScript.ts', 'utf8')
  for (const provider of ['deepseek', 'glm', 'kimi', 'minimax', 'qwen', "'qwen-ai'", 'zai', 'mimo', 'perplexity']) {
    assert.match(source, new RegExp(provider))
  }
  assert.match(source, /cookies/)
  assert.match(source, /document\.cookie/)
})

test('management router registers bookmarklet routes before other oauth handlers', () => {
  const source = fs.readFileSync('src/main/proxy/routes/management/index.ts', 'utf8')
  assert.match(source, /bookmarkletRouter/)
  const exportDefault = source.slice(source.indexOf('export default'))
  assert.ok(
    exportDefault.indexOf('bookmarkletRouter') > 0,
    'bookmarkletRouter must be in the default export',
  )
})
