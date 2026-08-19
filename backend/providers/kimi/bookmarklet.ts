import type { ProviderTokenSpec } from '../../oauth/bookmarkletScript'

export const kimiBookmarklet: ProviderTokenSpec = {
  storageType: 'localStorage',
  tokenKey: 'access_token',
  tokenKeys: ['accessToken'],
  tokenField: 'token',
  extras: [
    { sourceKey: 'refresh_token', sourceKeys: ['refreshToken'], field: 'refreshToken' },
    { sourceKey: 'kimi-auth', storageType: 'cookie', field: 'kimiAuth' },
    { sourceKey: 'volcano-token-info', field: 'volcanoTokenInfo' },
  ],
  originLabel: 'Kimi',
  expectedOrigin: 'https://www.kimi.com',
}
