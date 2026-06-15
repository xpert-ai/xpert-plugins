import {
  matchesWechatPersonalMessageFilter,
  normalizeWechatPersonalConnectionMode,
  normalizeWechatPersonalInboundPayload,
  shouldDispatchWechatPersonalMessage
} from './types.js'
import { resolveWechatPersonalConversationUserKey } from './conversation-user-key.js'

describe('wechat personal inbound normalization', () => {
  it('normalizes connection mode for backward compatible integrations', () => {
    expect(normalizeWechatPersonalConnectionMode('reverse_tunnel')).toBe('reverse_tunnel')
    expect(normalizeWechatPersonalConnectionMode('direct_http')).toBe('direct_http')
    expect(normalizeWechatPersonalConnectionMode(undefined)).toBe('direct_http')
  })

  it('normalizes legacy per-account callback wrapper', () => {
    const event = normalizeWechatPersonalInboundPayload({
      key: 'uuid-1',
      type: 'message',
      message: {
        from_user_name: { str: 'wxid_friend' },
        to_user_name: { str: 'wxid_owner' },
        content: { str: 'hello' },
        msg_type: 1,
        new_msg_id: '1001',
        create_time: 1700000000
      }
    })

    expect(event).toEqual(
      expect.objectContaining({
        source: 'legacy_callback',
        uuid: 'uuid-1',
        ownerWxid: 'wxid_owner',
        contactId: 'wxid_friend',
        senderId: 'wxid_friend',
        chatType: 'private',
        messageId: '1001',
        content: 'hello',
        isSelf: false
      })
    )
  })

  it('normalizes global webhook payload', () => {
    const event = normalizeWechatPersonalInboundPayload({
      uuid: 'uuid-1',
      ownerwxid: 'wxid_owner',
      contactid: 'room@chatroom',
      sendusername: 'wxid_sender',
      chattype: 'group',
      content: 'wxid_sender:\n@bot hello',
      pushcontent: 'sender: @bot hello',
      newmsgid: '2002',
      msgtype: 1,
      isself: false
    })

    expect(event).toEqual(
      expect.objectContaining({
        source: 'message_webhook',
        uuid: 'uuid-1',
        ownerWxid: 'wxid_owner',
        contactId: 'room@chatroom',
        senderId: 'wxid_sender',
        chatType: 'group',
        messageId: '2002',
        content: '@bot hello'
      })
    )
  })

  it('filters self, empty, media-only, and non-triggered group messages', () => {
    const base = normalizeWechatPersonalInboundPayload({
      uuid: 'uuid-1',
      contactid: 'wxid_friend',
      sendusername: 'wxid_friend',
      content: 'hello',
      newmsgid: '3003',
      msgtype: 1,
      isself: false
    })

    expect(shouldDispatchWechatPersonalMessage({ ...base, isSelf: true })).toBeNull()
    expect(shouldDispatchWechatPersonalMessage({ ...base, content: '[图片]' })).toBeNull()
    expect(shouldDispatchWechatPersonalMessage({ ...base, msgType: 3 })).toBeNull()
    expect(
      shouldDispatchWechatPersonalMessage(
        {
          ...base,
          contactId: 'room@chatroom',
          chatId: 'room@chatroom',
          chatType: 'group',
          content: 'ordinary chatter'
        },
        {
          groupTriggerMode: 'mention_or_keywords',
          groupKeywords: ['help']
        }
      )
    ).toBeNull()
  })

  it('dispatches private, group mention, and group keyword messages', () => {
    const privateEvent = normalizeWechatPersonalInboundPayload({
      uuid: 'uuid-1',
      contactid: 'wxid_friend',
      sendusername: 'wxid_friend',
      content: 'hello',
      newmsgid: '4004',
      msgtype: 1,
      isself: false
    })
    expect(shouldDispatchWechatPersonalMessage(privateEvent)?.triggerReason).toBe('private')

    const mentionEvent = normalizeWechatPersonalInboundPayload({
      uuid: 'uuid-1',
      ownerwxid: 'wxid_owner',
      contactid: 'room@chatroom',
      sendusername: 'wxid_sender',
      content: '@bot 帮我看一下',
      newmsgid: '4005',
      msgtype: 1,
      isself: false
    })
    const mention = shouldDispatchWechatPersonalMessage(mentionEvent, {
      groupTriggerMode: 'mention_or_keywords'
    })
    expect(mention?.triggerReason).toBe('mention')
    expect(mention?.input).toBe('帮我看一下')

    const keywordEvent = normalizeWechatPersonalInboundPayload({
      uuid: 'uuid-1',
      contactid: 'room@chatroom',
      sendusername: 'wxid_sender',
      content: '小助手请总结',
      newmsgid: '4006',
      msgtype: 1,
      isself: false
    })
    expect(
      shouldDispatchWechatPersonalMessage(keywordEvent, {
        groupTriggerMode: 'keywords',
        groupKeywords: ['小助手']
      })?.triggerReason
    ).toBe('keyword')
  })

  it('filters by chat type, group ids, contact ids, and sender ids', () => {
    const privateEvent = normalizeWechatPersonalInboundPayload({
      uuid: 'uuid-1',
      contactid: 'wxid_friend',
      sendusername: 'wxid_friend',
      content: 'hello',
      newmsgid: '5001',
      msgtype: 1,
      isself: false
    })
    const groupEvent = normalizeWechatPersonalInboundPayload({
      uuid: 'uuid-1',
      contactid: 'room@chatroom',
      sendusername: 'wxid_sender',
      content: '@bot hello',
      newmsgid: '5002',
      msgtype: 1,
      isself: false
    })

    expect(matchesWechatPersonalMessageFilter(privateEvent, { chatFilterMode: 'group_only' })).toBe(false)
    expect(matchesWechatPersonalMessageFilter(groupEvent, { chatFilterMode: 'group_only' })).toBe(true)
    expect(matchesWechatPersonalMessageFilter(groupEvent, { allowedGroupIds: ['other@chatroom'] })).toBe(false)
    expect(matchesWechatPersonalMessageFilter(groupEvent, { allowedGroupIds: ['room@chatroom'] })).toBe(true)
    expect(matchesWechatPersonalMessageFilter(groupEvent, { blockedGroupIds: ['room@chatroom'] })).toBe(false)
    expect(matchesWechatPersonalMessageFilter(privateEvent, { allowedContactIds: ['wxid_friend'] })).toBe(true)
    expect(matchesWechatPersonalMessageFilter(privateEvent, { blockedContactIds: ['wxid_friend'] })).toBe(false)
    expect(matchesWechatPersonalMessageFilter(groupEvent, { allowedSenderIds: ['wxid_sender'] })).toBe(true)
    expect(matchesWechatPersonalMessageFilter(groupEvent, { blockedSenderIds: ['wxid_sender'] })).toBe(false)
    expect(
      shouldDispatchWechatPersonalMessage(groupEvent, {
        chatFilterMode: 'group_only',
        allowedGroupIds: ['room@chatroom'],
        groupTriggerMode: 'mentions'
      })?.triggerReason
    ).toBe('mention')
  })

  it('builds conversation key with group sender split', () => {
    expect(
      resolveWechatPersonalConversationUserKey({
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'room@chatroom',
        senderId: 'wxid_sender'
      })
    ).toBe('integration-1:uuid-1:room@chatroom:wxid_sender')
  })
})
