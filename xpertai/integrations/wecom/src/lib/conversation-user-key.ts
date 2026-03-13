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

export function normalizeConversationUserKey(value: unknown): string | null {
  return normalizeString(value)
}
