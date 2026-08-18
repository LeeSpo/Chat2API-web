import type { ProviderTokenSpec } from '../../oauth/bookmarkletScript'

export const qwenAiBookmarklet: ProviderTokenSpec = {
  storageType: 'localStorage',
  tokenKey: 'token',
  tokenField: 'token',
  extras: [
    { sourceKey: '*', storageType: 'cookie', field: 'cookies' },
    { sourceKey: 'x5secdata', storageType: 'cookie', field: 'x5secdata' },
    { sourceKey: 'x5sectag', storageType: 'cookie', field: 'x5sectag' },
    { sourceKey: 'baxiaUidToken', storageType: 'runtime', field: 'baxiaUidToken' },
    { sourceKey: 'baxiaVersion', storageType: 'runtime', field: 'baxiaVersion' },
    { sourceKey: 'qwenWebVersion', storageType: 'runtime', field: 'qwenWebVersion' },
    { sourceKey: 'browserUserAgent', storageType: 'runtime', field: 'browserUserAgent' },
    { sourceKey: 'browserAcceptLanguage', storageType: 'runtime', field: 'browserAcceptLanguage' },
    { sourceKey: 'browserPlatform', storageType: 'runtime', field: 'browserPlatform' },
    { sourceKey: 'browserSecChUa', storageType: 'runtime', field: 'browserSecChUa' },
    { sourceKey: 'browserSecChUaMobile', storageType: 'runtime', field: 'browserSecChUaMobile' },
  ],
  originLabel: 'Qwen Chat',
  expectedOrigin: 'https://chat.qwen.ai',
}
