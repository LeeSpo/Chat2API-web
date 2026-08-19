/**
 * Management API Routes Index
 * Exports all management route modules
 */

import authRouter from './auth'
import configRouter from './config'
import providersRouter from './providers'
import accountsRouter from './accounts'
import apiKeysRouter from './apiKeys'
import modelMappingsRouter from './modelMappings'
import sessionsRouter from './sessions'
import statisticsRouter from './statistics'
import proxyRouter from './proxy'
import toolCallingRouter from './toolCalling'
import qwenAiGovernorRouter from './qwenAiGovernor'
import bookmarkletRouter from './oauth/bookmarklet'
import qwenAiBrowserRouter from './qwenAiBrowser'
import zaiBrowserRouter from './zaiBrowser'

export {
  authRouter,
  configRouter,
  providersRouter,
  accountsRouter,
  apiKeysRouter,
  modelMappingsRouter,
  sessionsRouter,
  statisticsRouter,
  proxyRouter,
  toolCallingRouter,
  qwenAiGovernorRouter,
  bookmarkletRouter,
  qwenAiBrowserRouter,
  zaiBrowserRouter,
}

export default [
  // Public first-run / login routes must be registered first.
  authRouter,
  configRouter,
  providersRouter,
  accountsRouter,
  apiKeysRouter,
  modelMappingsRouter,
  sessionsRouter,
  statisticsRouter,
  proxyRouter,
  toolCallingRouter,
  qwenAiGovernorRouter,
  bookmarkletRouter,
  qwenAiBrowserRouter,
  zaiBrowserRouter,
]
