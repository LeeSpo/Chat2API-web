import config from './config'
import { QwenAdapter as QwenAdapterOAuth } from './oauth'
import { QwenAdapter } from './adapter'
import { qwenBookmarklet } from './bookmarklet'
import type { ProviderPlugin } from '../types'

export { default as qwenConfig } from './config'
export { QwenAdapter } from './adapter'
export { QwenAdapter as QwenAdapterOAuth } from './oauth'
export { qwenBookmarklet } from './bookmarklet'

export const qwenPlugin: ProviderPlugin = {
  id: 'qwen',
  config,
  createOAuthAdapter: (adapterConfig) => new QwenAdapterOAuth(adapterConfig),
  getSupportedAuthMethods: () => ['manual', 'cookie'],
  matches: QwenAdapter.isQwenProvider,
  bookmarklet: qwenBookmarklet,
  forward: async () => {
    throw new Error('Provider qwen forward is still owned by RequestForwarder')
  },
}
