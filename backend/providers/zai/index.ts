import config from './config'
import { ZaiAdapter as ZaiAdapterOAuth } from './oauth'
import { ZaiAdapter } from './adapter'
import { zaiBookmarklet } from './bookmarklet'
import type { ProviderPlugin } from '../types'

export { default as zaiConfig } from './config'
export { ZaiAdapter } from './adapter'
export { ZaiAdapter as ZaiAdapterOAuth } from './oauth'
export { zaiBookmarklet } from './bookmarklet'

export const zaiPlugin: ProviderPlugin = {
  id: 'zai',
  config,
  createOAuthAdapter: (adapterConfig) => new ZaiAdapterOAuth(adapterConfig),
  getSupportedAuthMethods: () => ['manual'],
  matches: ZaiAdapter.isZaiProvider,
  bookmarklet: zaiBookmarklet,
  forward: async () => {
    throw new Error('Provider zai forward is still owned by RequestForwarder')
  },
}
