import type { ProviderTokenSpec } from '../../oauth/bookmarkletScript'

export const perplexityBookmarklet: ProviderTokenSpec = {
  storageType: 'cookie',
  tokenKey: '__Secure-next-auth.session-token',
  tokenKeys: ['next-auth.session-token'],
  tokenField: 'token',
  originLabel: 'Perplexity',
  expectedOrigin: 'https://www.perplexity.ai',
}
