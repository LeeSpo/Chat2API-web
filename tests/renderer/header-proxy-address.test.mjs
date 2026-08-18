import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

test('header proxy badge renders the configured bind address instead of a hard-coded loopback host', () => {
  const headerSource = readFileSync(join(root, 'frontend/src/components/layout/Header.tsx'), 'utf8')
  const statusSource = readFileSync(join(root, 'backend/proxy/status.ts'), 'utf8')
  const sharedTypesSource = readFileSync(join(root, 'shared/types.ts'), 'utf8')

  assert.match(sharedTypesSource, /export interface ProxyStatus \{[\s\S]*?\n\s+host: string/)
  assert.match(statusSource, /getHost\(/)
  assert.match(headerSource, /const \[host, setHost\] = useState\('127\.0\.0\.1'\)/)
  assert.match(headerSource, /setHost\(status\.host \|\| '127\.0\.0\.1'\)/)
  assert.match(headerSource, /setHost\(config\.proxyHost \|\| '127\.0\.0\.1'\)/)
  assert.match(headerSource, /\{host\}:\{port\}/)
  assert.doesNotMatch(headerSource, /127\.0\.0\.1:\{port\}/)
})

test('tool calling smoke uses a local management API URL that is actually served by the proxy', () => {
  const managementSettingsSource = readFileSync(join(root, 'frontend/src/components/settings/ManagementApiSettings.tsx'), 'utf8')
  const webAdminSource = readFileSync(join(root, 'frontend/src/web-admin-api.ts'), 'utf8')

  assert.match(webAdminSource, /\/tool-calling\/smoke/)
  assert.match(managementSettingsSource, /const apiEndpoint = `http:\/\/127\.0\.0\.1:\$\{proxyPort\}\/v0\/management`/)
})
