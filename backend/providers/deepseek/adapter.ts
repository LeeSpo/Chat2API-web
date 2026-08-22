/**
 * DeepSeek Adapter
 * Implements DeepSeek web API protocol
 * 
 * NOTE: Tool prompt injection is handled by Forwarder.transformRequestForPromptToolUse()
 * This adapter only handles message format conversion and API communication
 */

import axios, { AxiosResponse } from 'axios'
import { getDeepSeekHash } from '../../lib/challenge'
import type { Account, Provider } from '../../store/types'
import { resolveDeepSeekChatOptions } from '../../proxy/adapters/providerModelOptions'
import { getProviderToolProfile } from '../../proxy/toolCalling/providerProfiles'
import {
  createDeepSeekWebHeaders,
  getDeepSeekCompletionFailure,
  getDeepSeekTokenValidationError,
  normalizeDeepSeekUserToken,
} from './credentials'

const DEEPSEEK_API_BASE = 'https://chat.deepseek.com/api'

interface TokenInfo {
  accessToken: string
  expiresAt: number
}

interface ChallengeResponse {
  algorithm: string
  challenge: string
  salt: string
  difficulty: number
  expire_at: number
  signature: string
}

interface DeepSeekMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: any[]
}

interface ChatCompletionRequest {
  model: string
  messages: DeepSeekMessage[]
  stream?: boolean
  temperature?: number
  web_search?: boolean
  reasoning_effort?: 'low' | 'medium' | 'high'
  tools?: any[]
  tool_choice?: any
}

const tokenCache = new Map<string, TokenInfo>()
const sessionCache = new Map<string, { sessionId: string; createdAt: number }>()
const MAX_JSON_COMPLETION_BYTES = 64 * 1024

class DeepSeekCompletionResponseError extends Error {
  readonly status: number
  readonly code: string
  readonly retryable: boolean
  readonly accountFault: boolean
  readonly retryScope?: 'next-account'
  readonly muteUntil?: number

  constructor(failure: ReturnType<typeof getDeepSeekCompletionFailure>) {
    super(failure.message)
    this.name = 'DeepSeekCompletionResponseError'
    this.status = failure.status
    this.code = failure.code
    this.retryable = failure.retryable
    this.accountFault = failure.accountFault
    this.retryScope = failure.retryScope
    this.muteUntil = failure.muteUntil
  }
}

async function readBoundedResponseBody(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = []
  let totalBytes = 0

  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    totalBytes += buffer.length
    if (totalBytes > MAX_JSON_COMPLETION_BYTES) {
      throw new Error('DeepSeek JSON completion response exceeded the size limit.')
    }
    chunks.push(buffer)
  }

  return Buffer.concat(chunks).toString('utf8')
}

