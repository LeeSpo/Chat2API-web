import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = process.cwd()

function exists(relative) {
  return fs.existsSync(path.join(repoRoot, relative))
}

test('repo uses backend/ + frontend/ + shared/ instead of src/main|renderer|server', () => {
  assert.equal(exists('backend/index.ts'), true, 'backend/index.ts must exist')
  assert.equal(exists('frontend/src/main.tsx'), true, 'frontend/src/main.tsx must exist')
  assert.equal(exists('shared/types.ts'), true, 'shared/types.ts must exist')
  assert.equal(exists('src/main'), false, 'src/main must be gone')
  assert.equal(exists('src/renderer'), false, 'src/renderer must be gone')
  assert.equal(exists('src/server'), false, 'src/server must be gone')
})

test('vite and package.json still emit the current Docker-compatible artifacts', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  const viteServer = fs.readFileSync(path.join(repoRoot, 'vite.server.config.ts'), 'utf8')
  const viteAdmin = fs.readFileSync(path.join(repoRoot, 'vite.admin.config.ts'), 'utf8')

  assert.equal(pkg.main, './out-server/server/index.js')
  assert.match(pkg.scripts['dev:backend'], /tsx backend\/index\.ts/)
  assert.match(viteServer, /backend\/index\.ts/)
  assert.match(viteAdmin, /root:\s*resolve\(__dirname,\s*'frontend'\)/)
})
