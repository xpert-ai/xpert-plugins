type WechatChatContextAliasSource = Record<string, unknown> & {
  wechatConversation?: boolean
  channelSource?: string
  contactId?: string
  chatId?: string
  chatType?: 'private' | 'group'
  senderId?: string
  senderName?: string
}

export function withWechatChatContextLegacyAliases<T extends WechatChatContextAliasSource>(context: T): T {
  const aliased = { ...context } as T & Record<string, unknown>
  const aliasTarget: Record<string, unknown> = aliased
  if (context.wechatConversation !== undefined) {
    aliasTarget['wechat_conversation'] = context.wechatConversation
  }
  if (context.channelSource !== undefined) {
    aliasTarget['channel_source'] = context.channelSource
  }
  if (context.contactId !== undefined) {
    aliasTarget['contact_id'] = context.contactId
  }
  if (context.chatId !== undefined) {
    aliasTarget['chat_id'] = context.chatId
  }
  if (context.chatType !== undefined) {
    aliasTarget['chat_type'] = context.chatType
  }
  if (context.senderId !== undefined) {
    aliasTarget['sender_id'] = context.senderId
  }
  if (context.senderName !== undefined) {
    aliasTarget['sender_name'] = context.senderName
  }
  return aliased
}
