import config from './config'
import { MiniMaxAdapter as MiniMaxAdapterOAuth } from './oauth'
import { MiniMaxAdapter } from './adapter'
import { minimaxBookmarklet } from './bookmarklet'
import type { ProviderPlugin } from '../types'

export { default as minimaxConfig } from './config'
export { MiniMaxAdapter } from './adapter'
export { MiniMaxAdapter as MiniMaxAdapterOAuth } from './oauth'
export { minimaxBookmarklet } from './bookmarklet'

export const minimaxPlugin: ProviderPlugin = {
  id: 'minimax',
  config,
  createOAuthAdapter: (adapterConfig) => new MiniMaxAdapterOAuth(adapterConfig),
  getSupportedAuthMethods: () => ['manual'],
  matches: MiniMaxAdapter.isMiniMaxProvider,
  bookmarklet: minimaxBookmarklet,
  forward: async () => {
    throw new Error('Provider minimax forward is still owned by RequestForwarder')
  },
}
