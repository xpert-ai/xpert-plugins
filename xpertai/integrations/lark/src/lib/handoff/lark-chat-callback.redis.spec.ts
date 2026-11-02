import { fork, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import Queue from 'bull'
import type { HandoffMessage, AgentChatDispatchPayload } from '@xpert-ai/plugin-sdk'
import type { LarkChatCallbackContext, LarkChatStreamCallbackPayload } from './lark-chat.types.js'

const redisUrl = process.env.LARK_TEST_REDIS_URL
const redisSuite = redisUrl ? describe : describe.skip

// Separate OS processes prevent an in-memory mutex from accidentally satisfying these tests.
redisSuite('Lark callback recovery across processes (real Redis)', () => {
	jest.setTimeout(30_000)
	const workers: ChildProcess[] = []
	const context: LarkChatCallbackContext = {
		tenantId: 'test-tenant',
		organizationId: 'test-org',
		userId: 'test-user',
		xpertId: 'test-assistant',
		integrationId: 'test-integration',
		chatId: 'test-chat',
		chatType: 'private',
		scopeKey: 'test-scope',
		streaming: { enabled: false },
		message: { id: 'test-card', status: 'thinking', elements: [], language: 'en_US' }
	}
	type Payload = Omit<LarkChatStreamCallbackPayload, 'sourceMessageId' | 'context'>
	function command(worker: ChildProcess, input: object): Promise<void> {
		return new Promise((resolve, reject) => {
			worker.once('message', (result: { error?: string }) =>
				result.error ? reject(new Error(result.error)) : resolve()
			)
			worker.send(input)
		})
	}
	beforeAll(async () => {
		if (!process.env.LARK_TEST_PLATFORM_ROOT)
			throw new Error('LARK_TEST_PLATFORM_ROOT is required for real host queue regressions')
		for (let index = 0; index < 3; index++) {
			const worker = fork(resolve(__dirname, 'testing/callback-worker.cjs'), [], {
				stdio: ['ignore', 'ignore', 'inherit', 'ipc']
			})
			workers.push(worker)
			await new Promise<void>((resolve, reject) => {
				worker.once('message', () => resolve())
				worker.once('error', reject)
				worker.once('exit', (code) => reject(new Error(`Callback worker exited: ${code}`)))
			})
		}
	}, 30_000)
	afterAll(() =>
		workers.forEach((worker) => {
			if (worker.connected) worker.disconnect()
		})
	)
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
				content: [
					{ type: 'text', text: 'PARTIAL' },
					{ type: 'image', url: 'https://example.invalid/image' }
				],
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
				operation: {
					tasks: [{ call: { args: {} }, info: { title: 'Approve operation', description: '' }, parameters: [] }]
				}
			}),
			{ kind: 'complete', sequence: 4 }
		])
		await command(workers[1], { run, action: 'recover' })
		const sent = await sentMessages(run)
		expect(sent).toHaveLength(1)
		expect(sent[0]).toContain('Approve operation')
		expect(sent[0]).not.toContain('MUST NOT COMPLETE')
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

	it('retries the same card update when active-message persistence fails', async () => {
		const run = randomUUID()
		const payloads: Payload[] = [
			{ kind: 'stream', sequence: 1, event: { data: { type: 'message', data: 'Accepted answer' } } },
			{ kind: 'complete', sequence: 2 }
		]
		await expect(command(workers[0], { run, context, payloads, failCache: true })).rejects.toThrow(
			'Injected cache failure'
		)
		await deliver(workers[1], run, payloads)
		const sent = await sentMessages(run)
		expect(sent.at(-1)).toContain('Accepted answer')
		expect(sent.at(-1)).not.toContain('Status_thinking')
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
		// Read only the fake Lark HTTP outbox, not processor internals.
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
	it('recovers a later message after the preceding gap closes, without message history', async () => {
		const run = randomUUID(),
			next = randomUUID(),
			scopeKey = randomUUID()
		const scoped = { ...context, scopeKey }
		await command(workers[0], {
			run,
			context: scoped,
			payloads: [
				event(3, 'on_message_end', { content: 'First reply', status: 'success' }),
				{ kind: 'complete', sequence: 4 }
			]
		})
		const followContext: LarkChatCallbackContext = {
			...scoped,
			followUpMode: 'steer',
			steerFallback: { input: 'Follow up', message: scoped.message }
		}
		const payloads: Payload[] = [{ kind: 'error', sequence: 1, errorCode: 'steer_target_not_running' }]
		await expect(
			command(workers[1], {
				run: next,
				context: followContext,
				payloads,
				active: { thirdPartyMessage: scoped.message }
			})
		).rejects.toThrow('Waiting for the previous')
		await command(workers[2], { run, action: 'recover' })
		await command(workers[1], { run: next, context: followContext, payloads, failEnqueueAfterAcceptance: true }).then(
			() => {
				throw new Error('Expected injected failure')
			},
			(error) => {
				expect(error.message).toContain('Injected failure after dispatch acceptance')
			}
		)
		await Promise.all(
			[workers[0], workers[2]].map((worker) => command(worker, { run: next, context: followContext, payloads }))
		)
		const { createRequire } = await import('node:module')
		const Redis = createRequire(require.resolve('bull'))('ioredis'),
			redis = new Redis(redisUrl)
		try {
			const messages: string[] = await redis.hvals(`test:dispatch:${next}`)
			expect(messages).toHaveLength(1)
			const queue = new Queue(`lark-handoff-${next}`, redisUrl)
			try {
				expect(await queue.getJobs(['waiting', 'active', 'completed', 'failed'])).toHaveLength(1)
				expect(await redis.llen(`test:enqueue:${next}`)).toBe(2)
			} finally {
				await queue.close()
			}
			const dispatch = JSON.parse(messages[0])
			expect(JSON.stringify(dispatch.payload.request)).toContain('Follow up')
			expect(dispatch.payload.callback.context.followUpMode).toBeUndefined()
			await command(workers[0], {
				run: dispatch.id,
				context: dispatch.payload.callback.context,
				payloads: [
					{ kind: 'stream', sequence: 1, event: { data: { type: 'message', data: 'Second reply' } } },
					{ kind: 'complete', sequence: 2 }
				]
			})
			expect((await sentMessages(dispatch.id)).at(-1)).toContain('Second reply')
		} finally {
			redis.disconnect()
		}
	})
	it('does not redirect a delayed follow-up onto a different active card', async () => {
		const run = randomUUID(),
			scoped = {
				...context,
				scopeKey: randomUUID(),
				followUpMode: 'steer',
				steerFallback: { input: 'do not dispatch', message: context.message }
			}
		await command(workers[0], {
			run,
			context: scoped,
			active: { thirdPartyMessage: { id: 'different-card', status: 'success' } },
			payloads: [{ kind: 'error', sequence: 1, errorCode: 'steer_target_not_running' }]
		})
		expect(await sentMessages(run)).toEqual([])
	})

	it('does not create another host job when acknowledgement is lost and the first job has already completed', async () => {
		const run = randomUUID()
		const scoped: LarkChatCallbackContext = {
			...context,
			scopeKey: randomUUID(),
			followUpMode: 'steer',
			steerFallback: { input: 'recover once', message: context.message }
		}
		const payloads: Payload[] = [{ kind: 'error', sequence: 1, errorCode: 'steer_target_not_running' }]
		const queue = new Queue(`lark-handoff-${run}`, redisUrl)
		try {
			let executions = 0
			const completed = new Promise<void>((resolve, reject) => {
				queue.once('completed', () => resolve())
				queue.once('error', reject)
			})
			void queue.process('*', async () => {
				executions++
			})
			await expect(
				command(workers[0], {
					run,
					context: scoped,
					payloads,
					failEnqueueAfterAcceptance: true,
					active: { thirdPartyMessage: { ...context.message, status: 'success' } }
				})
			).rejects.toThrow('Injected failure after dispatch acceptance')
			await completed
			await command(workers[1], { run, context: scoped, payloads })
			const jobs = await queue.getJobs(['waiting', 'active', 'completed', 'failed'])
			expect(jobs).toHaveLength(1)
			expect(await jobs[0].getState()).toBe('completed')
			expect(executions).toBe(1)
		} finally {
			await queue.close()
		}
	})

	it.each([false, true])(
		'serializes distinct follow-ups and resumes a failed preparation: %s',
		async (failPrepareSave) => {
			const first = randomUUID(),
				second = randomUUID()
			const scoped: LarkChatCallbackContext = {
				...context,
				scopeKey: randomUUID(),
				followUpMode: 'steer',
				steerFallback: { input: 'first follow-up', message: context.message }
			}
			const later: LarkChatCallbackContext = {
				...scoped,
				steerFallback: { input: 'second follow-up', message: context.message }
			}
			const payloads: Payload[] = [{ kind: 'error', sequence: 1, errorCode: 'steer_target_not_running' }]
			const firstQueue = new Queue<HandoffMessage<AgentChatDispatchPayload>>(`lark-handoff-${first}`, redisUrl)
			const secondQueue = new Queue<HandoffMessage<AgentChatDispatchPayload>>(`lark-handoff-${second}`, redisUrl)
			try {
				// Hold the first card update before the active cache changes. Both old readers would see success.
				const firstResult = command(workers[0], {
					run: first,
					context: scoped,
					payloads,
					sendDelayMs: 300,
					failPrepareSave,
					active: { thirdPartyMessage: { ...context.message, status: 'success' } }
				}).then(
					() => null,
					(error: Error) => error
				)
				const deadline = Date.now() + 5000
				while (!(await firstQueue.client.get(`test:send-entered:${first}`))) {
					if (Date.now() > deadline) throw new Error('First recovery did not enter card update')
					await new Promise((resolve) => setTimeout(resolve, 10))
				}
				await expect(command(workers[1], { run: second, context: later, payloads })).rejects.toThrow(
					'Waiting for the previous'
				)
				const firstError = await firstResult
				if (failPrepareSave) {
					expect(firstError?.message).toContain('before prepared envelope save')
					await command(workers[2], { run: first, context: scoped, payloads })
				} else expect(firstError).toBeNull()
				const firstJobs = await firstQueue.getJobs(['waiting'])
				expect(firstJobs).toHaveLength(1)
				expect(await secondQueue.getJobs(['waiting'])).toHaveLength(0)
				const dispatch = firstJobs[0].data
				await command(workers[0], {
					run: dispatch.id,
					context: dispatch.payload.callback.context,
					payloads: [
						{ kind: 'stream', sequence: 1, event: { data: { type: 'message', data: 'First recovered reply' } } },
						{ kind: 'complete', sequence: 2 }
					]
				})
				await command(workers[1], { run: second, context: later, payloads })
				const secondJobs = await secondQueue.getJobs(['waiting'])
				expect(secondJobs).toHaveLength(1)
				expect(secondJobs[0].data.payload.request.action).toBe('send')
				expect(JSON.stringify(secondJobs[0].data.payload.request)).toContain('second follow-up')
				const secondDispatch = secondJobs[0].data
				await command(workers[2], {
					run: secondDispatch.id,
					context: secondDispatch.payload.callback.context,
					payloads: [
						{ kind: 'stream', sequence: 1, event: { data: { type: 'message', data: 'Second recovered reply' } } },
						{ kind: 'complete', sequence: 2 }
					]
				})
				expect((await sentMessages(secondDispatch.id)).at(-1)).toContain('Second recovered reply')
			} finally {
				await Promise.all([firstQueue.close(), secondQueue.close()])
			}
		},
		15_000
	)

	it('rejects recovery on an old host before changing the card or using ordinary enqueue', async () => {
		const run = randomUUID()
		const scoped: LarkChatCallbackContext = {
			...context,
			scopeKey: randomUUID(),
			followUpMode: 'steer',
			steerFallback: { input: 'requires deduplication', message: context.message }
		}
		await expect(
			command(workers[0], {
				run,
				context: scoped,
				legacyHost: true,
				active: { thirdPartyMessage: { ...context.message, status: 'success' } },
				payloads: [{ kind: 'error', sequence: 1, errorCode: 'steer_target_not_running' }]
			})
		).rejects.toThrow('requires a host with Handoff enqueueOnce support')
		expect(await sentMessages(run)).toEqual([])
		const queue = new Queue(`lark-handoff-${run}`, redisUrl)
		try {
			expect(await queue.getJobs(['waiting', 'active', 'completed', 'failed'])).toHaveLength(0)
		} finally {
			await queue.close()
		}
	})
})
