import type { ProviderTokenSpec } from '../../oauth/bookmarkletScript'

export const mimoBookmarklet: ProviderTokenSpec = {
  storageType: 'localStorage',
  tokenKey: 'service_token',
  tokenField: 'token',
  extras: [
    { sourceKey: 'user_id', field: 'mimoUserId', required: true },
    { sourceKey: 'ph_token', field: 'mimoPhToken', required: true },
  ],
  originLabel: 'Mimo Studio',
  expectedOrigin: 'https://aistudio.xiaomimimo.com',
}
