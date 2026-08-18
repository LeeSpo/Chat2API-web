import type { ProviderTokenSpec } from '../../oauth/bookmarkletScript'

export const glmBookmarklet: ProviderTokenSpec = {
  storageType: 'cookie',
  tokenKey: 'chatglm_refresh_token',
  tokenField: 'token',
  originLabel: 'ChatGLM',
  expectedOrigin: 'https://chatglm.cn',
}
