export function createLarkMessage(
	overrides: Partial<{
		id: string
		messageId: string
		status: string
		language: string
		header: unknown
		elements: unknown[]
		integrationId: string
		chatId: string
		chatType: string
		senderOpenId: string
		principalKey: string
		scopeKey: string
		legacyConversationUserKey: string
		recipientDirectoryKey: string
		replyToMessageId: string
		typingReaction: {
			messageId: string
			reactionId: string
			emojiType: string
		}
		update: jest.Mock
		larkChannel: {
			deleteMessageReaction: jest.Mock
		}
	}> = {}
) {
	const larkChannel = overrides.larkChannel ?? {
		deleteMessageReaction: jest.fn().mockResolvedValue(undefined)
	}
	return {
		id: 'lark-message-id',
		messageId: 'chat-message-id',
		status: 'thinking',
		language: 'en_US',
		header: null,
		elements: [],
		integrationId: 'integration-1',
		chatId: 'chat-1',
		chatType: 'group',
		senderOpenId: 'ou_sender_1',
		principalKey: 'lark:v2:principal:integration-1:open_id:ou_sender_1',
		scopeKey: 'lark:v2:scope:integration-1:group:chat-1',
		legacyConversationUserKey: 'open_id:ou_sender_1',
		recipientDirectoryKey: 'lark:recipient-dir:integration-1:chat:chat-1',
		larkChannel,
		update: jest.fn().mockResolvedValue(undefined),
		...overrides
	}
}
