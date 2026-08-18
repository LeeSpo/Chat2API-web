import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

test('Qwen AI browser bridge safely relays same-origin completion streams', () => {
  const result = spawnSync(
    process.execPath,
    ['node_modules/.bin/tsx', '--test', 'tests/server/qwen-ai-browser-bridge.case.ts'],
    { cwd: process.cwd(), encoding: 'utf8' },
  )

  assert.equal(result.status, 0, result.stderr || result.stdout)
})

