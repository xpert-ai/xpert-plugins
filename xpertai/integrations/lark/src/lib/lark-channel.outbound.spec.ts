import { LarkChannelStrategy } from './lark-channel.strategy.js'
import { LARK_TYPING_REACTION_EMOJI_TYPE } from './types.js'

function createFixture() {
	const strategy = new LarkChannelStrategy(
		{
			resolve: jest.fn()
		} as any,
		{} as any
	)

	const messageCreate = jest.fn()
	const reactionCreate = jest.fn()
	const reactionDelete = jest.fn()
	const client = {
		im: {
			message: {
				create: messageCreate
			},
			messageReaction: {
				create: reactionCreate,
				delete: reactionDelete
			}
		}
	}

	jest.spyOn(strategy as any, 'getOrCreateLarkClientById').mockResolvedValue(client)
	jest.spyOn(strategy as any, 'assertCardPayloadSupportedByIntegrationId').mockResolvedValue(undefined)

	return {
		strategy,
		messageCreate,
		reactionCreate,
		reactionDelete
	}
}

describe('LarkChannelStrategy outbound helpers', () => {
	beforeEach(() => {
		jest.restoreAllMocks()
	})

	it('createMessageReaction sends the expected payload', async () => {
		const { strategy, reactionCreate } = createFixture()
		reactionCreate.mockResolvedValue({
			data: {
				reaction_id: 'reaction-1',
				reaction_type: {
					emoji_type: LARK_TYPING_REACTION_EMOJI_TYPE
				}
			}
		})

		await expect(
			strategy.createMessageReaction('integration-1', 'message-1', LARK_TYPING_REACTION_EMOJI_TYPE)
		).resolves.toEqual({
			messageId: 'message-1',
			reactionId: 'reaction-1',
			emojiType: LARK_TYPING_REACTION_EMOJI_TYPE
		})
		expect(reactionCreate).toHaveBeenCalledWith({
			path: {
				message_id: 'message-1'
			},
			data: {
				reaction_type: {
					emoji_type: LARK_TYPING_REACTION_EMOJI_TYPE
				}
			}
		})
	})

	it('deleteMessageReaction sends the expected payload', async () => {
		const { strategy, reactionDelete } = createFixture()
		reactionDelete.mockResolvedValue({})

		await strategy.deleteMessageReaction('integration-1', 'message-1', 'reaction-1')

		expect(reactionDelete).toHaveBeenCalledWith({
			path: {
				message_id: 'message-1',
				reaction_id: 'reaction-1'
			}
		})
	})

	it('interactiveMessage includes quote_message_id on the first reply', async () => {
		const { strategy, messageCreate } = createFixture()
		messageCreate.mockResolvedValue({
			data: {
				message_id: 'bot-message-1'
			}
		})

		await strategy.interactiveMessage(
			{
				integrationId: 'integration-1',
				chatId: 'chat-1',
				replyToMessageId: 'source-message-1'
			} as any,
			{
				elements: []
			}
		)

		expect(messageCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					receive_id: 'chat-1',
					msg_type: 'interactive',
					quote_message_id: 'source-message-1'
				})
			})
		)
	})

	it('textMessage retries without quote_message_id when quoted send is rejected', async () => {
		const { strategy, messageCreate } = createFixture()
		messageCreate
			.mockRejectedValueOnce({
				response: {
					data: {
						code: 400,
						msg: 'invalid request',
						error: {
							message: 'quote_message_id is not supported',
							log_id: 'log-1',
							troubleshooter: '',
							field_violations: [
								{
									field: 'quote_message_id',
									message: 'unsupported'
								}
							]
						}
					}
				}
			})
			.mockResolvedValueOnce({
				data: {
					message_id: 'bot-message-1'
				}
			})

		await strategy.textMessage(
			{
				integrationId: 'integration-1',
				chatId: 'chat-1',
				replyToMessageId: 'source-message-1'
			},
			'hello'
		)

		expect(messageCreate).toHaveBeenCalledTimes(2)
		expect(messageCreate.mock.calls[0][0]).toEqual(
			expect.objectContaining({
				data: expect.objectContaining({
					quote_message_id: 'source-message-1'
				})
			})
		)
		expect(messageCreate.mock.calls[1][0]).toEqual(
			expect.objectContaining({
				data: expect.not.objectContaining({
					quote_message_id: expect.anything()
				})
			})
		)
	})
})
