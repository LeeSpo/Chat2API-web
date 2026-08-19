function readString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function parseVolcanoTokenInfo(raw: string): { deviceId?: string; sessionId?: string; trafficId?: string } {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      deviceId: readString(parsed.webId || parsed.web_id || parsed.deviceId),
      sessionId: readString(parsed.ssid || parsed.sessionId),
      trafficId: readString(parsed.userId || parsed.user_id || parsed.trafficId),
    }
  } catch {
    return {}
  }
}

/**
 * Browser imports may include volcano-token-info as a JSON blob. Expand it
 * into the device/session identifiers the Kimi adapter already understands.
 */
export function expandKimiImportedSession(
  credentials: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = { ...credentials }
  const raw = next.volcanoTokenInfo || next['volcano-token-info']
  if (raw) {
    const ids = parseVolcanoTokenInfo(raw)
    if (ids.deviceId && !next.deviceId) next.deviceId = ids.deviceId
    if (ids.sessionId && !next.sessionId) next.sessionId = ids.sessionId
    if (ids.trafficId && !next.trafficId) next.trafficId = ids.trafficId
    delete next.volcanoTokenInfo
    delete next['volcano-token-info']
  }
  return next
}
