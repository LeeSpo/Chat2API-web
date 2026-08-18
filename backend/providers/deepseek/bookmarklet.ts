import type { ProviderTokenSpec } from '../../oauth/bookmarkletScript'

export const deepseekBookmarklet: ProviderTokenSpec = {
  storageType: 'localStorage',
  tokenKey: 'userToken',
  tokenField: 'token',
  originLabel: 'DeepSeek',
  expectedOrigin: 'https://chat.deepseek.com',
}
