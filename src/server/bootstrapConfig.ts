import type { AppConfig, LoadBalanceStrategy } from '../main/store/types'
import { storeManager } from '../main/store/store'

const VALID_STRATEGIES = new Set<LoadBalanceStrategy>([
  'round-robin',
  'fill-first',
  'failover',
])

function parsePort(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid CHAT2API_PORT: ${value}`)
  }

  return parsed
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

export function createServerConfigOverrides(): Partial<AppConfig> {
  const overrides: Partial<AppConfig> = {}
  const port = parsePort(process.env.CHAT2API_PORT)
  const host = process.env.CHAT2API_HOST
  const strategy = process.env.CHAT2API_LOAD_BALANCE_STRATEGY as LoadBalanceStrategy | undefined
  const enableManagementApi = parseBoolean(process.env.CHAT2API_ENABLE_MANAGEMENT_API)
  const disableManagementApi = process.env.CHAT2API_DISABLE_MANAGEMENT_API === '1'
  const managementSecret = process.env.CHAT2API_MANAGEMENT_SECRET?.trim()
  const enableApiKey = parseBoolean(process.env.CHAT2API_ENABLE_API_KEY)
  const logLevel = process.env.CHAT2API_LOG_LEVEL as AppConfig['logLevel'] | undefined

  if (port !== undefined) {
    overrides.proxyPort = port
  }

  if (host) {
    overrides.proxyHost = host
  }

  if (strategy) {
    if (!VALID_STRATEGIES.has(strategy)) {
      throw new Error(`Invalid CHAT2API_LOAD_BALANCE_STRATEGY: ${strategy}`)
    }
    overrides.loadBalanceStrategy = strategy
  }

  if (logLevel) {
    if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
      throw new Error(`Invalid CHAT2API_LOG_LEVEL: ${logLevel}`)
    }
    overrides.logLevel = logLevel
  }

  if (enableApiKey !== undefined) {
    overrides.enableApiKey = enableApiKey
  }

  const managementEnabled = disableManagementApi
    ? false
    : (enableManagementApi ?? true)

  overrides.managementApi = {
    enableManagementApi: managementEnabled,
    ...(managementSecret
      ? {
          managementApiSecret: managementSecret,
          firstRunCompleted: true,
        }
      : {}),
  }

  return overrides
}

export function applyServerConfigOverrides(): AppConfig {
  const current = storeManager.getConfig()
  const overrides = createServerConfigOverrides()
  if (overrides.managementApi) {
    overrides.managementApi = {
      ...current.managementApi,
      ...overrides.managementApi,
    }
  }
  if (Object.keys(overrides).length === 0) {
    return current
  }

  return storeManager.updateConfig(overrides)
}
