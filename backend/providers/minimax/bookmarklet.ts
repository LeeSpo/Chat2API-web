import type { ProviderTokenSpec } from '../../oauth/bookmarkletScript'

export const minimaxBookmarklet: ProviderTokenSpec = {
  storageType: 'localStorage',
  tokenKey: '_token',
  tokenField: 'token',
  extras: [
    {
      sourceKey: '_userId',
      sourceKeys: ['user_detail_agent'],
      field: 'realUserID',
      valueEncoding: 'json-id-or-raw',
    },
  ],
  originLabel: 'MiniMax',
  expectedOrigin: 'https://agent.minimaxi.com',
}
