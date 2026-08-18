/**
 * OAuth Adapter Index
 * Export all provider authentication adapters
 */

export { BaseOAuthAdapter } from './base'
export { DeepSeekAdapter } from './deepseek'
export { GLMAdapter } from './glm'
export { KimiAdapter } from './kimi'
export { MimoAdapter } from './mimo'
export { MiniMaxAdapter } from './minimax'
export { PerplexityAdapter } from './perplexity'
export { QwenAdapter } from './qwen'
export { QwenAiAdapter } from './qwen-ai'
export { ZaiAdapter } from './zai'

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
