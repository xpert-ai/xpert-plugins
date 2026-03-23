/**
 * @deprecated
 */
function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim()
  return normalized.length ? normalized : null
}

/**
 * @deprecated
 */
export function normalizeConversationUserKey(value: unknown): string | null {
  return normalizeString(value)
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

function normalizeIntegrationId(value: unknown): string | null {
  return normalizeString(value)
}

function normalizeLarkChatType(value: unknown): 'group' | 'p2p' | null {
  const normalized = normalizeString(value)?.toLowerCase()
  if (!normalized) {
    return null
  }

  if (normalized === 'group') {
    return 'group'
  }

  if (normalized === 'p2p' || normalized === 'private') {
    return 'p2p'
  }

  return null
}

export function toLarkConversationPrincipalKey(integrationId: unknown, senderOpenId: unknown): string | null {
  const normalizedIntegrationId = normalizeIntegrationId(integrationId)
  const normalizedSenderOpenId = normalizeString(senderOpenId)
  if (!normalizedIntegrationId || !normalizedSenderOpenId) {
    return null
  }

  return `lark:v2:principal:${normalizedIntegrationId}:open_id:${normalizedSenderOpenId}`
}

export function toLarkConversationScopeKey(params: {
  integrationId?: unknown
  chatType?: unknown
  chatId?: unknown
  senderOpenId?: unknown
}): string | null {
  const normalizedIntegrationId = normalizeIntegrationId(params.integrationId)
  const normalizedChatType = normalizeLarkChatType(params.chatType)
  if (!normalizedIntegrationId || !normalizedChatType) {
    return null
  }

  if (normalizedChatType === 'group') {
    const normalizedChatId = normalizeString(params.chatId)
    if (!normalizedChatId) {
      return null
    }
    return `lark:v2:scope:${normalizedIntegrationId}:group:${normalizedChatId}`
  }

  const normalizedSenderOpenId = normalizeString(params.senderOpenId)
  if (!normalizedSenderOpenId) {
    return null
  }

  return `lark:v2:scope:${normalizedIntegrationId}:p2p:${normalizedSenderOpenId}`
}

export function resolveConversationPrincipalKey(params: {
  integrationId?: unknown
  senderOpenId?: unknown
}): string | null {
  return toLarkConversationPrincipalKey(params.integrationId, params.senderOpenId)
}

export function resolveConversationScopeKey(params: {
  integrationId?: unknown
  chatType?: unknown
  chatId?: unknown
  senderOpenId?: unknown
}): string | null {
  return toLarkConversationScopeKey(params)
}

export function resolveConversationUserKey(params: {
  senderOpenId?: unknown
  fallbackUserId?: unknown
}): string | null {
  return toOpenIdConversationUserKey(params.senderOpenId) ?? normalizeConversationUserKey(params.fallbackUserId)
}
