export function normalizeConversationKey(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const text = value.trim()
  return text || undefined
}

export type WechatConversationIdentity = {
  integrationId: string
  uuid: string
  contactId: string
  senderId: string
  chatType: 'private' | 'group'
  conversationUserKey: string
}

export function resolveWechatConversationIdentity(params: {
  integrationId: string
  uuid: string
  contactId?: string | null
  senderId?: string | null
  ownerWxid?: string | null
  fromUser?: string | null
  toUser?: string | null
  chatType?: 'private' | 'group' | null
  isSelf?: boolean | null
}): WechatConversationIdentity | undefined {
  const integrationId = normalizeConversationKey(params.integrationId)
  const uuid = normalizeConversationKey(params.uuid)
  if (!integrationId || !uuid) {
    return undefined
  }

  const contactId = normalizeConversationKey(params.contactId)
  const ownerWxid = normalizeConversationKey(params.ownerWxid)
  const fromUser = normalizeConversationKey(params.fromUser)
  const toUser = normalizeConversationKey(params.toUser)
  const rawSenderId = normalizeConversationKey(params.senderId)
  const chatType = params.chatType === 'group' || isGroupContact(contactId) || isGroupContact(fromUser) || isGroupContact(toUser)
    ? 'group'
    : 'private'

  if (chatType === 'group') {
    const roomId = [contactId, fromUser, toUser].find((value) => isGroupContact(value))
    const senderId = params.isSelf && ownerWxid ? ownerWxid : rawSenderId || ownerWxid
    if (!roomId || !senderId) {
      return undefined
    }
    return {
      integrationId,
      uuid,
      contactId: roomId,
      senderId,
      chatType,
      conversationUserKey: `${integrationId}:${uuid}:${roomId}:${senderId}`
    }
  }

  const peerContactId = firstNonOwner(
    ownerWxid,
    contactId,
    params.isSelf ? toUser : undefined,
    params.isSelf === false ? fromUser : undefined,
    rawSenderId,
    fromUser,
    toUser
  )
  if (!peerContactId) {
    return undefined
  }

  return {
    integrationId,
    uuid,
    contactId: peerContactId,
    senderId: peerContactId,
    chatType,
    conversationUserKey: `${integrationId}:${uuid}:${peerContactId}:${peerContactId}`
  }
}

export function resolveWechatConversationUserKey(params: {
  integrationId: string
  uuid: string
  contactId?: string | null
  senderId?: string | null
  ownerWxid?: string | null
  fromUser?: string | null
  toUser?: string | null
  chatType?: 'private' | 'group' | null
  isSelf?: boolean | null
}): string | undefined {
  return resolveWechatConversationIdentity(params)?.conversationUserKey
}

export function parseWechatConversationUserKey(value: unknown):
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

function firstNonOwner(ownerWxid: string | undefined, ...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value && value !== ownerWxid && !isGroupContact(value))
}

function isGroupContact(value?: string): boolean {
  return !!value?.endsWith('@chatroom')
}
