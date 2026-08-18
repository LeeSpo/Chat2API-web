import config from './config'
import { MimoAdapter as MimoAdapterOAuth } from './oauth'
import { MimoAdapter } from './adapter'
import { mimoBookmarklet } from './bookmarklet'
import type { ProviderPlugin } from '../types'

export { default as mimoConfig } from './config'
export { MimoAdapter } from './adapter'
export { MimoAdapter as MimoAdapterOAuth } from './oauth'
export { mimoBookmarklet } from './bookmarklet'

export const mimoPlugin: ProviderPlugin = {
  id: 'mimo',
  config,
  createOAuthAdapter: (adapterConfig) => new MimoAdapterOAuth(adapterConfig),
  getSupportedAuthMethods: () => ['manual', 'cookie'],
  matches: MimoAdapter.isMimoProvider,
  bookmarklet: mimoBookmarklet,
  forward: async () => {
    throw new Error('Provider mimo forward is still owned by RequestForwarder')
  },
}
