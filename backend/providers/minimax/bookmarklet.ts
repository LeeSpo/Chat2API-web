import type { ProviderTokenSpec } from '../../oauth/bookmarkletScript'

export const minimaxBookmarklet: ProviderTokenSpec = {
  storageType: 'localStorage',
  tokenKey: '_token',
  tokenField: 'token',
  extras: [
    { sourceKey: '_userId', field: 'realUserID', required: true },
  ],
  originLabel: 'MiniMax',
  expectedOrigin: 'https://chat.minimaxi.com',
}
