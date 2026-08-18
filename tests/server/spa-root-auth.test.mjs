import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

test('static frontend is served at / and /admin redirects to the SPA', () => {
  const assets = fs.readFileSync('src/server/admin/assets.ts', 'utf8')
  const viteAdmin = fs.readFileSync('vite.admin.config.ts', 'utf8')

  assert.match(assets, /ctx\.path === '\/admin'/)
  assert.match(assets, /ctx\.redirect\('\/'\)/)
  assert.match(assets, /\/health/)
  assert.match(assets, /\/v0\//)
  assert.match(viteAdmin, /base:\s*'\/'/)
})

test('AuthProvider probes public auth status and wraps the SPA entry', () => {
  const auth = fs.readFileSync('src/renderer/src/components/auth/AuthProvider.tsx', 'utf8')
  const main = fs.readFileSync('src/renderer/src/main.tsx', 'utf8')
  const adminHtml = fs.readFileSync('src/renderer/admin.html', 'utf8')

  assert.match(auth, /\/v0\/management\/auth\/status|auth\.status/)
  assert.match(auth, /firstRun/)
  assert.match(auth, /setup/)
  assert.match(auth, /login/)
  assert.match(main, /AuthProvider/)
  assert.match(adminHtml, /main\.tsx/)
})

test('web admin API exposes password auth helpers and persists the secret', () => {
  const source = fs.readFileSync('src/renderer/src/web-admin-api.ts', 'utf8')

  assert.match(source, /auth:\s*\{|export const auth|async function authStatus|status:\s*async/)
  assert.match(source, /\/auth\/status/)
  assert.match(source, /\/auth\/setup/)
  assert.match(source, /\/auth\/login/)
  assert.match(source, /\/auth\/change_password/)
  assert.match(source, /localStorage/)
  assert.match(source, /management-api-unauthorized/)
})
