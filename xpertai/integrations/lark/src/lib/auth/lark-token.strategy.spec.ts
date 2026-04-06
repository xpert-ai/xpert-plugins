import { LarkTokenStrategy } from './lark-token.strategy.js'

describe('LarkTokenStrategy', () => {
	function createRequest() {
		return {
			params: {
				id: 'integration-1'
			},
			body: {
				header: {
					event_type: 'im.message.receive_v1'
				}
			},
			headers: {}
		} as any
	}

	it('authenticates with mapped sender principal when sender is mapped', async () => {
		const inboundIdentityService = {
			readIntegration: jest.fn().mockResolvedValue({
				id: 'integration-1',
				organizationId: 'org-1',
				options: {
					preferLanguage: 'en_US'
				}
			}),
			decryptWebhookBody: jest.fn().mockImplementation((body) => body),
			resolveInboundIdentityForEvent: jest.fn().mockResolvedValue({
				requestUser: {
					id: 'mapped-user-1',
					preferredLanguage: 'zh_Hans'
				},
				metadata: {
					integrationId: 'integration-1',
					unionId: 'union-1',
					requestUserId: 'mapped-user-1',
					mappedUserId: 'mapped-user-1',
					usedCreatorFallback: false
				}
			}),
			toUnauthorizedError: jest.fn()
		}
		const strategy = new LarkTokenStrategy(inboundIdentityService as any)
		const success = jest.spyOn(strategy as any, 'success').mockImplementation(() => undefined)

		strategy.authenticate(createRequest(), {
			session: false,
			property: 'user'
		})
		await new Promise((resolve) => setImmediate(resolve))

		expect(success).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'mapped-user-1'
			})
		)
	})

	it('falls back to integration creator principal when sender is not mapped', async () => {
		const inboundIdentityService = {
			readIntegration: jest.fn().mockResolvedValue({
				id: 'integration-1',
				organizationId: 'org-1',
				options: {
					preferLanguage: 'en_US'
				}
			}),
			decryptWebhookBody: jest.fn().mockImplementation((body) => body),
			resolveInboundIdentityForEvent: jest.fn().mockResolvedValue({
				requestUser: {
					id: 'creator-user-1',
					preferredLanguage: 'en_US'
				},
				metadata: {
					integrationId: 'integration-1',
					unionId: 'union-1',
					requestUserId: 'creator-user-1',
					usedCreatorFallback: true
				}
			}),
			toUnauthorizedError: jest.fn()
		}
		const strategy = new LarkTokenStrategy(inboundIdentityService as any)
		const success = jest.spyOn(strategy as any, 'success').mockImplementation(() => undefined)
		const req = createRequest()

		strategy.authenticate(req, {
			session: false,
			property: 'user'
		})
		await new Promise((resolve) => setImmediate(resolve))

		expect(req.larkInboundIdentity).toEqual(
			expect.objectContaining({
				requestUserId: 'creator-user-1',
				usedCreatorFallback: true
			})
		)
		expect(success).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'creator-user-1'
			})
		)
	})
})
