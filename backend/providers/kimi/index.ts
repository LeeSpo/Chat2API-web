import config from './config'
import { KimiAdapter as KimiAdapterOAuth } from './oauth'
import { KimiAdapter } from './adapter'
import { kimiBookmarklet } from './bookmarklet'
import type { ProviderPlugin } from '../types'

export { default as kimiConfig } from './config'
export { KimiAdapter } from './adapter'
export { KimiAdapter as KimiAdapterOAuth } from './oauth'
export { kimiBookmarklet } from './bookmarklet'

export const kimiPlugin: ProviderPlugin = {
  id: 'kimi',
  config,
  createOAuthAdapter: (adapterConfig) => new KimiAdapterOAuth(adapterConfig),
  getSupportedAuthMethods: () => ['manual'],
  matches: KimiAdapter.isKimiProvider,
  bookmarklet: kimiBookmarklet,
  forward: async () => {
    throw new Error('Provider kimi forward is still owned by RequestForwarder')
  },
}
