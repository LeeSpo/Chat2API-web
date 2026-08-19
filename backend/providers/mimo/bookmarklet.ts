import type { ProviderTokenSpec } from '../../oauth/bookmarkletScript'

export const mimoBookmarklet: ProviderTokenSpec = {
  storageType: 'cookie',
  tokenKey: 'xiaomichatbot_serviceToken',
  tokenKeys: ['michatbot_serviceToken', 'serviceToken', 'service_token'],
  tokenField: 'token',
  extras: [
    { sourceKey: 'userId', field: 'mimoUserId', required: true },
    { sourceKey: 'xiaomichatbot_ph', field: 'mimoPhToken', required: true },
  ],
  originLabel: 'Mimo Studio',
  expectedOrigin: 'https://aistudio.xiaomimimo.com',
}
