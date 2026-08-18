import type { ProviderTokenSpec } from '../../oauth/bookmarkletScript'

export const kimiBookmarklet: ProviderTokenSpec = {
  storageType: 'localStorage',
  tokenKey: 'access_token',
  tokenField: 'token',
  extras: [
    { sourceKey: 'refresh_token', field: 'refreshToken' },
    { sourceKey: 'kimi-auth', storageType: 'cookie', field: 'kimiAuth' },
  ],
  originLabel: 'Kimi',
  expectedOrigin: 'https://www.kimi.com',
}
