jest.mock('@xpert-ai/plugin-sdk', () => ({
	INTEGRATION_PERMISSION_SERVICE_TOKEN: 'INTEGRATION_PERMISSION_SERVICE_TOKEN',
	RequestContext: {
		currentUser: jest.fn(() => null)
	},
	runWithRequestContext: jest.fn()
}))

jest.mock('./auth/dingtalk-auth.guard.js', () => ({
	DingTalkAuthGuard: class DingTalkAuthGuard {}
}))

jest.mock('./conversation.service.js', () => ({
	DingTalkConversationService: class DingTalkConversationService {}
}))

jest.mock('./dingtalk-channel.strategy.js', () => ({
	DingTalkChannelStrategy: class DingTalkChannelStrategy {}
}))

jest.mock('./dingtalk-integration.strategy.js', () => ({
	DINGTALK_HTTP_SUBSCRIPTION_HINTS: []
}))

import { DingTalkHooksController } from './dingtalk.controller.js'
import { computeDingTalkSignature, INTEGRATION_DINGTALK, INTEGRATION_DINGTALK_LONG } from './types.js'

describe('DingTalkHooksController', () => {
	function createController(params: {
		shortItems?: Array<Record<string, unknown>>
		longItems?: Array<Record<string, unknown>>
		integrations?: Record<string, Record<string, unknown> | null>
	}) {
		const integrationPermissionService = {
			read: jest.fn(async (integrationId: string) => {
				if (params.integrations && integrationId in params.integrations) {
					return params.integrations[integrationId]
				}
				return {
					id: integrationId,
					provider: INTEGRATION_DINGTALK,
					options: {}
				}
			}),
			findAll: jest.fn(async ({ where }: { where: { provider: string } }) => ({
				items:
					where.provider === INTEGRATION_DINGTALK
						? params.shortItems ?? []
						: where.provider === INTEGRATION_DINGTALK_LONG
							? params.longItems ?? []
							: []
			}))
		}
		const pluginContext = {
			resolve: jest.fn((token: unknown) => {
				if (token === 'INTEGRATION_PERMISSION_SERVICE_TOKEN') {
					return integrationPermissionService
				}
				throw new Error(`Unexpected token: ${String(token)}`)
			})
		}
		const controller = new DingTalkHooksController({} as any, pluginContext as any, {} as any)

		return {
			controller,
			integrationPermissionService
		}
	}

	it('lists Stream mode integrations before HTTP mode integrations', async () => {
		const { controller, integrationPermissionService } = createController({
			shortItems: [
				{
					id: 'short-1',
					name: 'http bot',
					description: 'http integration'
				}
			],
			longItems: [
				{
					id: 'long-1',
					name: 'ding',
					description: 'long integration'
				}
			]
		})

		await expect((controller as any).getIntegrationSelectOptions()).resolves.toEqual([
			expect.objectContaining({
				value: 'long-1',
				label: 'ding',
				description: 'long integration'
			}),
			expect.objectContaining({
				value: 'short-1',
				label: 'http bot',
				description: 'http integration'
			})
		])
		expect(integrationPermissionService.findAll).toHaveBeenCalledWith({
			where: {
				provider: INTEGRATION_DINGTALK
			}
		})
		expect(integrationPermissionService.findAll).toHaveBeenCalledWith({
			where: {
				provider: INTEGRATION_DINGTALK_LONG
			}
		})
	})

	it('allows DingTalk to probe the HTTP webhook URL before publishing', async () => {
		const { controller, integrationPermissionService } = createController({
			integrations: {
				'integration-http': {
					id: 'integration-http',
					provider: INTEGRATION_DINGTALK,
					options: {}
				}
			}
		})

		await expect((controller as any).webhookReachability('integration-http')).resolves.toBe('success')
		expect(integrationPermissionService.read).toHaveBeenCalledWith('integration-http')
	})

	it('reuses DingTalk request timestamp when building encrypted callback ack', () => {
		const { controller } = createController({})
		const requestTimestamp = '1782707057267'
		const options = {
			clientId: 'ding-app-key',
			clientSecret: 'client-secret',
			callbackToken: 'callback-token',
			callbackAesKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'
		}

		const ack = (controller as any).buildEncryptedSuccessAck(options, requestTimestamp)

		expect(ack.timeStamp).toBe(requestTimestamp)
		expect(ack.msg_signature).toBe(
			computeDingTalkSignature({
				token: options.callbackToken,
				timestamp: requestTimestamp,
				nonce: ack.nonce,
				encrypt: ack.encrypt
			})
		)
	})
})
