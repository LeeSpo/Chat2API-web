const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..', '..')

test('management account routes use a static provider adapter registry instead of dynamic adapter imports', () => {
  const source = readFileSync(join(root, 'src/main/proxy/routes/management/accounts.ts'), 'utf8')

  assert.doesNotMatch(source, /await import\('\.\.\/\.\.\/adapters\//)
  assert.match(source, /const clearChatsHandlers/)
  assert.match(source, /minimax: \(\) =>/)
})
