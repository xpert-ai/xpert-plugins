function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const text = value.trim()
  return text ? text : null
}

export function resolveConversationUserKey(params: {
  integrationId?: unknown
  chatId?: unknown
  senderId?: unknown
  fallbackUserId?: unknown
}): string | null {
  const integrationId = normalizeString(params.integrationId)
  const chatId = normalizeString(params.chatId)
  const senderId = normalizeString(params.senderId) || normalizeString(params.fallbackUserId)

  if (!integrationId || !chatId || !senderId) {
    return null
  }

  return `${integrationId}:${chatId}:${senderId}`
}

export function parseConversationUserKey(value: unknown): {
  integrationId: string
  chatId: string
  senderId: string
} | null {
  const normalized = normalizeString(value)
  if (!normalized) {
    return null
  }

  const segments = normalized.split(':')
  if (segments.length < 3) {
    return null
  }

  const integrationId = normalizeString(segments[0])
  const senderId = normalizeString(segments[segments.length - 1])
  const chatId = normalizeString(segments.slice(1, -1).join(':'))
  if (!integrationId || !chatId || !senderId) {
    return null
  }

  return {
    integrationId,
    chatId,
    senderId
  }
}

export function normalizeConversationUserKey(value: unknown): string | null {
  return normalizeString(value)
}
