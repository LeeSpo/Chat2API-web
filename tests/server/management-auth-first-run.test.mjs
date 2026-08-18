import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const authSource = () => fs.readFileSync('src/main/proxy/routes/management/auth.ts', 'utf8')
const middlewareSource = () => fs.readFileSync('src/main/proxy/middleware/managementAuth.ts', 'utf8')
const indexSource = () => fs.readFileSync('src/main/proxy/routes/management/index.ts', 'utf8')
const serverSource = () => fs.readFileSync('src/main/proxy/server.ts', 'utf8')
const storeTypesSource = () => fs.readFileSync('src/main/store/types.ts', 'utf8')
const sharedTypesSource = () => fs.readFileSync('src/shared/types.ts', 'utf8')
const bootstrapSource = () => fs.readFileSync('src/server/bootstrapConfig.ts', 'utf8')
const serverEntrySource = () => fs.readFileSync('src/server/index.ts', 'utf8')

test('management auth routes expose public first-run and login endpoints', () => {
  const source = authSource()

  assert.match(source, /prefix:\s*'\/v0\/management\/auth'/)
  assert.match(source, /router\.get\('\/status'/)
  assert.match(source, /router\.post\('\/setup'/)
  assert.match(source, /router\.post\('\/login'/)
  assert.match(source, /router\.post\('\/change_password'/)
  assert.match(source, /firstRun/)
  assert.match(source, /passwordHash/)
  assert.match(source, /scryptSync/)
  assert.match(source, /MIN_PASSWORD_LENGTH\s*=\s*8/)
  assert.match(source, /RATE_LIMIT_MAX_ATTEMPTS\s*=\s*10/)
  assert.match(source, /already_initialised/)
  assert.match(source, /invalid_credentials/)
})

test('management auth middleware keeps first-run paths public and compares secrets in constant time', () => {
  const source = middlewareSource()

  assert.match(source, /isPublicManagementPath/)
  assert.match(source, /\/v0\/management\/auth\/status/)
  assert.match(source, /\/v0\/management\/auth\/setup/)
  assert.match(source, /\/v0\/management\/auth\/login/)
  assert.match(source, /timingSafeEqual/)
  assert.match(source, /safeEqual/)
  assert.doesNotMatch(
    source,
    /if \(providedToken !== managementConfig\.managementApiSecret\)/,
    'secret comparison must not use raw !==',
  )
})

test('auth router is registered before other management routers', () => {
  const source = indexSource()

  assert.match(source, /import authRouter from '\.\/auth'/)
  assert.match(source, /export default \[[\s\S]*authRouter/)

  const authIndex = source.indexOf('authRouter')
  const configIndex = source.indexOf('configRouter', source.indexOf('export default'))
  assert.ok(authIndex > 0, 'authRouter should be imported')
  assert.ok(configIndex > 0, 'configRouter should remain in the default export')
  assert.ok(
    source.indexOf('authRouter', source.indexOf('export default')) < configIndex,
    'authRouter must be registered first so public auth routes are matched first',
  )
})

test('proxy server lets public auth paths through the management enable check', () => {
  const source = serverSource()

  assert.match(source, /isPublicManagementPath/)
  assert.match(source, /if \(isPublicManagementPath\(ctx\.path\)\)/)
})

test('management API config stores first-run password fields', () => {
  for (const [label, source] of [
    ['store types', storeTypesSource()],
    ['shared types', sharedTypesSource()],
  ]) {
    assert.match(source, /firstRunCompleted\??:\s*boolean/, `${label} should declare firstRunCompleted`)
    assert.match(source, /passwordHash\??:\s*string/, `${label} should declare passwordHash`)
    assert.match(source, /passwordSalt\??:\s*string/, `${label} should declare passwordSalt`)
    assert.match(source, /passwordSetAt\??:\s*number/, `${label} should declare passwordSetAt`)
  }
})

test('server bootstrap enables management API and treats an env secret as first-run complete', () => {
  const source = bootstrapSource()

  assert.match(source, /CHAT2API_DISABLE_MANAGEMENT_API/)
  assert.match(source, /firstRunCompleted/)
  assert.match(source, /CHAT2API_MANAGEMENT_SECRET/)
})

test('server entry surfaces first-run setup to the operator', () => {
  const source = serverEntrySource()

  assert.match(source, /First run detected/)
  assert.match(source, /\/v0\/management\/auth/)
})
