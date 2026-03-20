import type { IIntegration } from '@metad/contracts'
import { LarkCapabilityService } from './lark-capability.service.js'
import { LarkIntegrationStrategy } from './lark-integration.strategy.js'
import type { TIntegrationLarkOptions } from './types.js'

describe('LarkIntegrationStrategy', () => {
	let disconnect: jest.Mock<Promise<void>, [string]>
	let strategy: LarkIntegrationStrategy

	beforeEach(() => {
		disconnect = jest.fn().mockResolvedValue(undefined)
		strategy = new LarkIntegrationStrategy(new LarkCapabilityService(), { disconnect } as any)
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
