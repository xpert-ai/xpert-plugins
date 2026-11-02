jest.mock('@xpert-ai/plugin-sdk', () => {
	const { createLarkPluginSdkMock } = require('../../../../../test-utils/larkPluginSdkMock.cjs')
	return createLarkPluginSdkMock(jest, {
		HandoffProcessorStrategy: () => (target: unknown) => target,
		PluginJobProcessor: () => (target: unknown) => target
	})
})
import type { HandoffMessage, ProcessContext } from '@xpert-ai/plugin-sdk'
import type { LarkChatStreamCallbackPayload } from './lark-chat.types.js'
import { createFixture, createRunState, createStreamMessage } from './testing/callback-fixture.js'

function message(): HandoffMessage<LarkChatStreamCallbackPayload> {
	const context = createRunState().context
	return {
		...createStreamMessage(1, 'hello'),
		headers: { organizationId: context.organizationId },
		payload: { kind: 'stream', sequence: 1, sourceMessageId: 'run-1', context }
	} as HandoffMessage<LarkChatStreamCallbackPayload>
}
const processContext = {} as ProcessContext

it('acknowledges only a durable retryable job, before attempting card delivery', async () => {
	const { receive, queue, larkChannel } = createFixture()
	await expect(receive(message(), processContext)).resolves.toEqual({ status: 'ok' })
	expect(queue.enqueue).toHaveBeenCalledWith(
		expect.objectContaining({
			jobName: 'apply',
			attempts: 8,
			backoffMs: 1000,
			removeOnComplete: { age: 86400 }
		})
	)
	expect(larkChannel.patchInteractiveMessage).not.toHaveBeenCalled()
})

it('does not acknowledge a failed queue write', async () => {
	const { receive, queue } = createFixture()
	queue.enqueue.mockRejectedValueOnce(new Error('Queue unavailable'))
	await expect(receive(message(), processContext)).rejects.toThrow('Queue unavailable')
})

it.each(['tenant', 'organization', 'sequence'])('rejects an invalid %s before enqueue', async (field) => {
	const { receive, queue } = createFixture()
	const input = message()
	if (field === 'tenant') input.tenantId = 'another-tenant'
	if (field === 'organization') input.headers.organizationId = 'another-org'
	if (field === 'sequence') input.payload.sequence = 1.5
	await expect(receive(input, processContext)).resolves.toEqual(expect.objectContaining({ status: 'dead' }))
	expect(queue.enqueue).not.toHaveBeenCalled()
})

it('honors a legacy history enqueue receipt after a plugin upgrade', async () => {
	const { processor, messageHistoryService, dispatchService } = createFixture()
	messageHistoryService.areInboundLogsInStatusWithError.mockResolvedValue(true)
	const input = message()
	input.payload = {
		...input.payload,
		kind: 'error',
		errorCode: 'steer_target_not_running',
		context: {
			...input.payload.context,
			followUpMode: 'steer',
			currentInboundLogIds: ['inbound-1'],
			steerFallback: { input: 'follow up', message: input.payload.context.message }
		}
	}
	await processor.process(input, processContext)
	expect(dispatchService.buildDispatchMessage).not.toHaveBeenCalled()
	expect(dispatchService.enqueuePreparedDispatch).not.toHaveBeenCalled()
})
