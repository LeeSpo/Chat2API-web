import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

test('Qwen AI OAuth validation covers full-session, rejection, and JWT-fallback paths', () => {
  const result = spawnSync(
    process.execPath,
    ['node_modules/.bin/tsx', '--test', 'tests/server/qwen-ai-oauth-validation.case.ts'],
    { cwd: process.cwd(), encoding: 'utf8' },
  )

  assert.equal(result.status, 0, result.stderr || result.stdout)
})
