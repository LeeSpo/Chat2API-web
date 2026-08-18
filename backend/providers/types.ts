import type { Account, BuiltinProviderConfig, Provider } from '../store/types'
import type { AdapterConfig, ProviderType } from '../oauth/types'
import type { BaseOAuthAdapter } from '../oauth/adapters/base'
import type { ProviderTokenSpec } from '../oauth/bookmarkletScript'
import type { ChatCompletionRequest, ForwardResult, ProxyContext } from '../proxy/types'

export type { ProviderType }

export interface ProviderForwardOptions {
  qwenAiRecoveryBypassAccountInterval?: boolean
  qwenAiRequestTimeoutMs?: number
  qwenAiRequestDeadlineAt?: number
  attempt?: number
  [key: string]: unknown
}

export interface ProviderPlugin {
  id: string
  config: BuiltinProviderConfig
  createOAuthAdapter: (config: AdapterConfig) => BaseOAuthAdapter
  getSupportedAuthMethods: () => string[]
  matches: (provider: Provider) => boolean
  bookmarklet?: ProviderTokenSpec
  forward: (
    request: ChatCompletionRequest,
    account: Account,
    provider: Provider,
    actualModel: string,
    startTime: number,
    context: ProxyContext,
    options?: ProviderForwardOptions,
  ) => Promise<ForwardResult>
}
