import type { ProviderTokenSpec } from '../../oauth/bookmarkletScript'

export const qwenBookmarklet: ProviderTokenSpec = {
  storageType: 'cookie',
  tokenKey: 'tongyi_sso_ticket',
  tokenField: 'token',
  originLabel: 'Tongyi Qianwen',
  expectedOrigin: 'https://www.qianwen.com',
}
