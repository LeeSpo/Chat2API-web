export interface TokenExtractionGuide {
  loginUrl: string
  steps: string[]
  tokenKey: string
  tokenLabel: string
  storageType: 'localStorage' | 'cookie' | 'other'
  placeholder?: string
  helpUrl?: string
}

export const TOKEN_EXTRACTION_GUIDES: Record<string, TokenExtractionGuide> = {
  deepseek: {
    loginUrl: 'https://chat.deepseek.com',
    steps: [
      '1. Click the button below to open DeepSeek website',
      '2. Log in to your account',
      '3. Press F12 to open Developer Tools',
      '4. Switch to the Application tab',
      '5. Find Local Storage → chat.deepseek.com on the left',
      '6. Find the userToken field and copy its value (not a Cookie; Chat2API also accepts the current JSON-wrapped storage value)',
    ],
    tokenKey: 'userToken',
    tokenLabel: 'Token',
    storageType: 'localStorage',
    placeholder: 'Paste the Token obtained from DeepSeek',
  },
  qwen: {
    loginUrl: 'https://www.qianwen.com',
    steps: [
      '1. Click the button below to open Qwen website',
      '2. Log in to your account',
      '3. Press F12 to open Developer Tools',
      '4. Switch to the Application tab',
      '5. Find Cookies → www.qianwen.com on the left',
      '6. Find tongyi_sso_ticket and copy its value',
    ],
    tokenKey: 'tongyi_sso_ticket',
    tokenLabel: 'Ticket',
    storageType: 'cookie',
    placeholder: 'Paste the Ticket obtained from Qwen',
  },
  glm: {
    loginUrl: 'https://chatglm.cn',
    steps: [
      '1. Click the button below to open GLM website',
      '2. Log in to your account',
      '3. Press F12 to open Developer Tools',
      '4. Switch to the Application tab',
      '5. Find Cookies → chatglm.cn on the left',
      '6. Copy chatglm_refresh_token (not an access token)',
    ],
    tokenKey: 'chatglm_refresh_token',
    tokenLabel: 'Refresh Token',
    storageType: 'cookie',
    placeholder: 'Paste chatglm_refresh_token from GLM',
  },
  kimi: {
    loginUrl: 'https://www.kimi.com',
    steps: [
      '1. Click the button below to open Kimi website',
      '2. Log in to your account',
      '3. Press F12 to open Developer Tools',
      '4. Switch to the Network tab',
      '5. Refresh the page or send a message',
      '6. Find any API request and check the Authorization header',
      '7. Copy the token value after Bearer',
    ],
    tokenKey: 'authorization',
    tokenLabel: 'Token',
    storageType: 'other',
    placeholder: 'Paste the Token obtained from Kimi',
  },
  minimax: {
    loginUrl: 'https://agent.minimaxi.com',
    steps: [
      '1. Click the button below to open MiniMax Agent',
      '2. Log in to your account',
      '3. Press F12 to open Developer Tools',
      '4. Switch to the Application tab',
      '5. Find Local Storage → agent.minimaxi.com on the left',
      '6. Copy _token. _userId is optional because the JWT already contains the user id',
    ],
    tokenKey: '_token',
    tokenLabel: 'Token',
    storageType: 'localStorage',
    placeholder: 'Paste _token from MiniMax Agent',
  },
}

export function getGuideByProvider(providerType: string): TokenExtractionGuide | undefined {
  return TOKEN_EXTRACTION_GUIDES[providerType]
}
