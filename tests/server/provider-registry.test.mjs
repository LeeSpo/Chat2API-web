import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const EXPECTED_IDS = [
  'deepseek',
  'glm',
  'kimi',
  'minimax',
  'mimo',
  'perplexity',
  'qwen',
  'qwen-ai',
  'zai',
]

test('ProviderPlugin contract and registry are the single vendor list', () => {
  const types = fs.readFileSync('backend/providers/types.ts', 'utf8')
  const registry = fs.readFileSync('backend/providers/registry.ts', 'utf8')

  assert.match(types, /export interface ProviderPlugin/)
  assert.match(types, /createOAuthAdapter/)
  assert.match(types, /getSupportedAuthMethods/)
  assert.match(types, /matches/)
  assert.match(types, /forward/)
  assert.match(types, /bookmarklet\?/)

  assert.match(registry, /export function getProviderPlugin/)
  assert.match(registry, /export function matchProviderPlugin/)
  assert.match(registry, /export function createAdapter/)
  assert.match(registry, /export function getSupportedAuthMethods/)
  assert.match(registry, /export const builtinProviders/)

  for (const id of EXPECTED_IDS) {
    const pluginName = id === 'qwen-ai' ? 'qwenAiPlugin' : `${id}Plugin`
    assert.match(registry, new RegExp(pluginName))
  }
})

test('non-Qwen-AI vendors live under backend/providers/<id>/', () => {
  for (const id of EXPECTED_IDS.filter((item) => item !== 'qwen-ai')) {
    assert.equal(fs.existsSync(`backend/providers/${id}/config.ts`), true)
    assert.equal(fs.existsSync(`backend/providers/${id}/oauth.ts`), true)
    assert.equal(fs.existsSync(`backend/providers/${id}/adapter.ts`), true)
    assert.equal(fs.existsSync(`backend/providers/${id}/index.ts`), true)
    assert.equal(fs.existsSync(`backend/providers/builtin/${id}.ts`), false)
    assert.equal(fs.existsSync(`backend/proxy/adapters/${id}.ts`), false)
    assert.equal(fs.existsSync(`backend/oauth/adapters/${id}.ts`), false)
  }
})

test('OAuth factory delegates to the provider registry', () => {
  const oauthIndex = fs.readFileSync('backend/oauth/adapters/index.ts', 'utf8')

  assert.match(oauthIndex, /from ['\"].*providers\/registry['\"]/)
  assert.match(oauthIndex, /createAdapter/)
  assert.doesNotMatch(oauthIndex, /case 'deepseek':/)
})
