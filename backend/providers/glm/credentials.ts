export function resolveGlmRefreshToken(credentials: Record<string, string | undefined>): string {
  const value = credentials.refresh_token
    || credentials.refreshToken
    || credentials.chatglm_refresh_token
    || credentials.token
    || ''
  return typeof value === 'string' ? value.trim() : ''
}
