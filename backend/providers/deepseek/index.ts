import config from './config'
import { DeepSeekAdapter as DeepSeekAdapterOAuth } from './oauth'
import { DeepSeekAdapter } from './adapter'
import { deepseekBookmarklet } from './bookmarklet'
import type { ProviderPlugin } from '../types'

export { default as deepseekConfig } from './config'
export { DeepSeekAdapter } from './adapter'
export { DeepSeekStreamHandler } from './stream'
export { DeepSeekAdapter as DeepSeekAdapterOAuth } from './oauth'
export { deepseekBookmarklet } from './bookmarklet'

export const deepseekPlugin: ProviderPlugin = {
  id: 'deepseek',
  config,
  createOAuthAdapter: (adapterConfig) => new DeepSeekAdapterOAuth(adapterConfig),
  getSupportedAuthMethods: () => ['manual'],
  matches: DeepSeekAdapter.isDeepSeekProvider,
  bookmarklet: deepseekBookmarklet,
  forward: async () => {
    throw new Error('Provider deepseek forward is still owned by RequestForwarder')
  },
}
