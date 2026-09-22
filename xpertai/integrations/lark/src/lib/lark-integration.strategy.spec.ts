import type { IIntegration } from '@xpert-ai/contracts'
import { LarkCapabilityService } from './lark-capability.service.js'
import { LarkIntegrationStrategy } from './lark-integration.strategy.js'
import type { TIntegrationLarkOptions } from './types.js'
import axios from 'axios'
import { LARK_QR_SCOPES } from './lark-qr-authorization.js'

jest.mock('axios')
jest.mock('./i18n.js', () => ({ translate: (_key: string, options: { defaultValue: string }) => options.defaultValue }))

jest.mock('@xpert-ai/plugin-sdk', () => ({
	IntegrationStrategyKey: () => () => undefined
}))

jest.mock('./lark-long-connection.service.js', () => ({
	LarkLongConnectionService: class LarkLongConnectionService {}
}))

describe('LarkIntegrationStrategy', () => {
	let disconnect: jest.Mock<Promise<void>, [string]>
	let strategy: LarkIntegrationStrategy
	const probeConfig = jest.fn()

	beforeEach(() => {
		jest.resetAllMocks()
		disconnect = jest.fn().mockResolvedValue(undefined)
		strategy = new LarkIntegrationStrategy(new LarkCapabilityService(), { disconnect, probeConfig } as any)
	})

	it('disconnects the old runtime when switching away from long connection mode', async () => {
		await (strategy as any).onUpdate(
			createIntegration({ connectionMode: 'long_connection' }),
			createIntegration({ connectionMode: 'webhook' })
		)

		expect(disconnect).toHaveBeenCalledWith('integration-1')
	})

	it('keeps the runtime when the integration stays in long connection mode', async () => {
		await (strategy as any).onUpdate(
			createIntegration({ connectionMode: 'long_connection' }),
			createIntegration({ connectionMode: 'long_connection' })
		)

		expect(disconnect).not.toHaveBeenCalled()
	})

	it('exposes ordered configuration and credential links for the host integration form', () => {
		expect(strategy.meta.helpLinks).toEqual([
			{
				url: 'https://docs.xpertai.cn/zh-Hans/ai/plugin/integration/lark-integration',
				label: {
					en_US: 'Configuration Guide',
					zh_Hans: '配置手册'
				}
			},
			{
				url: 'https://open.feishu.cn/document/home/introduction-to-custom-app-development/self-built-application-development-process',
				label: {
					en_US: 'Get App ID',
					zh_Hans: '获取App ID'
				}
			}
		])

		// Keep the legacy single-link metadata for older hosts.
		expect(strategy.meta.helpUrl).toBe(
			'https://open.feishu.cn/document/home/introduction-to-custom-app-development/self-built-application-development-process'
		)
		expect((strategy.meta as any).helpLabel).toEqual({
			en_US: 'Get App ID',
			zh_Hans: '获取App ID'
		})
	})

	it('advertises generic QR setup and identifies the app within its Feishu or Lark domain', () => {
		expect(strategy.meta.setup?.qrAuthorization).toBe(true)
		expect(strategy.beginQrAuthorization).toBeInstanceOf(Function)
		expect(strategy.pollQrAuthorization).toBeInstanceOf(Function)
		expect(strategy.getQrAuthorizationIdentity({ appId: ' cli_bot ' })).toBe('feishu:cli_bot')
		expect(strategy.getQrAuthorizationIdentity({ appId: 'cli_bot', isLark: true })).toBe('lark:cli_bot')
		expect(strategy.getQrAuthorizationIdentity({ appSecret: 'secret' })).toBeNull()
		expect(strategy.getQrAuthorizationIdentity(null)).toBeNull()
	})

	it.each([true, false])('requires a successful probe for QR setup (connected=%s)', async (connected) => {
		jest.mocked(axios.post).mockResolvedValueOnce({ data: { code: 0, tenant_access_token: 'tenant-token' } })
		jest.mocked(axios.get)
			.mockResolvedValueOnce({ data: { code: 0, bot: { open_id: 'ou_bot' } } })
			.mockResolvedValueOnce({ data: { code: 0, data: { app: {
				scopes: LARK_QR_SCOPES.map((scope) => ({ scope, token_types: ['tenant'] })),
				event: { subscription_type: 'websocket', subscribed_events: ['im.message.receive_v1'] },
				callback_info: { callback_type: 'websocket', subscribed_callbacks: ['card.action.trigger'] }
			} } } })
		probeConfig.mockResolvedValueOnce({ connected, state: connected ? 'connected' : 'failed' })
		const integration = createIntegration({ setupSource: 'qr', connectionMode: 'long_connection' })
		const result = strategy.validateConfig(integration.options, integration)
		if (connected) {
			await expect(result).resolves.toMatchObject({ mode: 'long_connection', probe: { connected: true } })
		} else {
			await expect(result).rejects.toThrow('Unable to establish the Feishu long connection')
		}
	})
})

function createIntegration(
	options: Partial<TIntegrationLarkOptions>
): IIntegration<TIntegrationLarkOptions> {
	return {
		id: 'integration-1',
		provider: 'lark',
		options: {
			appId: 'app-id',
			appSecret: 'app-secret',
			connectionMode: 'webhook',
			...options
		}
	} as IIntegration<TIntegrationLarkOptions>
}
