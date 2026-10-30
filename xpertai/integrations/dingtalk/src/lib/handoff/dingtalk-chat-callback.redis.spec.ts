import { fork, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import type { DingTalkChatCallbackContext, DingTalkChatStreamCallbackPayload } from './dingtalk-chat.types.js'

const redisUrl = process.env.DINGTALK_TEST_REDIS_URL
const redisSuite = redisUrl ? describe : describe.skip

// Separate OS processes prevent an in-memory mutex from accidentally satisfying these tests.
redisSuite('DingTalk callback recovery across processes (real Redis)', () => {
	const workers: ChildProcess[] = []
	const context: DingTalkChatCallbackContext = {
		tenantId: 'test-tenant',
		organizationId: 'test-org',
		userId: 'test-user',
		xpertId: 'test-assistant',
		integrationId: 'test-integration',
		chatId: 'test-chat',
		chatType: 'private',
		sessionWebhook: 'https://example.invalid/webhook',
		message: { status: 'thinking', elements: [], language: 'en_US' }
	}
	type Payload = Omit<DingTalkChatStreamCallbackPayload, 'sourceMessageId' | 'context'>
	function command(worker: ChildProcess, input: object): Promise<void> {
		return new Promise((resolve, reject) => {
			worker.once('message', (result: { error?: string }) =>
				result.error ? reject(new Error(result.error)) : resolve()
			)
			worker.send(input)
		})
	}
	beforeAll(async () => {
		for (let index = 0; index < 3; index++) {
			const worker = fork(resolve(__dirname, 'testing/callback-worker.cjs'), [], {
				stdio: ['ignore', 'ignore', 'inherit', 'ipc']
			})
			workers.push(worker)
			await new Promise<void>((resolve, reject) => {
				worker.once('message', () => resolve())
				worker.once('error', reject)
			})
		}
	})
	afterAll(() => workers.forEach((worker) => worker.disconnect()))
	const deliver = (worker: ChildProcess, run: string, payloads: Payload[]) =>
		command(worker, { run, context, payloads })
	const event = (sequence: number, name: string, data: object): Payload => ({
		kind: 'stream',
		sequence,
		event: { data: { type: 'event', event: name, data } }
	})
	async function sentMessages(run: string): Promise<string[]> {
		const { createRequire } = await import('node:module')
		const Redis = createRequire(require.resolve('bull'))('ioredis')
		const redis = new Redis(redisUrl)
		try {
			return await redis.lrange(`test:sent:${run}`, 0, -1)
		} finally {
			redis.disconnect()
		}
	}

	it('preserves every delta when three independent processes concurrently consume one run', async () => {
		const run = randomUUID()
		const parts = Array.from({ length: 60 }, (_, index) => `[${index}]`)
		await Promise.all(
			workers.map((worker, workerIndex) =>
				deliver(
					worker,
					run,
					parts.flatMap((text, index) =>
						index % workers.length === workerIndex
							? [{ kind: 'stream' as const, sequence: index + 1, event: { data: { type: 'message', data: text } } }]
							: []
					)
				)
			)
		)
		await deliver(workers[0], run, [{ kind: 'complete', sequence: 61 }])
		const sent = await sentMessages(run)
		expect(sent).toHaveLength(1)
		expect(sent[0]).toContain(parts.join(''))
	}, 20_000)

	it('does not resend after completion when late and duplicate callbacks reach different processes', async () => {
		const run = randomUUID()
		const payloads: Payload[] = [
			{ kind: 'stream', sequence: 1, event: { data: { type: 'message', data: 'Once only' } } },
			{ kind: 'complete', sequence: 2 }
		]
		await deliver(workers[0], run, payloads)
		await Promise.all([deliver(workers[1], run, payloads), deliver(workers[2], run, payloads)])
		await command(workers[1], { run, action: 'recover' })
		expect(await sentMessages(run)).toHaveLength(1)
	})

	it('resumes normally when an out-of-order missing delta arrives before recovery', async () => {
		const run = randomUUID()
		await deliver(workers[0], run, [
			{ kind: 'stream', sequence: 2, event: { data: { type: 'message', data: 'world' } } },
			{ kind: 'complete', sequence: 3 }
		])
		expect(await sentMessages(run)).toEqual([])
		await deliver(workers[1], run, [
			{ kind: 'stream', sequence: 1, event: { data: { type: 'message', data: 'Hello ' } } }
		])
		await command(workers[2], { run, action: 'recover' })
		const sent = await sentMessages(run)
		expect(sent).toHaveLength(1)
		expect(sent[0]).toContain('Hello world')
	})

	it('completes from conversation end when the complete envelope never arrives', async () => {
		const run = randomUUID()
		await deliver(workers[0], run, [
			{ kind: 'stream', sequence: 1, event: { data: { type: 'message', data: 'Final answer' } } },
			event(2, 'on_message_end', { id: 'answer', content: 'Final answer', status: 'success' }),
			event(3, 'on_conversation_end', { status: 'idle' })
		])
		await command(workers[1], { run, action: 'recover' })
		expect((await sentMessages(run))[0]).toContain('Final answer')
	})

	it('reports unrecoverable missing content instead of sending truncated text as success', async () => {
		const run = randomUUID()
		await deliver(workers[0], run, [
			{ kind: 'stream', sequence: 1, event: { data: { type: 'message', data: 'TRUNCATED' } } },
			{ kind: 'complete', sequence: 4 }
		])
		await command(workers[1], { run, action: 'recover' })
		const sent = await sentMessages(run)
		expect(sent).toHaveLength(1)
		expect(sent[0]).not.toContain('TRUNCATED')
		expect(sent[0]).toContain('ReplyRecoveryUnavailable')
	})

	it('does not repeat already delivered text when recovering a later gap', async () => {
		const run = randomUUID()
		await deliver(workers[0], run, [
			{ kind: 'stream', sequence: 1, event: { data: { type: 'message', data: 'Before tool. ' } } },
			event(2, 'on_tool_start', { id: 'tool', tool: 'search', status: 'running' }),
			event(4, 'on_message_end', { id: 'answer', content: 'Before tool. After tool.', status: 'success' }),
			{ kind: 'complete', sequence: 5 }
		])
		await command(workers[1], { run, action: 'recover' })
		const sent = await sentMessages(run)
		expect(sent).toHaveLength(2)
		expect(sent[1]).toContain('After tool.')
		expect(sent[1]).not.toContain('Before tool.')
	})

	it('preserves a final error even when an earlier success snapshot and conversation end are buffered', async () => {
		const run = randomUUID()
		await deliver(workers[0], run, [
			event(2, 'on_message_end', { content: 'MUST NOT SEND', status: 'success' }),
			event(3, 'on_conversation_end', { status: 'idle' }),
			{ kind: 'error', sequence: 4, error: 'Execution failed' }
		])
		await command(workers[1], { run, action: 'recover' })
		const sent = await sentMessages(run)
		expect(sent).toHaveLength(1)
		expect(sent[0]).toContain('Execution failed')
		expect(sent[0]).not.toContain('MUST NOT SEND')
	})

	it('rejects an incomplete final snapshot containing unsupported non-text blocks', async () => {
		const run = randomUUID()
		await deliver(workers[0], run, [
			event(2, 'on_message_end', {
				content: [{ type: 'text', text: 'PARTIAL' }, { type: 'image', url: 'https://example.invalid/image' }],
				status: 'success'
			}),
			{ kind: 'complete', sequence: 3 }
		])
		await command(workers[1], { run, action: 'recover' })
		const sent = await sentMessages(run)
		expect(sent).toHaveLength(1)
		expect(sent[0]).toContain('ReplyRecoveryUnavailable')
		expect(sent[0]).not.toContain('PARTIAL')
	})

	it('keeps a tool approval interruption instead of recovering it as a success', async () => {
		const run = randomUUID()
		await deliver(workers[0], run, [
			event(2, 'on_message_end', { content: 'MUST NOT COMPLETE', status: 'success' }),
			event(3, 'on_conversation_end', {
				status: 'interrupted',
				operation: { tasks: [{ call: { args: {} }, info: { title: 'Approve operation', description: '' }, parameters: [] }] }
			}),
			{ kind: 'complete', sequence: 4 }
		])
		await command(workers[1], { run, action: 'recover' })
		const sent = await sentMessages(run)
		expect(sent).toHaveLength(1)
		expect(sent[0]).toContain('Approve operation')
		expect(sent[0]).not.toContain('MUST NOT COMPLETE')
	})

	it('reports a recovery conflict when the final text differs from an already delivered prefix', async () => {
		const run = randomUUID()
		await deliver(workers[0], run, [
			{ kind: 'stream', sequence: 1, event: { data: { type: 'message', data: 'Original prefix' } } },
			event(2, 'on_tool_start', { id: 'tool', tool: 'search', status: 'running' }),
			event(4, 'on_message_end', { content: 'DIFFERENT ANSWER', status: 'success' }),
			{ kind: 'complete', sequence: 5 }
		])
		await command(workers[1], { run, action: 'recover' })
		const sent = await sentMessages(run)
		expect(sent).toHaveLength(2)
		expect(sent[1]).toContain('ReplyRecoveryPrefixMismatch')
		expect(sent[1]).not.toContain('DIFFERENT ANSWER')
	})

	it('fences out an expired process after a successor has saved progress', async () => {
		const run = randomUUID()
		await command(workers[0], { run, context, action: 'lease', leaseMs: 80, holdMs: 500, text: 'stale' })
		const rejected = new Promise<{ error?: string }>((resolve) => workers[0].once('message', resolve))
		await new Promise((resolve) => setTimeout(resolve, 120))
		await command(workers[1], { run, context, action: 'lease', text: 'successor' })
		expect((await rejected).error).toContain('lease lost')
		const value = new Promise<{ text?: string }>((resolve) => workers[2].once('message', resolve))
		workers[2].send({ run, context, action: 'lease' })
		expect((await value).text).toBe('successor')
	})

	it('retries an unsuccessful send without losing the buffered callback', async () => {
		const run = randomUUID()
		await deliver(workers[0], run, [
			{ kind: 'stream', sequence: 1, event: { data: { type: 'message', data: 'Retry answer' } } }
		])
		const payloads = [{ kind: 'complete', sequence: 2 }]
		await expect(command(workers[0], { run, context, payloads, failSend: true })).rejects.toThrow(
			'Injected HTTP failure'
		)
		await deliver(workers[1], run, payloads)
		const sent = await sentMessages(run)
		expect(sent).toHaveLength(1)
		expect(sent[0]).toContain('Retry answer')
	})

	it('does not replay an accepted send when the conversation cache fails', async () => {
		const run = randomUUID()
		const payloads = [
			{ kind: 'stream', sequence: 1, event: { data: { type: 'message', data: 'Accepted answer' } } },
			{ kind: 'complete', sequence: 2 }
		]
		await command(workers[0], { run, context, payloads, failCache: true })
		await deliver(workers[1], run, payloads)
		expect(await sentMessages(run)).toHaveLength(1)
	})

	it('isolates identical run ids across tenants and integrations', async () => {
		const run = randomUUID()
		await Promise.all(
			workers.slice(0, 2).map((worker, index) =>
				command(worker, {
					run,
					context: { ...context, tenantId: `tenant-${index}`, integrationId: `integration-${index}` },
					payloads: [
						{ kind: 'stream', sequence: 1, event: { data: { type: 'message', data: `Answer-${index}` } } },
						{ kind: 'complete', sequence: 2 }
					]
				})
			)
		)
		const sent = await sentMessages(run)
		expect(sent).toHaveLength(2)
		expect(sent.join('')).toContain('Answer-0')
		expect(sent.join('')).toContain('Answer-1')
	})

	it('recovers missing text deltas from the authoritative final message without a partial success', async () => {
		const run = randomUUID()
		await deliver(workers[0], run, [
			{ kind: 'stream', sequence: 1, event: { data: { type: 'message', data: 'Hello ' } } },
			event(3, 'on_message_end', { id: 'answer', content: 'Hello world', status: 'success' }),
			event(4, 'on_conversation_end', { status: 'idle' }),
			{ kind: 'complete', sequence: 5 }
		])
		await command(workers[1], { run, action: 'recover' })
		// Read only the fake DingTalk HTTP outbox, not processor internals.
		const { createRequire } = await import('node:module')
		const Redis = createRequire(require.resolve('bull'))('ioredis')
		const redis = new Redis(redisUrl)
		try {
			const sent: string[] = await redis.lrange(`test:sent:${run}`, 0, -1)
			expect(sent).toHaveLength(1)
			expect(sent[0]).toContain('Hello world')
		} finally {
			redis.disconnect()
		}
	}, 20_000)
})
