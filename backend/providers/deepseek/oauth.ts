/**
 * DeepSeek Authentication Adapter
 * Authentication method: Login using default browser, manually extract token
 */

import axios from 'axios'
import { BaseOAuthAdapter } from '../../oauth/adapters/base'
import { getRuntime } from '../../runtime'
import {
  createDeepSeekWebHeaders,
  getDeepSeekTokenValidationError,
  getDeepSeekUserData,
  normalizeDeepSeekUserToken,
} from './credentials'
import {
  OAuthResult,
  OAuthOptions,
  TokenValidationResult,
  AdapterConfig,
  OAuthCallbackData,
} from '../../oauth/types'

const DEEPSEEK_API_BASE = 'https://chat.deepseek.com'

export class DeepSeekAdapter extends BaseOAuthAdapter {
  constructor(config: AdapterConfig) {
    super({
      ...config,
      providerType: 'deepseek',
      authMethods: ['manual'],
      loginUrl: DEEPSEEK_API_BASE,
      apiUrl: DEEPSEEK_API_BASE,
    })
  }

  /**
   * Start login flow - Open default browser
   */
  async startLogin(options: OAuthOptions): Promise<OAuthResult> {
    this.emitProgress('pending', 'Opening browser...')
    
    try {
      await getRuntime().openExternal(DEEPSEEK_API_BASE)
      this.emitProgress('pending', 'Please log in via browser and enter Token manually')
      
      return {
        success: false,
        providerId: options.providerId,
        providerType: 'deepseek',
        error: 'Please log in via browser, extract Token from Developer Tools and enter manually',
      }
    } catch (error) {
      console.error('[DeepSeek] startLogin error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to open browser'
      this.emitProgress('error', errorMessage)
      
      return {
        success: false,
        providerId: options.providerId,
        providerType: 'deepseek',
        error: errorMessage,
      }
    }
  }

  /**
   * Complete authentication with manually entered token
   */
  async loginWithToken(providerId: string, token: string): Promise<OAuthResult> {
    this.emitProgress('pending', 'Validating Token...')
    const normalizedToken = normalizeDeepSeekUserToken(token)
    
    try {
      const validation = await this.validateToken({ token: normalizedToken })
      
      if (!validation.valid) {
        return {
          success: false,
          providerId,
          providerType: 'deepseek',
          error: validation.error || 'Token validation failed',
        }
      }
      
      this.emitProgress('success', 'Token validation successful')
      
      return {
        success: true,
        providerId,
        providerType: 'deepseek',
        // Persist only the bearer token, never DeepSeek's localStorage wrapper.
        credentials: { token: normalizedToken },
        accountInfo: validation.accountInfo,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.emitProgress('error', `Token validation failed: ${errorMessage}`)
      
      return {
        success: false,
        providerId,
        providerType: 'deepseek',
        error: errorMessage,
      }
    }
  }

  /**
   * Handle callback (DeepSeek does not support)
   */
  protected async processCallback(data: OAuthCallbackData): Promise<void> {
    // DeepSeek does not support OAuth callback
  }

  /**
   * Validate token validity
   */
  async validateToken(credentials: Record<string, string>): Promise<TokenValidationResult> {
    const token = normalizeDeepSeekUserToken(credentials.token || credentials.userToken)
    
    if (!token) {
      return {
        valid: false,
        error: 'DeepSeek userToken cannot be empty',
      }
    }
    
    try {
      const response = await axios.get(`${DEEPSEEK_API_BASE}/api/v0/users/current`, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...createDeepSeekWebHeaders(),
        },
        timeout: 15000,
        validateStatus: () => true,
      })
      
      const validationError = getDeepSeekTokenValidationError(response.status, response.data)
      if (validationError) {
        return {
          valid: false,
          error: validationError,
        }
      }
      
      const bizData = getDeepSeekUserData(response.data)
      if (!bizData) {
        return {
          valid: false,
          error: 'DeepSeek returned an unexpected account response. Sign in and import the userToken again.',
        }
      }
      
      return {
        valid: true,
        tokenType: 'access',
        accountInfo: {
          userId: bizData.id,
          email: bizData.email,
          name: bizData.name,
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Validation request failed'
      return {
        valid: false,
        error: errorMessage,
      }
    }
  }

  /**
   * DeepSeek's web userToken is renewed by a browser login. The current web
   * client does not expose a safe server-side refresh grant, so require a
   * fresh bookmarklet import instead of attempting to exchange the token.
   */
  async refreshToken(): Promise<null> {
    return null
  }
}

export default DeepSeekAdapter
