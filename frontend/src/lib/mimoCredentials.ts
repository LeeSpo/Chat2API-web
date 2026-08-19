export interface MimoImportedCredentials {
  service_token: string
  user_id: string
  ph_token: string
}

export type MimoCredentialParseResult =
  | { success: true; credentials: MimoImportedCredentials }
  | { success: false; missing: Array<'serviceToken' | 'userId' | 'xiaomichatbot_ph'> }

function extractCookieHeader(input: string): string {
  const normalized = input.replace(/\\\r?\n/g, ' ')
  const headerPattern = /(?:-H|--header)\s+(["'])([\s\S]*?)\1/g
  let headerMatch: RegExpExecArray | null
  while ((headerMatch = headerPattern.exec(normalized))) {
    const header = headerMatch[2].trim()
    if (/^cookie\s*:/i.test(header)) return header.replace(/^cookie\s*:\s*/i, '')
  }

  const cookieArgument = normalized.match(/(?:-b|--cookie)\s+(["'])([\s\S]*?)\1/)
  if (cookieArgument) return cookieArgument[2].trim()

  const rawHeader = normalized.match(/^\s*cookie\s*:\s*([\s\S]+)$/i)
  if (rawHeader) return rawHeader[1].trim()

  return normalized.trim()
}

function parseCookiePairs(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .flatMap((part) => {
        const separator = part.indexOf('=')
        if (separator <= 0) return []
        const key = part.slice(0, separator).trim()
        const rawCookieValue = part.slice(separator + 1).trim()
        const cookieValue = rawCookieValue.length >= 2
          && ((rawCookieValue.startsWith('"') && rawCookieValue.endsWith('"'))
            || (rawCookieValue.startsWith("'") && rawCookieValue.endsWith("'")))
          ? rawCookieValue.slice(1, -1)
          : rawCookieValue
        return key && cookieValue ? [[key, cookieValue]] : []
      }),
  )
}

export function parseMimoCredentials(input: string): MimoCredentialParseResult {
  const cookies = parseCookiePairs(extractCookieHeader(input))
  const serviceToken = cookies.xiaomichatbot_serviceToken
    || cookies.michatbot_serviceToken
    || cookies.serviceToken
    || cookies.service_token
    || ''
  const userId = cookies.userId || cookies.user_id || ''
  const phToken = cookies.xiaomichatbot_ph || cookies.ph_token || ''
  const missing: Array<'serviceToken' | 'userId' | 'xiaomichatbot_ph'> = []

  if (!serviceToken) missing.push('serviceToken')
  if (!userId) missing.push('userId')
  if (!phToken) missing.push('xiaomichatbot_ph')
  if (missing.length > 0) return { success: false, missing }

  return {
    success: true,
    credentials: {
      service_token: serviceToken,
      user_id: userId,
      ph_token: phToken,
    },
  }
}
