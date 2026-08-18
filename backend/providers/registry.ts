import type { AdapterConfig, ProviderType } from '../oauth/types'
import { DeepSeekAdapter as DeepSeekOAuth } from '../oauth/adapters/deepseek'
import { GLMAdapter as GLMOauth } from '../oauth/adapters/glm'
import { KimiAdapter as KimiOAuth } from '../oauth/adapters/kimi'
import { MimoAdapter as MimoOAuth } from '../oauth/adapters/mimo'
import { MiniMaxAdapter as MiniMaxOAuth } from '../oauth/adapters/minimax'
import { PerplexityAdapter as PerplexityOAuth } from '../oauth/adapters/perplexity'
import { QwenAdapter as QwenOAuth } from '../oauth/adapters/qwen'
import { QwenAiAdapter as QwenAiOAuth } from '../oauth/adapters/qwen-ai'
import { ZaiAdapter as ZaiOAuth } from '../oauth/adapters/zai'
import { PROVIDER_TOKEN_SPECS } from '../oauth/bookmarkletScript'
import { DeepSeekAdapter } from '../proxy/adapters/deepseek'
import { GLMAdapter } from '../proxy/adapters/glm'
import { KimiAdapter } from '../proxy/adapters/kimi'
import { MiniMaxAdapter } from '../proxy/adapters/minimax'
import { MimoAdapter } from '../proxy/adapters/mimo'
import { PerplexityAdapter } from '../proxy/adapters/perplexity'
import { QwenAdapter } from '../proxy/adapters/qwen'
import { QwenAiAdapter } from '../proxy/adapters/qwen-ai'
import { ZaiAdapter } from '../proxy/adapters/zai'
import type { Provider } from '../store/types'
import type { BuiltinProviderConfig } from '../store/types'
import deepseekConfig from './builtin/deepseek'
import glmConfig from './builtin/glm'
import kimiConfig from './builtin/kimi'
import minimaxConfig from './builtin/minimax'
import mimoConfig from './builtin/mimo'
import perplexityConfig from './builtin/perplexity'
import qwenConfig from './builtin/qwen'
import qwenAiConfig from './builtin/qwen-ai'
import zaiConfig from './builtin/zai'
import type { ProviderPlugin } from './types'

function unimplementedForward(id: string): ProviderPlugin['forward'] {
  return async () => {
    throw new Error(`Provider ${id} forward is still owned by RequestForwarder`)
  }
}

function plugin(partial: Omit<ProviderPlugin, 'forward'>): ProviderPlugin {
  return {
    ...partial,
    forward: unimplementedForward(partial.id),
  }
}

export const providerPlugins: ProviderPlugin[] = [
  plugin({
    id: 'deepseek',
    config: deepseekConfig,
    createOAuthAdapter: (config) => new DeepSeekOAuth(config),
    getSupportedAuthMethods: () => ['manual'],
    matches: DeepSeekAdapter.isDeepSeekProvider,
    bookmarklet: PROVIDER_TOKEN_SPECS.deepseek,
  }),
  plugin({
    id: 'glm',
    config: glmConfig,
    createOAuthAdapter: (config) => new GLMOauth(config),
    getSupportedAuthMethods: () => ['manual'],
    matches: GLMAdapter.isGLMProvider,
    bookmarklet: PROVIDER_TOKEN_SPECS.glm,
  }),
  plugin({
    id: 'kimi',
    config: kimiConfig,
    createOAuthAdapter: (config) => new KimiOAuth(config),
    getSupportedAuthMethods: () => ['manual'],
    matches: KimiAdapter.isKimiProvider,
    bookmarklet: PROVIDER_TOKEN_SPECS.kimi,
  }),
  plugin({
    id: 'minimax',
    config: minimaxConfig,
    createOAuthAdapter: (config) => new MiniMaxOAuth(config),
    getSupportedAuthMethods: () => ['manual'],
    matches: MiniMaxAdapter.isMiniMaxProvider,
    bookmarklet: PROVIDER_TOKEN_SPECS.minimax,
  }),
  plugin({
    id: 'mimo',
    config: mimoConfig,
    createOAuthAdapter: (config) => new MimoOAuth(config),
    getSupportedAuthMethods: () => ['manual', 'cookie'],
    matches: MimoAdapter.isMimoProvider,
    bookmarklet: PROVIDER_TOKEN_SPECS.mimo,
  }),
  plugin({
    id: 'perplexity',
    config: perplexityConfig,
    createOAuthAdapter: (config) => new PerplexityOAuth(config),
    getSupportedAuthMethods: () => ['manual', 'cookie'],
    matches: PerplexityAdapter.isPerplexityProvider,
    bookmarklet: PROVIDER_TOKEN_SPECS.perplexity,
  }),
  plugin({
    id: 'qwen-ai',
    config: qwenAiConfig,
    createOAuthAdapter: (config) => new QwenAiOAuth(config),
    getSupportedAuthMethods: () => ['manual'],
    matches: QwenAiAdapter.isQwenAiProvider,
    bookmarklet: PROVIDER_TOKEN_SPECS['qwen-ai'],
  }),
  plugin({
    id: 'qwen',
    config: qwenConfig,
    createOAuthAdapter: (config) => new QwenOAuth(config),
    getSupportedAuthMethods: () => ['manual', 'cookie'],
    matches: QwenAdapter.isQwenProvider,
    bookmarklet: PROVIDER_TOKEN_SPECS.qwen,
  }),
  plugin({
    id: 'zai',
    config: zaiConfig,
    createOAuthAdapter: (config) => new ZaiOAuth(config),
    getSupportedAuthMethods: () => ['manual'],
    matches: ZaiAdapter.isZaiProvider,
    bookmarklet: PROVIDER_TOKEN_SPECS.zai,
  }),
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
