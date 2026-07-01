jest.mock('@xpert-ai/plugin-sdk', () => ({
	AgentMiddlewareStrategy: () => () => undefined,
	getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error))
}))

jest.mock('@xpert-ai/contracts', () => ({
	getToolCallIdFromConfig: jest.fn(() => 'tool-call-id')
}))

jest.mock('../conversation.service.js', () => ({
	DingTalkConversationService: class DingTalkConversationService {}
}))

jest.mock('../dingtalk-channel.strategy.js', () => ({
	DingTalkChannelStrategy: class DingTalkChannelStrategy {}
}))

import { DingTalkNotifyMiddleware } from './dingtalk-notify.middleware.js'

describe('DingTalkNotifyMiddleware', () => {
	it('loads DingTalk integrations from the plugin select endpoint', () => {
		const middleware = new DingTalkNotifyMiddleware({} as any, {} as any)
		const properties = middleware.meta.configSchema.properties as Record<string, any>

		expect(properties.integrationId['x-ui'].selectUrl).toBe('/api/dingtalk/integration-select-options')
	})
})
