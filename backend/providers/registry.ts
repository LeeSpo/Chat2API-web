import type { AdapterConfig, ProviderType } from '../oauth/types'
import { QwenAiAdapter as QwenAiOAuth } from '../oauth/adapters/qwen-ai'
import { PROVIDER_TOKEN_SPECS } from '../oauth/bookmarkletScript'
import { QwenAiAdapter } from '../proxy/adapters/qwen-ai'
import type { Provider } from '../store/types'
import type { BuiltinProviderConfig } from '../store/types'
import qwenAiConfig from './builtin/qwen-ai'
import { deepseekPlugin } from './deepseek'
import { glmPlugin } from './glm'
import { kimiPlugin } from './kimi'
import { minimaxPlugin } from './minimax'
import { mimoPlugin } from './mimo'
import { perplexityPlugin } from './perplexity'
import { qwenPlugin } from './qwen'
import { zaiPlugin } from './zai'
import type { ProviderPlugin } from './types'

const qwenAiPlugin: ProviderPlugin = {
  id: 'qwen-ai',
  config: qwenAiConfig,
  createOAuthAdapter: (config) => new QwenAiOAuth(config),
  getSupportedAuthMethods: () => ['manual'],
  matches: QwenAiAdapter.isQwenAiProvider,
  bookmarklet: PROVIDER_TOKEN_SPECS['qwen-ai'],
  forward: async () => {
    throw new Error('Provider qwen-ai forward is still owned by RequestForwarder')
  },
}

// qwen-ai is registered before qwen so chat.qwen.ai never matches the China Qwen matcher.
export const providerPlugins: ProviderPlugin[] = [
  deepseekPlugin,
  glmPlugin,
  kimiPlugin,
  minimaxPlugin,
  mimoPlugin,
  perplexityPlugin,
  qwenAiPlugin,
  qwenPlugin,
  zaiPlugin,
]

export const builtinProviders: BuiltinProviderConfig[] = providerPlugins.map((item) => item.config)

export const builtinProviderMap: Record<string, BuiltinProviderConfig> = Object.fromEntries(
  providerPlugins.map((item) => [item.id, item.config]),
)

export function getBuiltinProvider(id: string): BuiltinProviderConfig | undefined {
  return builtinProviderMap[id]
}

export function getBuiltinProviders(): BuiltinProviderConfig[] {
  return builtinProviders
}

export function getProviderPlugin(id: string): ProviderPlugin | undefined {
  return providerPlugins.find((item) => item.id === id)
}

export function matchProviderPlugin(provider: Provider): ProviderPlugin | undefined {
  return providerPlugins.find((item) => item.matches(provider))
}

export function createAdapter(providerType: ProviderType, config: AdapterConfig) {
  const plugin = getProviderPlugin(providerType)
  if (!plugin) {
    throw new Error(`Unsupported provider type: ${providerType}`)
  }
  return plugin.createOAuthAdapter(config)
}

export function getSupportedAuthMethods(providerType: ProviderType): string[] {
  return getProviderPlugin(providerType)?.getSupportedAuthMethods() ?? ['manual']
}

export function getBookmarkletSpecs() {
  return Object.fromEntries(
    providerPlugins
      .filter((item) => item.bookmarklet)
      .map((item) => [item.id, item.bookmarklet]),
  )
}
