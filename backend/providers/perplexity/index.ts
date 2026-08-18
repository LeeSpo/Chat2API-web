import config from './config'
import { PerplexityAdapter as PerplexityAdapterOAuth } from './oauth'
import { PerplexityAdapter } from './adapter'
import { perplexityBookmarklet } from './bookmarklet'
import type { ProviderPlugin } from '../types'

export { default as perplexityConfig } from './config'
export { PerplexityAdapter } from './adapter'
export { PerplexityStreamHandler } from './stream'
export { PerplexityAdapter as PerplexityAdapterOAuth } from './oauth'
export { perplexityBookmarklet } from './bookmarklet'

export const perplexityPlugin: ProviderPlugin = {
  id: 'perplexity',
  config,
  createOAuthAdapter: (adapterConfig) => new PerplexityAdapterOAuth(adapterConfig),
  getSupportedAuthMethods: () => ['manual', 'cookie'],
  matches: PerplexityAdapter.isPerplexityProvider,
  bookmarklet: perplexityBookmarklet,
  forward: async () => {
    throw new Error('Provider perplexity forward is still owned by RequestForwarder')
  },
}
