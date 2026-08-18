/**
 * OAuth Adapter Index
 * Export all provider authentication adapters
 */

export { BaseOAuthAdapter } from './base'
export { DeepSeekAdapter } from '../../providers/deepseek/oauth'
export { GLMAdapter } from '../../providers/glm/oauth'
export { KimiAdapter } from '../../providers/kimi/oauth'
export { MimoAdapter } from '../../providers/mimo/oauth'
export { MiniMaxAdapter } from '../../providers/minimax/oauth'
export { PerplexityAdapter } from '../../providers/perplexity/oauth'
export { QwenAdapter } from '../../providers/qwen/oauth'
export { QwenAiAdapter } from './qwen-ai'
export { ZaiAdapter } from '../../providers/zai/oauth'

import {
  createAdapter as createRegistryAdapter,
  getSupportedAuthMethods as getRegistryAuthMethods,
} from '../../providers/registry'
import type { AdapterConfig, ProviderType } from '../types'
import type { BaseOAuthAdapter } from './base'

export function createAdapter(
  providerType: ProviderType,
  config: AdapterConfig
): BaseOAuthAdapter {
  return createRegistryAdapter(providerType, config)
}

export function getSupportedAuthMethods(providerType: ProviderType): string[] {
  return getRegistryAuthMethods(providerType)
}
