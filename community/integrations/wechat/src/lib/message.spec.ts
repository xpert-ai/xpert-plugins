import { WechatMessage } from './message.js'

describe('WechatMessage', () => {
  it('passes senderName through reply context', async () => {
    const wechatChannel = {
      sendReplyByIntegrationId: jest.fn(async () => ({
        success: true,
        messageId: 'outbound-msg-1',
        items: []
      }))
    }
    const message = new WechatMessage(
      {
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        ownerWxid: 'wxid_owner',
        contactId: 'room@chatroom',
        chatType: 'group',
        senderId: 'wxid_member',
        senderName: 'Alice',
        atUsers: ['wxid_member'],
        wechatChannel
      },
      {
        id: 'inbound-log-1',
        messageId: 'inbound-msg-1',
        status: 'thinking'
      }
    )

    await message.reply('hello')

    expect(wechatChannel.sendReplyByIntegrationId).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        uuid: 'uuid-1',
        contactId: 'room@chatroom',
        content: 'hello',
        atUsers: ['wxid_member'],
        source: 'message_reply',
        context: expect.objectContaining({
          integrationId: 'integration-1',
          uuid: 'uuid-1',
          ownerWxid: 'wxid_owner',
          contactId: 'room@chatroom',
          chatType: 'group',
          senderId: 'wxid_member',
          senderName: 'Alice'
        })
      })
    )
    expect(message.id).toBe('outbound-msg-1')
  })
})
