import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

test('docker admin uses the existing React renderer instead of the lightweight static page', () => {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  const serverSource = fs.readFileSync('backend/proxy/server.ts', 'utf8')

  assert.equal(packageJson.scripts['build:admin'], 'vite build --config vite.admin.config.ts')
  assert.match(packageJson.scripts['build:server'], /build:admin/)

  assert.ok(fs.existsSync('frontend/admin.html'))
  assert.ok(fs.existsSync('frontend/src/main.tsx'))
  assert.ok(fs.existsSync('frontend/src/web-admin-api.ts'))
  assert.ok(fs.existsSync('frontend/src/components/auth/AuthProvider.tsx'))
  assert.ok(fs.existsSync('vite.admin.config.ts'))

  assert.match(serverSource, /mountWebAdminAssets/)
  assert.doesNotMatch(serverSource, /mountAdminAssets/)
})
