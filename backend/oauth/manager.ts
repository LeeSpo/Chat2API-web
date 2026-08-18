/**
 * OAuth Flow Manager
 * Manages authentication flows for providers
 */

import { EventEmitter } from 'events'
import {
  ProviderType,
  OAuthResult,
  OAuthOptions,
  OAuthStatus,
  TokenValidationResult,
  CredentialInfo,
} from './types'
import { createAdapter, BaseOAuthAdapter } from './adapters'
import { getRuntime } from '../runtime'

const DEFAULT_CALLBACK_PORT = 8311
const DEFAULT_TIMEOUT = 300000

/**
 * OAuth Manager class
 */
export class OAuthManager extends EventEmitter {
  private adapters: Map<string, BaseOAuthAdapter> = new Map()
  private currentLogin: {
    providerId: string
    adapter: BaseOAuthAdapter
    resolve: (result: OAuthResult) => void
    reject: (error: Error) => void
    timeout: NodeJS.Timeout
  } | null = null

  private getAdapter(providerId: string, providerType: ProviderType): BaseOAuthAdapter {
    const key = `${providerId}_${providerType}`

    if (!this.adapters.has(key)) {
      const adapter = createAdapter(providerType, {
        providerId,
        providerType,
        authMethods: [],
        callbackPort: DEFAULT_CALLBACK_PORT,
      })

      adapter.setProgressCallback((event) => {
        this.emit('progress', event)
      })

      this.adapters.set(key, adapter)
    }

    return this.adapters.get(key)!
  }

  async startLogin(options: OAuthOptions): Promise<OAuthResult> {
    if (this.currentLogin) {
      return {
        success: false,
        providerId: options.providerId,
        providerType: options.providerType,
        error: 'A login process is already in progress',
      }
    }

    return new Promise((resolve, reject) => {
      const adapter = this.getAdapter(options.providerId, options.providerType)

      const timeout = setTimeout(() => {
        void this.cancelLogin()
        resolve({
          success: false,
          providerId: options.providerId,
          providerType: options.providerType,
          error: 'Login timeout',
        })
      }, options.timeout || DEFAULT_TIMEOUT)

      this.currentLogin = {
        providerId: options.providerId,
        adapter,
        resolve,
        reject,
        timeout,
      }

      this.emit('statusChange', 'pending')

      adapter.startLogin(options)
        .then((result) => {
          this.cleanup()
          resolve(result)
        })
        .catch((error) => {
          this.cleanup()
          reject(error)
        })
    })
  }

  async loginWithToken(
    providerId: string,
    providerType: ProviderType,
    token: string,
    realUserID?: string,
    mimoUserId?: string,
    mimoPhToken?: string,
  ): Promise<OAuthResult> {
    const adapter = this.getAdapter(providerId, providerType)

    if ('loginWithToken' in adapter && typeof (adapter as { loginWithToken?: Function }).loginWithToken === 'function') {
      return await (adapter as { loginWithToken: Function }).loginWithToken(
        providerId,
        token,
        realUserID,
        mimoUserId,
        mimoPhToken,
      )
    }

    if (providerType === 'mimo') {
      if (!mimoUserId || !mimoPhToken) {
        return {
          success: false,
          providerId,
          providerType,
          error: 'Mimo requires userId and phToken in addition to serviceToken',
        }
      }
      const validation = await adapter.validateToken({
        service_token: token,
        user_id: mimoUserId,
        ph_token: mimoPhToken,
      })

      if (!validation.valid) {
        return {
          success: false,
          providerId,
          providerType,
          error: validation.error || 'Token validation failed',
        }
      }

      return {
        success: true,
        providerId,
        providerType,
        credentials: {
          service_token: token,
          user_id: mimoUserId,
          ph_token: mimoPhToken,
        },
        accountInfo: validation.accountInfo,
      }
    }

    const validation = await adapter.validateToken({ token })

    if (!validation.valid) {
      return {
        success: false,
        providerId,
        providerType,
        error: validation.error || 'Token validation failed',
      }
    }

    return {
      success: true,
      providerId,
      providerType,
      credentials: { token },
      accountInfo: validation.accountInfo,
    }
  }

  async cancelLogin(): Promise<void> {
    if (this.currentLogin) {
      await this.currentLogin.adapter.cancelLogin()
      this.cleanup()
      this.emit('statusChange', 'cancelled')
    }
  }

  private cleanup(): void {
    if (this.currentLogin) {
      clearTimeout(this.currentLogin.timeout)
      this.currentLogin = null
    }
  }

  async validateToken(
    providerId: string,
    providerType: ProviderType,
    credentials: Record<string, string>,
  ): Promise<TokenValidationResult> {
    return this.getAdapter(providerId, providerType).validateToken(credentials)
  }

  async refreshToken(
    providerId: string,
    providerType: ProviderType,
    credentials: Record<string, string>,
  ): Promise<CredentialInfo | null> {
    return this.getAdapter(providerId, providerType).refreshToken(credentials)
  }

  async openBrowser(url: string): Promise<void> {
    await getRuntime().openExternal(url)
  }

  getStatus(): OAuthStatus {
    return this.currentLogin ? 'pending' : 'idle'
  }

  async startInAppLogin(
    providerId: string,
    providerType: ProviderType,
  ): Promise<OAuthResult> {
    return {
      success: false,
      providerId,
      providerType,
      error: 'In-app browser login is not supported. Use the bookmarklet or paste a token.',
    }
  }

  cancelInAppLogin(): void {}

  isInAppLoginOpen(): boolean {
    return false
  }

  destroy(): void {
    void this.cancelLogin()
    this.adapters.forEach((adapter) => adapter.destroy())
    this.adapters.clear()
    this.removeAllListeners()
  }
}

export const oauthManager = new OAuthManager()

export default OAuthManager
