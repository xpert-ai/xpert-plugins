function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim()
  return normalized.length ? normalized : null
}

export function normalizeConversationUserKey(value: unknown): string | null {
  return normalizeString(value)
}

export function buildAnonymousConversationKey(params: {
  integrationId?: unknown
  conversationId?: unknown
  senderId?: unknown
}): string | null {
  const integrationId = normalizeString(params.integrationId)
  const conversationId = normalizeString(params.conversationId)
  const senderId = normalizeString(params.senderId)
  if (!integrationId || !conversationId || !senderId) {
    return null
  }
  return `${integrationId}:${conversationId}:${senderId}`
}

export function parseAnonymousConversationKey(value: unknown): {
  integrationId: string
  conversationId: string
  senderId: string
} | null {
  const normalized = normalizeString(value)
  if (!normalized) {
    return null
  }

  const parts = normalized.split(':')
  if (parts.length < 3) {
    return null
  }

  const senderId = parts[parts.length - 1]
  const conversationId = parts[parts.length - 2]
  const integrationId = parts.slice(0, -2).join(':')
  if (!integrationId || !conversationId || !senderId) {
    return null
  }

  return {
    integrationId,
    conversationId,
    senderId
  }
}

export function toOpenIdConversationUserKey(openId: unknown): string | null {
  const normalizedOpenId = normalizeString(openId)
  if (!normalizedOpenId) {
    return null
  }
  return `open_id:${normalizedOpenId}`
}

export function toRecipientConversationUserKey(type: unknown, id: unknown): string | null {
  const normalizedType = normalizeString(type)
  const normalizedId = normalizeString(id)
  if (!normalizedType || !normalizedId) {
    return null
  }
  return `${normalizedType}:${normalizedId}`
}

export function resolveConversationUserKey(params: {
  integrationId?: unknown
  conversationId?: unknown
  senderOpenId?: unknown
  fallbackUserId?: unknown
}): string | null {
  return (
    buildAnonymousConversationKey({
      integrationId: params.integrationId,
      conversationId: params.conversationId,
      senderId: params.senderOpenId
    }) ??
    toOpenIdConversationUserKey(params.senderOpenId) ??
    normalizeConversationUserKey(params.fallbackUserId)
  )
}
