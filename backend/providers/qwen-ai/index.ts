import config from './config'
import { QwenAiAdapter as QwenAiOAuth } from './oauth'
import { QwenAiAdapter } from './adapter'
import { qwenAiBookmarklet } from './bookmarklet'
import type { ProviderPlugin } from '../types'

export { default as qwenAiConfig } from './config'
export { QwenAiAdapter, QwenAiStreamHandler, qwenAiAdapter } from './adapter'
export { QwenAiAdapter as QwenAiOAuthAdapter } from './oauth'
export { qwenAiBookmarklet } from './bookmarklet'
export { qwenAiRequestGovernor } from './requestGovernor'
export { createDeferredQwenAiFailoverStream } from './deferredStream'
export { qwenAiSessionRepairService } from './sessionRepair'
export { withQwenAiModelModeAliases } from './model-mode'
export { qwenAiTokenRefresher, hasQwenAiSessionCookie } from './token-refresh'

export const qwenAiPlugin: ProviderPlugin = {
  id: 'qwen-ai',
  config,
  createOAuthAdapter: (adapterConfig) => new QwenAiOAuth(adapterConfig),
  getSupportedAuthMethods: () => ['manual'],
  matches: QwenAiAdapter.isQwenAiProvider,
  bookmarklet: qwenAiBookmarklet,
  forward: async () => {
    throw new Error('Provider qwen-ai forward is still owned by RequestForwarder')
  },
}
