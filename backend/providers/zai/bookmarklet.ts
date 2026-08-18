import type { ProviderTokenSpec } from '../../oauth/bookmarkletScript'

export const zaiBookmarklet: ProviderTokenSpec = {
  storageType: 'localStorage',
  tokenKey: 'token',
  tokenField: 'token',
  originLabel: 'Z.ai',
  expectedOrigin: 'https://chat.z.ai',
}