function generateRandomString(length: number, charset: string = 'alphanumeric'): string {
  const sets = {
    numeric: '0123456789',
    alphabetic: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    alphanumeric: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    hex: '0123456789abcdef',
  }
  const chars = sets[charset as keyof typeof sets] || sets.alphanumeric
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function generateCookie(): string {
  const timestamp = Date.now()
  return `intercom-HWWAFSESTIME=${timestamp}; HWWAFSESID=${generateRandomString(18, 'hex')}; Hm_lvt_${uuid(false)}=${Math.floor(timestamp / 1000)},${Math.floor(timestamp / 1000)},${Math.floor(timestamp / 1000)}; Hm_lpvt_${uuid(false)}=${Math.floor(timestamp / 1000)}; _frid=${uuid(false)}; _fr_ssid=${uuid(false)}; _fr_pvid=${uuid(false)}`
}

function unixTimestamp(): number {
  return Math.floor(Date.now() / 1000)
}

export class DeepSeekAdapter {
  private provider: Provider
  private account: Account
  private token: string

  constructor(provider: Provider, account: Account) {
    this.provider = provider
    this.account = account
    this.token = normalizeDeepSeekUserToken(
      account.credentials.token || account.credentials.apiKey || account.credentials.refreshToken,
    )
  }

  private async acquireToken(): Promise<string> {
    if (!this.token) {
      throw new Error('DeepSeek Token not configured, please add Token in account settings')
    }

    const cached = tokenCache.get(this.token)
    if (cached && cached.expiresAt > unixTimestamp()) {
      return cached.accessToken
    }

    const result = await axios.get(`${DEEPSEEK_API_BASE}/v0/users/current`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...createDeepSeekWebHeaders(),
      },
      timeout: 15000,
      validateStatus: () => true,
    })

    const validationError = getDeepSeekTokenValidationError(result.status, result.data)
    if (validationError) {
      throw new Error(validationError)
    }

    // The current DeepSeek web client uses userToken itself for every request;
    // it is not a refresh token that must be exchanged for another value.
    tokenCache.set(this.token, {
      accessToken: this.token,
      expiresAt: unixTimestamp() + 3600,
    })

    return this.token
  }

  private async createSession(): Promise<string> {
    const cacheKey = this.account.id
    const cached = sessionCache.get(cacheKey)
    if (cached && Date.now() - cached.createdAt < 300000) {
      return cached.sessionId
    }

    const token = await this.acquireToken()
    const result = await axios.post(
      `${DEEPSEEK_API_BASE}/v0/chat_session/create`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
          ...createDeepSeekWebHeaders(),
          Cookie: generateCookie(),
        },
        timeout: 15000,
        validateStatus: () => true,
      }
    )

    // Response structure: { code: 0, data: { biz_code: 0, biz_data: { id: "..." } } }
    const bizData = result.data?.data?.biz_data || result.data?.biz_data
    if (result.status !== 200 || !bizData?.chat_session?.id) {
      throw new Error(`Failed to create session: ${result.data?.msg || result.data?.data?.biz_msg || result.status}`)
    }

    const sessionId = bizData?.chat_session?.id
    sessionCache.set(cacheKey, { sessionId, createdAt: Date.now() })

    return sessionId
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const token = await this.acquireToken()
      const result = await axios.post(
        `${DEEPSEEK_API_BASE}/v0/chat_session/delete`,
        { chat_session_id: sessionId },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            ...createDeepSeekWebHeaders(),
          },
          timeout: 15000,
          validateStatus: () => true,
        }
      )

      const success = result.status === 200 && result.data?.code === 0
      if (success) {
        // Clear cache
        const cacheKey = this.account.id
        sessionCache.delete(cacheKey)
      }
      return success
    } catch {
      console.error('[DeepSeek] Failed to delete session')
      return false
    }
  }

  private async getChallenge(targetPath: string): Promise<ChallengeResponse> {
    const token = await this.acquireToken()
    const result = await axios.post(
      `${DEEPSEEK_API_BASE}/v0/chat/create_pow_challenge`,
      { target_path: targetPath },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          ...createDeepSeekWebHeaders(),
        },
        timeout: 15000,
        validateStatus: () => true,
      }
    )

    // Response structure: { code: 0, data: { biz_code: 0, biz_data: { challenge: {...} } } }
    const bizData = result.data?.data?.biz_data || result.data?.biz_data
    if (result.status !== 200 || !bizData?.challenge) {
      throw new Error(`Failed to get challenge: ${result.data?.msg || result.data?.data?.biz_msg || result.status}`)
    }

    return bizData.challenge
  }

  private async calculateChallengeAnswer(challenge: ChallengeResponse): Promise<string> {
    const { algorithm, challenge: challengeStr, salt, difficulty, expire_at, signature } = challenge
    
    if (algorithm !== 'DeepSeekHashV1') {
      throw new Error(`Unsupported algorithm: ${algorithm}`)
    }
    
    const deepSeekHash = await getDeepSeekHash()
    const answer = deepSeekHash.calculateHash(algorithm, challengeStr, salt, difficulty, expire_at)
    
    if (answer === undefined) {
      throw new Error('Challenge calculation failed')
    }
    
    return Buffer.from(JSON.stringify({
      algorithm,
      challenge: challengeStr,
      salt,
      answer,
      signature,
      target_path: '/api/v0/chat/completion',
    })).toString('base64')
  }

  private messagesToPrompt(messages: DeepSeekMessage[], isMultiTurn: boolean = false): string {
    const toolProfile = getProviderToolProfile('deepseek')
    const processedMessages = messages.map(message => {
      let text: string

      // Handle tool calls in assistant message
      if (message.role === 'assistant' && message.tool_calls && message.tool_calls.length > 0) {
        text = toolProfile.formatAssistantToolCalls(message.tool_calls.map(tc => ({
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        })))
      }
      // Handle tool response message
      else if (message.role === 'tool' && message.tool_call_id) {
        text = toolProfile.formatToolResult({
          toolCallId: message.tool_call_id,
          content: String(message.content || ''),
          isError: (message as { is_error?: boolean }).is_error === true,
        })
      }
      else if (Array.isArray(message.content)) {
        const texts = message.content
          .filter((item: any) => item.type === 'text')
          .map((item: any) => item.text)
        text = texts.join('\n')
      } else {
        text = String(message.content || '')
      }
      return { role: message.role, text }
    })

    if (processedMessages.length === 0) return ''

    // For multi-turn mode, only send the last user message
    if (isMultiTurn) {
      let lastUserIdx = -1
      for (let i = processedMessages.length - 1; i >= 0; i--) {
        if (processedMessages[i].role === 'user') {
          lastUserIdx = i
          break
        }
      }
      
      if (lastUserIdx !== -1) {
        const lastUserMsg = processedMessages[lastUserIdx]
        let text = lastUserMsg.text
        for (let i = lastUserIdx + 1; i < processedMessages.length; i++) {
          if (processedMessages[i].role === 'tool') {
            text += `\n\n${processedMessages[i].text}`
          }
        }
        return `<｜User｜>${text}`
      }
    }

    const mergedBlocks: { role: string; text: string }[] = []
    let currentBlock = { ...processedMessages[0] }

    for (let i = 1; i < processedMessages.length; i++) {
      const msg = processedMessages[i]
      if (msg.role === currentBlock.role) {
        currentBlock.text += `\n\n${msg.text}`
      } else {
        mergedBlocks.push(currentBlock)
        currentBlock = { ...msg }
      }
    }
    mergedBlocks.push(currentBlock)

    return mergedBlocks
      .map((block, index) => {
        if (block.role === 'assistant') {
          return `<｜Assistant｜>${block.text}<｜end of sentence｜>`
        }
        if (block.role === 'user' || block.role === 'system') {
          return index > 0 ? `<｜User｜>${block.text}` : block.text
        }
        if (block.role === 'tool') {
          return `<｜User｜>${block.text}`
        }
        return block.text
      })
      .join('')
      .replace(/!\[.+\]\(.+\)/g, '')
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<{ response: AxiosResponse; sessionId: string }> {
    const token = await this.acquireToken()
    
    const sessionId = await this.createSession()
    const challenge = await this.getChallenge('/api/v0/chat/completion')
    const challengeAnswer = await this.calculateChallengeAnswer(challenge)

    // Clone messages to avoid modifying original request
    // Note: Tool prompt injection is already handled by Forwarder.transformRequestForPromptToolUse()
    const messages = [...request.messages]

    let prompt = this.messagesToPrompt(messages, false)

    const { modelType, searchEnabled, thinkingEnabled } = resolveDeepSeekChatOptions(request, prompt)

    if (request.web_search || request.model.toLowerCase().includes('search')) {
      console.log('[DeepSeek] Web search enabled')
    }

    if (request.reasoning_effort || thinkingEnabled) {
      console.log('[DeepSeek] Reasoning mode enabled, effort:', request.reasoning_effort)
    }

    const response = await axios.post(
      `${DEEPSEEK_API_BASE}/v0/chat/completion`,
      {
        chat_session_id: sessionId,
        parent_message_id: null,
        prompt,
        model_type: modelType,
        ref_file_ids: [],
        search_enabled: searchEnabled,
        thinking_enabled: thinkingEnabled,
        preempt: false,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          ...createDeepSeekWebHeaders(),
          Referer: `https://chat.deepseek.com/a/chat/s/${sessionId}`,
          Cookie: generateCookie(),
          'X-Ds-Pow-Response': challengeAnswer,
        },
        timeout: 120000,
        validateStatus: () => true,
        responseType: 'stream',
      }
    )

    const contentType = String(response.headers?.['content-type'] || '').toLowerCase()
    if (contentType.includes('application/json')) {
      const responseText = await readBoundedResponseBody(response.data)
      let payload: unknown
      try {
        payload = JSON.parse(responseText)
      } catch {
        payload = null
      }
      throw new DeepSeekCompletionResponseError(
        getDeepSeekCompletionFailure(response.status, payload),
      )
    }

    return { response, sessionId }
  }

  async deleteAllChats(): Promise<boolean> {
    try {
      const token = await this.acquireToken()
      const result = await axios.post(
        `${DEEPSEEK_API_BASE}/v0/chat_session/delete_all`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            ...createDeepSeekWebHeaders(),
          },
          timeout: 30000,
          validateStatus: () => true,
        }
      )

      const success = result.status === 200 && result.data?.code === 0
      if (success) {
        sessionCache.clear()
        console.log('[DeepSeek] All chats deleted')
      }
      return success
    } catch {
      console.error('[DeepSeek] Failed to delete all chats')
      return false
    }
  }

  static isDeepSeekProvider(provider: Provider): boolean {
    return provider.id === 'deepseek' || provider.apiEndpoint.includes('deepseek.com')
  }

  /**
   * Clear session cache for a specific account
   * This should be called when a session is deleted externally (e.g., from web)
   */
  static clearSessionCache(accountId: string): void {
    sessionCache.delete(accountId)
  }
}

export const deepSeekAdapter = {
  DeepSeekAdapter,
}
