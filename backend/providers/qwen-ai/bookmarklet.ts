import type { ProviderTokenSpec } from '../../oauth/bookmarkletScript'

export const qwenAiBookmarklet: ProviderTokenSpec = {
  storageType: 'localStorage',
  tokenKey: 'token',
  tokenField: 'token',
  extras: [
    { sourceKey: '*', storageType: 'cookie', field: 'cookies' },
  ],
  originLabel: 'Qwen Chat',
  expectedOrigin: 'https://chat.qwen.ai',
}
