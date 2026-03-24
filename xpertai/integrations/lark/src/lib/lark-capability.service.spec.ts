import { LarkCapabilityService } from './lark-capability.service.js'

describe('LarkCapabilityService', () => {
	let service: LarkCapabilityService

	beforeEach(() => {
		service = new LarkCapabilityService()
	})

	it('returns full capabilities by default', () => {
		expect(service.getCapabilities({})).toEqual({
			supportsInboundMessage: true,
			supportsMentionTrigger: true,
			supportsCardSend: true,
			supportsCardAction: true,
			supportsWebhookCallback: true
		})
	})

	it('keeps card callbacks available in long connection mode', () => {
		expect(service.getCapabilities({ connectionMode: 'long_connection' })).toEqual({
			supportsInboundMessage: true,
			supportsMentionTrigger: true,
			supportsCardSend: true,
			supportsCardAction: true,
			supportsWebhookCallback: true
		})
	})

	it('detects pure display cards as supported', () => {
		expect(
			service.containsInteractiveAction({
				elements: [{ tag: 'markdown', content: 'hello' }]
			})
		).toBe(false)
	})

	it('detects action cards recursively', () => {
		expect(
			service.containsInteractiveAction({
				elements: [
					{
						tag: 'action',
						actions: [
							{
								tag: 'button',
								value: 'confirm'
							}
						]
					}
				]
			})
		).toBe(true)
	})

	it('does not reject action cards in long connection mode', () => {
		expect(() =>
			service.assertCardPayloadSupported(
				{ connectionMode: 'long_connection' },
				{
					elements: [
						{
							tag: 'action',
							actions: [{ tag: 'button', value: 'confirm' }]
						}
					]
				},
				'test-card'
			)
		).not.toThrow()
	})
})
