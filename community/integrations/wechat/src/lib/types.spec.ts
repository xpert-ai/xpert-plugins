import {
  matchesWechatAllowedKeywords,
  matchesWechatMessageFilter,
  normalizeWechatConnectionMode,
  normalizeWechatInboundPayload,
  shouldAttemptWechatVoiceTranscription,
  shouldDispatchWechatMessage,
  summarizePayload
} from './types.js'
import {
  resolveWechatConversationIdentity,
  resolveWechatConversationUserKey
} from './conversation-user-key.js'

describe('wechat inbound normalization', () => {
  it('normalizes connection mode for backward compatible integrations', () => {
    expect(normalizeWechatConnectionMode('reverse_tunnel')).toBe('reverse_tunnel')
    expect(normalizeWechatConnectionMode('direct_http')).toBe('direct_http')
    expect(normalizeWechatConnectionMode(undefined)).toBe('direct_http')
  })

  it('redacts image bytes from payload summaries', () => {
    const summary = summarizePayload({
      imgbuf: 'raw-image-buffer',
      voicebuf: 'raw-voice-buffer',
      nested: {
        filedata: 'a'.repeat(600),
        preview: 'data:image/png;base64,iVBORw0KGgo=',
        audio: 'data:audio/wav;base64,UklGRg=='
      }
    })

    expect(summary).toContain('[redacted imgbuf length=16]')
    expect(summary).toContain('[redacted voicebuf length=16]')
    expect(summary).toContain('[redacted filedata length=600]')
    expect(summary).toContain('[redacted image data url]')
    expect(summary).toContain('[redacted audio data url]')
    expect(summary).not.toContain('raw-image-buffer')
    expect(summary).not.toContain('raw-voice-buffer')
    expect(summary).not.toContain('data:image/png;base64')
    expect(summary).not.toContain('data:audio/wav;base64')
  })

  it('normalizes legacy per-account callback wrapper', () => {
    const event = normalizeWechatInboundPayload({
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
        msgType: 1,
        messageKind: 'text',
        content: 'hello',
        isSelf: false
      })
    )
  })

  it('normalizes legacy wrapper image messages from explicit msg_type=3', () => {
    const event = normalizeWechatInboundPayload({
      key: 'uuid-1',
      type: 'message',
      message: {
        from_user_name: { str: 'wxid_friend' },
        to_user_name: { str: 'wxid_owner' },
        content: { str: '' },
        img_buf: { buffer: 'ignored-for-type' },
        msg_type: 3,
        msg_id: 123,
        new_msg_id: '1002',
        create_time: 1700000000
      }
    })

    expect(event).toEqual(
      expect.objectContaining({
        source: 'legacy_callback',
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        senderId: 'wxid_friend',
        chatType: 'private',
        messageId: '1002',
        msgType: 3,
        messageKind: 'image',
        content: '',
        mediaSignature: expect.stringContaining('image:uuid-1:1002:3')
      })
    )
    expect(event?.imageRef).toEqual(
      expect.objectContaining({
        uuid: 'uuid-1',
        newMsgId: '1002',
        msgType: 3,
        contactId: 'wxid_friend',
        fromUser: 'wxid_friend',
        toUser: 'wxid_owner',
        msgId: 123
      })
    )
  })

  it('normalizes global webhook payload', () => {
    const event = normalizeWechatInboundPayload({
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
        msgType: 1,
        messageKind: 'text',
        content: '@bot hello'
      })
    )
  })

  it('normalizes global webhook image payloads from explicit msgtype=3', () => {
    const event = normalizeWechatInboundPayload({
      uuid: 'uuid-1',
      ownerwxid: 'wxid_owner',
      contactid: 'room@chatroom',
      sendusername: 'wxid_sender',
      fromusername: 'room@chatroom',
      tousername: 'wxid_owner',
      chattype: 'group',
      content: '',
      pushcontent: '[图片]',
      imgbuf: 'redacted-in-summary',
      fileinfo: {
        filename: 'wechat-image.jpg',
        fileurl: 'file-key-1'
      },
      newmsgid: '2003',
      msgid: 456,
      msgtype: 3,
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
        messageId: '2003',
        msgType: 3,
        messageKind: 'image',
        content: '',
        displayText: '[图片]',
        mediaSignature: expect.stringContaining('image:uuid-1:2003:3')
      })
    )
    expect(event?.imageRef).toEqual(
      expect.objectContaining({
        uuid: 'uuid-1',
        newMsgId: '2003',
        msgContent: '',
        msgType: 3,
        contactId: 'room@chatroom',
        fromUser: 'room@chatroom',
        toUser: 'wxid_owner',
        msgId: 456,
        fileKey: 'file-key-1',
        originalName: 'wechat-image.jpg'
      })
    )
  })

  it('normalizes legacy wrapper voice messages from explicit msg_type=34', () => {
    const event = normalizeWechatInboundPayload({
      key: 'uuid-1',
      type: 'message',
      message: {
        from_user_name: { str: 'wxid_friend' },
        to_user_name: { str: 'wxid_owner' },
        content: {
          str: '<msg><voicemsg bufid="buf-legacy-1" voicelength="2400" voiceformat="4" length="12345" /></msg>'
        },
        push_content: '[语音]',
        msg_type: 34,
        msg_id: 234,
        new_msg_id: '1003',
        create_time: 1700000000
      }
    })

    expect(event).toEqual(
      expect.objectContaining({
        source: 'legacy_callback',
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        senderId: 'wxid_friend',
        chatType: 'private',
        messageId: '1003',
        msgType: 34,
        messageKind: 'voice',
        displayText: '[语音]',
        mediaSignature: expect.stringContaining('voice:uuid-1:1003:34')
      })
    )
    expect(event?.voiceRef).toEqual(
      expect.objectContaining({
        uuid: 'uuid-1',
        newMsgId: '1003',
        msgType: 34,
        contactId: 'wxid_friend',
        fromUser: 'wxid_friend',
        toUser: 'wxid_owner',
        msgId: 234,
        bufId: 'buf-legacy-1',
        durationMs: 2400,
        format: '4',
        byteLength: 12345
      })
    )
  })

  it('normalizes global webhook voice payloads from explicit msgtype=34', () => {
    const event = normalizeWechatInboundPayload({
      uuid: 'uuid-1',
      ownerwxid: 'wxid_owner',
      contactid: 'room@chatroom',
      sendusername: 'wxid_sender',
      fromusername: 'room@chatroom',
      tousername: 'wxid_owner',
      chattype: 'group',
      content: 'wxid_sender:\n<msg><voicemsg bufid="buf-global-1" voicelength="1800" voiceformat="4" /></msg>',
      pushcontent: 'sender 在群聊中发了一条语音',
      newmsgid: '2004',
      msgid: 567,
      msgtype: 34,
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
        messageId: '2004',
        msgType: 34,
        messageKind: 'voice',
        content: '<msg><voicemsg bufid="buf-global-1" voicelength="1800" voiceformat="4" /></msg>',
        displayText: 'sender 在群聊中发了一条语音',
        mediaSignature: expect.stringContaining('voice:uuid-1:2004:34')
      })
    )
    expect(event?.voiceRef).toEqual(
      expect.objectContaining({
        uuid: 'uuid-1',
        newMsgId: '2004',
        msgContent: 'wxid_sender:\n<msg><voicemsg bufid="buf-global-1" voicelength="1800" voiceformat="4" /></msg>',
        msgType: 34,
        contactId: 'room@chatroom',
        fromUser: 'room@chatroom',
        toUser: 'wxid_owner',
        msgId: 567,
        bufId: 'buf-global-1',
        durationMs: 1800,
        format: '4'
      })
    )
  })

  it('filters self, empty, unsupported media, and non-triggered group messages without inferring image display text', () => {
    const base = normalizeWechatInboundPayload({
      uuid: 'uuid-1',
      contactid: 'wxid_friend',
      sendusername: 'wxid_friend',
      content: 'hello',
      newmsgid: '3003',
      msgtype: 1,
      isself: false
    })

    expect(shouldDispatchWechatMessage({ ...base, isSelf: true })).toBeNull()
    expect(shouldDispatchWechatMessage({ ...base, isSelf: true }, { ignoreSelfMessages: false })?.triggerReason).toBe(
      'private'
    )
    expect(shouldDispatchWechatMessage({ ...base, content: '[图片]' })).toBeNull()
    expect(shouldDispatchWechatMessage({ ...base, content: '[语音]' })).toBeNull()
    expect(shouldDispatchWechatMessage({ ...base, content: '[语音]', displayText: '[语音]' })).toBeNull()
    expect(shouldDispatchWechatMessage({ ...base, msgType: 43, messageKind: 'unsupported' })).toBeNull()
    expect(
      shouldDispatchWechatMessage(
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

  it('uses trigger policy to decide whether voice should be transcribed', () => {
    const privateVoice = normalizeWechatInboundPayload({
      uuid: 'uuid-1',
      contactid: 'wxid_friend',
      sendusername: 'wxid_friend',
      content: '<msg><voicemsg /></msg>',
      pushcontent: '[语音]',
      newmsgid: 'voice-1',
      msgtype: 34,
      isself: false
    })
    expect(shouldDispatchWechatMessage(privateVoice)).toBeNull()
    expect(shouldAttemptWechatVoiceTranscription(privateVoice)?.triggerReason).toBe('private')

    const groupVoice = normalizeWechatInboundPayload({
      uuid: 'uuid-1',
      ownerwxid: 'wxid_owner',
      contactid: 'room@chatroom',
      sendusername: 'wxid_sender',
      content: '<msg><voicemsg /></msg>',
      pushcontent: '[语音]',
      newmsgid: 'voice-2',
      msgtype: 34,
      isself: false
    })
    expect(shouldAttemptWechatVoiceTranscription(groupVoice, { groupTriggerMode: 'off' })).toBeNull()
    expect(shouldAttemptWechatVoiceTranscription(groupVoice, { groupTriggerMode: 'all' })?.triggerReason).toBe(
      'group_all'
    )
    expect(shouldAttemptWechatVoiceTranscription(groupVoice, { groupTriggerMode: 'mentions' })).toBeNull()
    expect(
      shouldAttemptWechatVoiceTranscription(groupVoice, {
        groupTriggerMode: 'keywords',
        groupKeywords: ['总结']
      })?.triggerReason
    ).toBe('keyword_candidate')

    const mentionedVoice = normalizeWechatInboundPayload({
      uuid: 'uuid-1',
      ownerwxid: 'wxid_owner',
      contactid: 'room@chatroom',
      sendusername: 'wxid_sender',
      content: '<msg><voicemsg /></msg>',
      pushcontent: '[语音]',
      msgtype: 34,
      isself: false,
      msgsource: '<msgsource><atuserlist><![CDATA[wxid_owner]]></atuserlist></msgsource>',
      newmsgid: 'voice-3'
    })
    expect(
      shouldAttemptWechatVoiceTranscription(mentionedVoice, {
        groupTriggerMode: 'mentions'
      })?.triggerReason
    ).toBe('mention')
  })

  it('dispatches private, group mention, group keyword, and explicit image messages', () => {
    const privateEvent = normalizeWechatInboundPayload({
      uuid: 'uuid-1',
      contactid: 'wxid_friend',
      sendusername: 'wxid_friend',
      content: 'hello',
      newmsgid: '4004',
      msgtype: 1,
      isself: false
    })
    expect(shouldDispatchWechatMessage(privateEvent)?.triggerReason).toBe('private')

    const mentionEvent = normalizeWechatInboundPayload({
      uuid: 'uuid-1',
      ownerwxid: 'wxid_owner',
      contactid: 'room@chatroom',
      sendusername: 'wxid_sender',
      content: '@小白龙 帮我看一下',
      msgsource: '<msgsource><atuserlist><![CDATA[wxid_owner]]></atuserlist></msgsource>',
      newmsgid: '4005',
      msgtype: 1,
      isself: false
    })
    const mention = shouldDispatchWechatMessage(mentionEvent, {
      groupTriggerMode: 'mention_or_keywords'
    })
    expect(mention?.triggerReason).toBe('mention')
    expect(mention?.input).toBe('帮我看一下')

    const keywordEvent = normalizeWechatInboundPayload({
      uuid: 'uuid-1',
      contactid: 'room@chatroom',
      sendusername: 'wxid_sender',
      content: '小助手请总结',
      newmsgid: '4006',
      msgtype: 1,
      isself: false
    })
    expect(
      shouldDispatchWechatMessage(keywordEvent, {
        groupTriggerMode: 'keywords',
        groupKeywords: ['小助手']
      })?.triggerReason
    ).toBe('keyword')

    const privateImageEvent = normalizeWechatInboundPayload({
      uuid: 'uuid-1',
      contactid: 'wxid_friend',
      sendusername: 'wxid_friend',
      content: '<msg><img aeskey="download-token" /></msg>',
      pushcontent: '[图片]',
      newmsgid: '4007',
      msgtype: 3,
      isself: false
    })
    const privateImage = shouldDispatchWechatMessage(privateImageEvent)
    expect(privateImage?.triggerReason).toBe('private')
    expect(privateImage?.input).toBe('')

    const groupImageEvent = normalizeWechatInboundPayload({
      uuid: 'uuid-1',
      ownerwxid: 'wxid_owner',
      contactid: 'room@chatroom',
      sendusername: 'wxid_sender',
      content: '',
      pushcontent: 'XpertAI（元数信息技术）在群聊中发了一张图片',
      newmsgid: '4008',
      msgtype: 3,
      isself: false
    })
    const groupImage = shouldDispatchWechatMessage(groupImageEvent, {
      groupTriggerMode: 'all'
    })
    expect(groupImage?.triggerReason).toBe('group_all')
    expect(groupImage?.input).toBe('')
    expect(
      shouldDispatchWechatMessage(groupImageEvent, {
        groupTriggerMode: 'keywords',
        groupKeywords: ['XpertAI']
      })
    ).toBeNull()
    expect(
      shouldDispatchWechatMessage(groupImageEvent, {
        groupTriggerMode: 'mention_or_keywords',
        groupKeywords: ['小助手']
      })
    ).toBeNull()

    const mentionedImageEvent = normalizeWechatInboundPayload({
      uuid: 'uuid-1',
      ownerwxid: 'wxid_owner',
      contactid: 'room@chatroom',
      sendusername: 'wxid_sender',
      content: '<msg><img aeskey="download-token" /></msg>',
      msgsource: '<msgsource><atuserlist><![CDATA[wxid_owner]]></atuserlist></msgsource>',
      newmsgid: '4009',
      msgtype: 3,
      isself: false
    })
    const mentionedImage = shouldDispatchWechatMessage(mentionedImageEvent, {
      groupTriggerMode: 'mentions'
    })
    expect(mentionedImage?.triggerReason).toBe('mention')
    expect(mentionedImage?.input).toBe('')
  })

  it('applies allowed keyword filtering after normal trigger routing', () => {
    const privateEvent = normalizeWechatInboundPayload({
      uuid: 'uuid-1',
      contactid: 'wxid_friend',
      sendusername: 'wxid_friend',
      content: 'Please Handle this order',
      newmsgid: '4101',
      msgtype: 1,
      isself: false
    })
    expect(
      shouldDispatchWechatMessage(privateEvent, {
        allowedKeywords: ['handle']
      })?.triggerReason
    ).toBe('private')
    expect(
      shouldDispatchWechatMessage(privateEvent, {
        allowedKeywords: ['missing']
      })
    ).toBeNull()
    expect(
      shouldDispatchWechatMessage(privateEvent, {
        allowedKeywords: []
      })?.triggerReason
    ).toBe('private')

    const mentionEvent = normalizeWechatInboundPayload({
      uuid: 'uuid-1',
      ownerwxid: 'wxid_owner',
      contactid: 'room@chatroom',
      sendusername: 'wxid_sender',
      content: '@小白龙 请处理订单',
      msgsource: '<msgsource><atuserlist><![CDATA[wxid_owner]]></atuserlist></msgsource>',
      newmsgid: '4102',
      msgtype: 1,
      isself: false
    })
    expect(
      shouldDispatchWechatMessage(mentionEvent, {
        groupTriggerMode: 'mentions',
        allowedKeywords: ['处理']
      })?.triggerReason
    ).toBe('mention')
    expect(
      shouldDispatchWechatMessage(mentionEvent, {
        groupTriggerMode: 'mentions',
        allowedKeywords: ['missing']
      })
    ).toBeNull()

    const imageEvent = normalizeWechatInboundPayload({
      uuid: 'uuid-1',
      contactid: 'wxid_friend',
      sendusername: 'wxid_friend',
      content: '<msg><img aeskey="download-token" /></msg>',
      pushcontent: '[图片]',
      newmsgid: '4103',
      msgtype: 3,
      isself: false
    })
    expect(
      shouldDispatchWechatMessage(imageEvent, {
        allowedKeywords: ['图片']
      })
    ).toBeNull()

    const voiceEvent = normalizeWechatInboundPayload({
      uuid: 'uuid-1',
      contactid: 'wxid_friend',
      sendusername: 'wxid_friend',
      content: '<msg><voicemsg /></msg>',
      pushcontent: '[语音]',
      newmsgid: '4104',
      msgtype: 34,
      isself: false
    })
    expect(
      shouldAttemptWechatVoiceTranscription(voiceEvent, {
        allowedKeywords: ['总结']
      })?.triggerReason
    ).toBe('private')
    expect(matchesWechatAllowedKeywords('请总结这段语音', { allowedKeywords: ['总结'] })).toBe(true)
    expect(matchesWechatAllowedKeywords('请看一下', { allowedKeywords: ['总结'] })).toBe(false)
  })

  it('filters by chat type, group ids, contact ids, and sender ids', () => {
    const privateEvent = normalizeWechatInboundPayload({
      uuid: 'uuid-1',
      contactid: 'wxid_friend',
      sendusername: 'wxid_friend',
      content: 'hello',
      newmsgid: '5001',
      msgtype: 1,
      isself: false
    })
    const groupEvent = normalizeWechatInboundPayload({
      uuid: 'uuid-1',
      ownerwxid: 'wxid_owner',
      contactid: 'room@chatroom',
      sendusername: 'wxid_sender',
      content: '@小白龙 hello',
      msgsource: '<msgsource><atuserlist>wxid_owner</atuserlist></msgsource>',
      newmsgid: '5002',
      msgtype: 1,
      isself: false
    })

    expect(matchesWechatMessageFilter(privateEvent, { chatFilterMode: 'group_only' })).toBe(false)
    expect(matchesWechatMessageFilter(groupEvent, { chatFilterMode: 'group_only' })).toBe(true)
    expect(matchesWechatMessageFilter(groupEvent, { allowedGroupIds: ['other@chatroom'] })).toBe(false)
    expect(matchesWechatMessageFilter(groupEvent, { allowedGroupIds: ['room@chatroom'] })).toBe(true)
    expect(matchesWechatMessageFilter(groupEvent, { blockedGroupIds: ['room@chatroom'] })).toBe(false)
    expect(matchesWechatMessageFilter(privateEvent, { allowedContactIds: ['wxid_friend'] })).toBe(true)
    expect(matchesWechatMessageFilter(privateEvent, { blockedContactIds: ['wxid_friend'] })).toBe(false)
    expect(matchesWechatMessageFilter(groupEvent, { allowedSenderIds: ['wxid_sender'] })).toBe(true)
    expect(matchesWechatMessageFilter(groupEvent, { blockedSenderIds: ['wxid_sender'] })).toBe(false)
    expect(
      shouldDispatchWechatMessage(groupEvent, {
        chatFilterMode: 'group_only',
        allowedGroupIds: ['room@chatroom'],
        groupTriggerMode: 'mentions'
      })?.triggerReason
    ).toBe('mention')
  })

  it('only uses configured display names for loose @ mention fallback', () => {
    const groupEvent = normalizeWechatInboundPayload({
      uuid: 'uuid-1',
      ownerwxid: 'wxid_owner',
      contactid: 'room@chatroom',
      sendusername: 'wxid_sender',
      content: '@小白龙 帮我看一下',
      newmsgid: '5003',
      msgtype: 1,
      isself: false
    })

    expect(
      shouldDispatchWechatMessage(groupEvent, {
        groupTriggerMode: 'mentions'
      })
    ).toBeNull()
    const mention = shouldDispatchWechatMessage(groupEvent, {
      groupTriggerMode: 'mentions',
      mentionFallbackNames: ['小白龙']
    })
    expect(mention?.triggerReason).toBe('mention')
    expect(mention?.input).toBe('帮我看一下')
    expect(
      shouldDispatchWechatMessage(groupEvent, {
        groupTriggerMode: 'mentions',
        mentionFallbackNames: ['小白']
      })
    ).toBeNull()
  })

  it('builds conversation key with group sender split', () => {
    expect(
      resolveWechatConversationUserKey({
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'room@chatroom',
        senderId: 'wxid_sender'
      })
    ).toBe('integration-1:uuid-1:room@chatroom:wxid_sender')
  })

  it('builds private self-message keys from the real peer contact', () => {
    const keyA = resolveWechatConversationIdentity({
      integrationId: 'integration-1',
      uuid: 'uuid-1',
      ownerWxid: 'wxid_owner',
      contactId: 'wxid_owner',
      senderId: 'wxid_owner',
      fromUser: 'wxid_owner',
      toUser: 'wxid_friend_a',
      chatType: 'private',
      isSelf: true
    })
    const keyB = resolveWechatConversationIdentity({
      integrationId: 'integration-1',
      uuid: 'uuid-1',
      ownerWxid: 'wxid_owner',
      contactId: 'wxid_owner',
      senderId: 'wxid_owner',
      fromUser: 'wxid_owner',
      toUser: 'wxid_friend_b',
      chatType: 'private',
      isSelf: true
    })

    expect(keyA).toEqual(
      expect.objectContaining({
        contactId: 'wxid_friend_a',
        senderId: 'wxid_friend_a',
        conversationUserKey: 'integration-1:uuid-1:wxid_friend_a:wxid_friend_a'
      })
    )
    expect(keyB?.conversationUserKey).toBe('integration-1:uuid-1:wxid_friend_b:wxid_friend_b')
    expect(keyA?.conversationUserKey).not.toBe(keyB?.conversationUserKey)
  })

  it('keeps group conversations split by room and sender including self messages', () => {
    const senderA = resolveWechatConversationIdentity({
      integrationId: 'integration-1',
      uuid: 'uuid-1',
      ownerWxid: 'wxid_owner',
      contactId: 'room@chatroom',
      senderId: 'wxid_sender_a',
      chatType: 'group',
      isSelf: false
    })
    const senderB = resolveWechatConversationIdentity({
      integrationId: 'integration-1',
      uuid: 'uuid-1',
      ownerWxid: 'wxid_owner',
      contactId: 'room@chatroom',
      senderId: 'wxid_sender_b',
      chatType: 'group',
      isSelf: false
    })
    const self = resolveWechatConversationIdentity({
      integrationId: 'integration-1',
      uuid: 'uuid-1',
      ownerWxid: 'wxid_owner',
      contactId: 'room@chatroom',
      senderId: 'wxid_sender_from_payload',
      chatType: 'group',
      isSelf: true
    })

    expect(senderA?.conversationUserKey).toBe('integration-1:uuid-1:room@chatroom:wxid_sender_a')
    expect(senderB?.conversationUserKey).toBe('integration-1:uuid-1:room@chatroom:wxid_sender_b')
    expect(self?.conversationUserKey).toBe('integration-1:uuid-1:room@chatroom:wxid_owner')
  })
})
