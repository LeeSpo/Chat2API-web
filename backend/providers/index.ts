export * from './builtin'
export * from './checker'
export * from './custom'
export {
  createAdapter,
  getBookmarkletSpecs,
  getProviderPlugin,
  getSupportedAuthMethods,
  matchProviderPlugin,
  providerPlugins,
} from './registry'
export type { ProviderPlugin } from './types'
