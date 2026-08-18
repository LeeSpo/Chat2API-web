import * as dotenv from 'dotenv'
import { setRuntime } from './runtime'
import { nodeRuntime } from './runtime/nodeRuntime'
import { proxyServer } from './proxy/server'
import { storeManager } from './store/store'
import { applyServerConfigOverrides } from './bootstrapConfig'

dotenv.config()
setRuntime(nodeRuntime)

async function shutdown(signal: string): Promise<void> {
  console.log(`[Server] Received ${signal}, shutting down`)
  try {
    await proxyServer.stop()
  } finally {
    storeManager.flushPendingWrites()
    process.exit(0)
  }
}

let shutdownPromise: Promise<void> | undefined

function requestShutdown(signal: string): void {
  shutdownPromise ??= shutdown(signal)
  void shutdownPromise
}

async function main(): Promise<void> {
  process.on('SIGINT', () => requestShutdown('SIGINT'))
  process.on('SIGTERM', () => requestShutdown('SIGTERM'))

  process.on('uncaughtException', (error) => {
    console.error('[Server] Uncaught exception:', error)
  })

  process.on('unhandledRejection', (reason) => {
    console.error('[Server] Unhandled rejection:', reason)
  })

  await storeManager.initialize()
  await storeManager.syncDynamicBuiltinProviderModels()
  const config = applyServerConfigOverrides()
  const envSecretApplied = Boolean(process.env.CHAT2API_MANAGEMENT_SECRET?.trim())
  const firstRun = !config.managementApi?.firstRunCompleted

  if (envSecretApplied) {
    console.log('[Server] Management API: secret loaded from CHAT2API_MANAGEMENT_SECRET')
  } else if (firstRun) {
    console.log('')
    console.log('================================================================')
    console.log('  First run detected.')
    console.log('  Open the web UI to create your administrator password.')
    console.log('  Until you do, the management API will reject every request')
    console.log('  except /v0/management/auth/{status,setup,login}.')
    console.log('================================================================')
    console.log('')
  } else {
    console.log('[Server] Management API: ready (password set; awaiting login)')
  }

  const started = await proxyServer.start(config.proxyPort, config.proxyHost)
  if (!started) {
    throw new Error(`Failed to start server on ${config.proxyHost}:${config.proxyPort}`)
  }

  console.log(`[Server] Chat2API listening on ${config.proxyHost}:${config.proxyPort}`)
}

void main().catch((error) => {
  console.error('[Server] Startup failed:', error)
  process.exit(1)
})
