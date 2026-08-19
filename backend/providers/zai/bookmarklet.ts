import type { ProviderTokenSpec } from '../../oauth/bookmarkletScript'

export const zaiBookmarklet: ProviderTokenSpec = {
  storageType: 'localStorage',
  storageTypes: ['localStorage', 'cookie'],
  tokenKey: 'token',
  tokenField: 'token',
  valueEncoding: 'json-value-or-raw',
  originLabel: 'Z.ai',
  expectedOrigin: 'https://chat.z.ai',
}
