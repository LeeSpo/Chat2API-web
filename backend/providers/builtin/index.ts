import type { BuiltinProviderConfig } from '../../store/types.ts'
import { deepseekConfig } from '../deepseek'
import { glmConfig } from '../glm'
import { kimiConfig } from '../kimi'
import { minimaxConfig } from '../minimax'
import { mimoConfig } from '../mimo'
import { perplexityConfig } from '../perplexity'
import { qwenConfig } from '../qwen'
import qwenAiConfig from './qwen-ai.ts'
import { zaiConfig } from '../zai'

export const builtinProviders: BuiltinProviderConfig[] = [
  deepseekConfig,
  glmConfig,
  kimiConfig,
  minimaxConfig,
  mimoConfig,
  perplexityConfig,
  qwenConfig,
  qwenAiConfig,
  zaiConfig,
]

export const builtinProviderMap: Record<string, BuiltinProviderConfig> = {
  deepseek: deepseekConfig,
  glm: glmConfig,
  kimi: kimiConfig,
  minimax: minimaxConfig,
  mimo: mimoConfig,
  perplexity: perplexityConfig,
  qwen: qwenConfig,
  'qwen-ai': qwenAiConfig,
  zai: zaiConfig,
}

export function getBuiltinProvider(id: string): BuiltinProviderConfig | undefined {
  return builtinProviderMap[id]
}

export function getBuiltinProviders(): BuiltinProviderConfig[] {
  return builtinProviders
}

export {
  deepseekConfig,
  glmConfig,
  kimiConfig,
  minimaxConfig,
  mimoConfig,
  perplexityConfig,
  qwenConfig,
  qwenAiConfig,
  zaiConfig,
}

export default builtinProviders
