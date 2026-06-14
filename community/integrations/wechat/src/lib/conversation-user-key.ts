export function normalizeConversationKey(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const text = value.trim()
  return text || undefined
}

export function resolveWechatPersonalConversationUserKey(params: {
  integrationId: string
  uuid: string
  contactId: string
  senderId?: string | null
}): string | undefined {
  const integrationId = normalizeConversationKey(params.integrationId)
  const uuid = normalizeConversationKey(params.uuid)
  const contactId = normalizeConversationKey(params.contactId)
  const senderId = normalizeConversationKey(params.senderId) || contactId
  if (!integrationId || !uuid || !contactId || !senderId) {
    return undefined
  }
  return `${integrationId}:${uuid}:${contactId}:${senderId}`
}

export function parseWechatPersonalConversationUserKey(value: unknown):
  | {
      integrationId: string
      uuid: string
      contactId: string
      senderId: string
    }
  | undefined {
  const text = normalizeConversationKey(value)
  if (!text) {
    return undefined
  }
  const [integrationId, uuid, contactId, senderId] = text.split(':')
  if (!integrationId || !uuid || !contactId || !senderId) {
    return undefined
  }
  return { integrationId, uuid, contactId, senderId }
}
