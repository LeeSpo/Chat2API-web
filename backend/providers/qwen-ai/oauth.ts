/**
 * Qwen AI (International) Authentication Adapter
 * Implements chat.qwen.ai API authentication
 */

import axios from 'axios'
import { BaseOAuthAdapter } from '../../oauth/adapters/base'
import { resolveQwenAiAuthHeaders } from './token-refresh'
import {
  OAuthResult,
  OAuthOptions,
  TokenValidationResult,
  CredentialInfo,
  AdapterConfig,
  OAuthCallbackData,
} from '../../oauth/types'

const QWEN_AI_API_BASE = 'https://chat.qwen.ai'

const FAKE_HEADERS = {
  Accept: 'application/json',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
  Origin: QWEN_AI_API_BASE,
  Pragma: 'no-cache',
  'Sec-Ch-Ua': '"Chromium";v="144", "Not(A:Brand";v="8", "Google Chrome";v="144"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
  source: 'web',
  Version: '0.2.67',
}

type UserInfoLookup =
  | { kind: 'success'; userInfo: Record<string, unknown> }
  | { kind: 'authentication-failed'; error: string }
  | { kind: 'unavailable' }

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=')
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null
  } catch {
    return null
  }
}

function readCredential(credentials: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = credentials[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function hasExplicitAuthenticationFailure(status: number, body: unknown): boolean {
  if (status === 401 || status === 403) return true
  try {
    return /(?:invalid|expired|missing|unauthori[sz]ed|not[ _-]*login|login[ _-]*required).{0,80}(?:token|auth|credential|session)|(?:token|auth|credential|session).{0,80}(?:invalid|expired|missing|unauthori[sz]ed|not[ _-]*login|login[ _-]*required)/i
      .test(JSON.stringify(body || {}))
  } catch {
    return false
  }
}

export class QwenAiAdapter extends BaseOAuthAdapter {
  constructor(config: AdapterConfig) {
    super({
      ...config,
      providerType: 'qwen-ai',
      authMethods: ['manual'],
      loginUrl: QWEN_AI_API_BASE,
      apiUrl: QWEN_AI_API_BASE,
    })
  }

  async loginWithToken(
    providerId: string,
    token: string,
    importedCredentials: Record<string, string> = {},
  ): Promise<OAuthResult> {
    this.emitProgress('pending', 'Validating Token...')
    
    try {
      const credentials = { ...importedCredentials, token }
      const validation = await this.validateToken(credentials)
      
      if (!validation.valid) {
        return {
          success: false,
          providerId,
          providerType: 'qwen-ai',
          error: validation.error || 'Token validation failed',
        }
      }
      
      this.emitProgress('success', 'Token validation successful')
      
      return {
        success: true,
        providerId,
        providerType: 'qwen-ai',
        credentials,
        accountInfo: validation.accountInfo,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Validation request failed'
      return {
        success: false,
        providerId,
        providerType: 'qwen-ai',
        error: errorMessage,
      }
    }
  }

  protected async processCallback(data: OAuthCallbackData): Promise<void> {
    // Qwen AI does not support OAuth callback
  }

  async validateToken(credentials: Record<string, string>): Promise<TokenValidationResult> {
    const token = credentials.token
    
    if (!token) {
      return {
        valid: false,
        error: 'Token cannot be empty',
      }
    }
    
    if (token.startsWith('eyJ') && token.split('.').length === 3) {
      const payload = decodeJwtPayload(token)
      if (!payload) {
        return {
          valid: false,
          error: 'Invalid JWT token',
        }
      }

      const email = typeof payload.email === 'string' ? payload.email : ''
      if (email.includes('@guest.com')) {
        return {
          valid: false,
          error: 'Guest account not allowed, please login with a real account',
        }
      }

      const userId = payload.sub || payload.id || payload.user_id || payload.uid
      if (typeof userId !== 'string' && typeof userId !== 'number') {
        return {
          valid: false,
          error: 'Token does not contain an account identity',
        }
      }

      const normalizedUserId = String(userId)
      const lookup = await this.getUserInfo(credentials)
      console.log('[QwenAi OAuth] User info lookup:', lookup.kind)

      if (lookup.kind === 'authentication-failed') {
        return {
          valid: false,
          error: lookup.error,
        }
      }

      if (lookup.kind === 'success' && lookup.userInfo.is_guest === true) {
        return {
          valid: false,
          error: 'Guest account not allowed, please login with a real account',
        }
      }

      const userInfo = lookup.kind === 'success' ? lookup.userInfo : {}
      const name = typeof payload.name === 'string'
        ? payload.name
        : typeof userInfo.name === 'string'
          ? userInfo.name
          : email || normalizedUserId

      return {
        valid: true,
        tokenType: 'access',
        accountInfo: {
          userId: normalizedUserId,
          email: email || (typeof userInfo.email === 'string' ? userInfo.email : ''),
          name,
        },
      }
    }
    
    return {
      valid: false,
      error: 'Token is invalid',
    }
  }

  async getUserInfo(credentials: Record<string, string>): Promise<UserInfoLookup> {
    try {
      const token = readCredential(credentials, 'token', 'accessToken')
      const cookies = readCredential(credentials, 'cookies', 'cookie')
      const response = await axios.get(`${QWEN_AI_API_BASE}/api/v2/user/info`, {
        headers: {
          ...FAKE_HEADERS,
          ...resolveQwenAiAuthHeaders(token, cookies),
          ...(readCredential(credentials, 'baxiaUidToken', 'baxia_uid_token', 'uidToken')
            ? { 'bx-umidtoken': readCredential(credentials, 'baxiaUidToken', 'baxia_uid_token', 'uidToken') }
            : {}),
          ...(readCredential(credentials, 'baxiaUa', 'baxia_ua', 'bxUa', 'bx_ua')
            ? { 'bx-ua': readCredential(credentials, 'baxiaUa', 'baxia_ua', 'bxUa', 'bx_ua') }
            : {}),
          ...(readCredential(credentials, 'baxiaVersion', 'baxia_version', 'bxV', 'bx_v')
            ? { 'bx-v': readCredential(credentials, 'baxiaVersion', 'baxia_version', 'bxV', 'bx_v') }
            : {}),
          ...(readCredential(credentials, 'x5secdata')
            ? { x5secdata: readCredential(credentials, 'x5secdata') }
            : {}),
          ...(readCredential(credentials, 'x5sectag')
            ? { x5sectag: readCredential(credentials, 'x5sectag') }
            : {}),
        },
        timeout: 15000,
        validateStatus: () => true,
      })
      
      if (response.status === 200 && response.data?.success && response.data.data) {
        return { kind: 'success', userInfo: response.data.data }
      }

      if (hasExplicitAuthenticationFailure(response.status, response.data)) {
        return {
          kind: 'authentication-failed',
          error: 'Qwen AI rejected the imported browser session. Please sign in again and generate a new bookmarklet.',
        }
      }

      return { kind: 'unavailable' }
    } catch {
      return { kind: 'unavailable' }
    }
  }

  async refreshToken(credentials: Record<string, string>): Promise<CredentialInfo | null> {
    return null
  }
}

export default QwenAiAdapter
