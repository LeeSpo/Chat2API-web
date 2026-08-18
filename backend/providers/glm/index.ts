import config from './config'
import { GLMAdapter as GLMAdapterOAuth } from './oauth'
import { GLMAdapter } from './adapter'
import { glmBookmarklet } from './bookmarklet'
import type { ProviderPlugin } from '../types'

export { default as glmConfig } from './config'
export { GLMAdapter } from './adapter'
export { GLMAdapter as GLMAdapterOAuth } from './oauth'
export { glmBookmarklet } from './bookmarklet'

export const glmPlugin: ProviderPlugin = {
  id: 'glm',
  config,
  createOAuthAdapter: (adapterConfig) => new GLMAdapterOAuth(adapterConfig),
  getSupportedAuthMethods: () => ['manual'],
  matches: GLMAdapter.isGLMProvider,
  bookmarklet: glmBookmarklet,
  forward: async () => {
    throw new Error('Provider glm forward is still owned by RequestForwarder')
  },
}
