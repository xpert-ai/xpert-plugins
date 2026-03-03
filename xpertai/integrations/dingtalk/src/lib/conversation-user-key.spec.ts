import {
  buildAnonymousConversationKey,
  parseAnonymousConversationKey,
  resolveConversationUserKey
} from './conversation-user-key.js'

describe('conversation-user-key', () => {
  it('builds anonymous key with integrationId + conversationId + senderId', () => {
    expect(
      buildAnonymousConversationKey({
        integrationId: 'i-1',
        conversationId: 'c-1',
        senderId: 'u-1'
      })
    ).toBe('i-1:c-1:u-1')
  })

  it('parses anonymous key', () => {
    expect(parseAnonymousConversationKey('i-1:c-1:u-1')).toEqual({
      integrationId: 'i-1',
      conversationId: 'c-1',
      senderId: 'u-1'
    })
  })

  it('resolveConversationUserKey prefers anonymous key', () => {
    expect(
      resolveConversationUserKey({
        integrationId: 'i-1',
        conversationId: 'c-1',
        senderOpenId: 'u-1',
        fallbackUserId: 'fallback'
      })
    ).toBe('i-1:c-1:u-1')
  })
})
