// Runs the real callback processor, message renderer and state service in an isolated process.
// Only host registration/queue plumbing, conversation persistence and Lark HTTP are fixtures.
const { createRequire } = require('node:module')
const { readFileSync } = require('node:fs')
const { resolve, dirname } = require('node:path')
const { transformSync } = require('@swc/core')
const Redis = createRequire(require.resolve('bull'))('ioredis')
const redis = new Redis(process.env.LARK_TEST_REDIS_URL, { maxRetriesPerRequest: 1 })
const cache = new Map()
const noopDecorator = () => (target) => target
const sdk = {
	HandoffProcessorStrategy: noopDecorator,
	PluginJobProcessor: noopDecorator,
	MANAGED_QUEUE_SERVICE_TOKEN: 'XPERT_MANAGED_QUEUE_SERVICE',
	defineChannelMessageType: (channel, type, version) => `channel.${channel}.${type}.v${version}`,
	RequestContext: {
		getLanguageCode: () => 'en_US',
		currentRequest: () => ({ headers: {} }),
		currentUserId: () => 'test-user',
		currentTenantId: () => 'test-tenant',
		getOrganizationId: () => 'test-org'
	}
}
const contracts = {
	STATE_VARIABLE_HUMAN: '__human__',
	XpertAgentExecutionStatusEnum: { SUCCESS: 'success', ERROR: 'error', INTERRUPTED: 'interrupted' },
	messageContentText: (value) =>
		typeof value === 'string'
			? value
			: Array.isArray(value)
			? value
					.filter((block) => block.type === 'text')
					.map((block) => block.text)
					.join('')
			: ''
}
const eventNames = [
	'agent_end',
	'agent_start',
	'chat_event',
	'conversation_end',
	'conversation_start',
	'message_end',
	'message_start',
	'tool_end',
	'tool_start',
	'tool_error',
	'tool_message'
]
const chatkit = {
	ChatMessageTypeEnum: { MESSAGE: 'message', EVENT: 'event' },
	ChatMessageEventTypeEnum: Object.fromEntries(eventNames.map((name) => [`ON_${name.toUpperCase()}`, `on_${name}`]))
}
function load(file) {
	if (cache.has(file)) return cache.get(file).exports
	const module = { exports: {} }
	cache.set(file, module)
	const localRequire = createRequire(file)
	const dependency = (name) => {
		if (name === '@xpert-ai/plugin-sdk') return sdk
		if (name === '@xpert-ai/contracts') return contracts
		if (name === '@xpert-ai/chatkit-types') return chatkit
		if (name.endsWith('/conversation.service.js')) return { LarkConversationService: class {} }
		if (name.endsWith('/lark-message-history.service.js')) return { LarkMessageHistoryService: class {} }
		if (name.endsWith('/lark-channel.strategy.js')) return { LarkChannelStrategy: class {} }
		if (name.startsWith('.')) return load(resolve(dirname(file), name.replace(/\.js$/, '.ts')))
		return localRequire(name)
	}
	const { code } = transformSync(readFileSync(file, 'utf8'), {
		filename: file,
		jsc: {
			target: 'es2022',
			parser: { syntax: 'typescript', decorators: true },
			transform: { legacyDecorator: true, decoratorMetadata: true }
		},
		module: { type: 'commonjs' }
	})
	new Function('require', 'module', 'exports', code)(dependency, module, module.exports)
	return module.exports
}
const { LarkChatRunStateService } = load(resolve(__dirname, '../lark-chat-run-state.service.ts'))
const { LarkChatDispatchService } = load(resolve(__dirname, '../lark-chat-dispatch.service.ts'))
const { LarkChatStreamCallbackProcessor } = load(resolve(__dirname, '../lark-chat-callback.processor.ts'))
const cacheManager = {
	get: async (key) => {
		const raw = await redis.get(key)
		return raw ? JSON.parse(raw) : null
	},
	set: (key, value, ttl) => redis.set(key, JSON.stringify(value), 'PX', ttl),
	del: (key) => redis.del(key)
}
const applyJobs = []
const queue = {
	getRedis: async () => redis,
	enqueue: async (input) => {
		if (input.scopeKey !== 'system:global') throw new Error('Missing installation scope in callback job')
		if (input.jobName === 'recover')
			await redis.set(`test:recovery:${input.payload.payload.sourceMessageId}`, JSON.stringify(input))
		else applyJobs.push(input)
		return { jobId: input.jobId }
	}
}
const pluginContext = {
	scopeKey: 'system:global',
	resolve: (token) => (token === sdk.MANAGED_QUEUE_SERVICE_TOKEN ? queue : handoff)
}
const stateService = new LarkChatRunStateService(cacheManager, pluginContext)
let testRun
let failSend = false
let failCache = false

const channel = {
	interactiveMessage: async (_context, content) => {
		await send(content)
		return { data: { message_id: `reply-${testRun}` } }
	},
	patchInteractiveMessage: async (_integration, id, content) => {
		await send(content)
		return { success: true }
	},
	textMessage: async (_context, content) => {
		if (failSend) throw new Error('Injected HTTP failure')
		await send(content)
		return { data: { message_id: `text-${testRun}` } }
	},
	deleteMessageReaction: async () => undefined
}
async function send(content) {
	if (failSend) throw new Error('Injected HTTP failure')
	await redis.rpush(`test:sent:${testRun}`, JSON.stringify(content))
}
const conversation = {
	getActiveMessage: async (scope, assistant) => {
		const raw = await redis.get(`test:active:${scope}:${assistant}`)
		return raw ? JSON.parse(raw) : null
	},
	setActiveMessage: async (scope, assistant, message) => {
		if (failCache) throw new Error('Injected cache failure')
		await redis.set(`test:active:${scope}:${assistant}`, JSON.stringify(message))
	},
	setConversation: async () => undefined,
	getConversation: async () => 'test-conversation',
	resolveDispatchExecutionContext: async () => ({
		tenantId: 'test-tenant',
		organizationId: 'test-org',
		createdById: 'test-user'
	})
}
let failEnqueueAfterAcceptance = false
const handoff = {
	enqueue: async (message) => {
		await redis.hset(`test:dispatch:${testRun}`, message.id, JSON.stringify(message))
		if (failEnqueueAfterAcceptance) throw new Error('Injected failure after dispatch acceptance')
	}
}
const history = { updateInboundStatus: async () => {}, recordOutbound: async () => {} }
const dispatch = new LarkChatDispatchService(conversation, stateService, pluginContext)
const processor = new LarkChatStreamCallbackProcessor(channel, stateService, history, dispatch, pluginContext)
processor.conversationService = conversation
process.on('message', async (input) => {
	try {
		testRun = input.run
		failSend = input.failSend === true
		failCache = input.failCache === true
		failEnqueueAfterAcceptance = input.failEnqueueAfterAcceptance === true
		if (input.active && input.context)
			await conversation.setActiveMessage(input.context.scopeKey, input.context.xpertId, input.active)
		if (input.action === 'lease') {
			await stateService.withRun(
				testRun,
				input.context,
				async (lease) => {
					const state = lease.state ?? {
						sourceMessageId: testRun,
						context: input.context,
						nextSequence: 1,
						responseMessageContent: '',
						lastFlushAt: 0,
						lastFlushedLength: 0,
						pendingEvents: {},
						renderItems: []
					}
					if (input.holdMs) {
						process.send({ held: true })
						// Simulate a stopped process: neither renewal timers nor JS callbacks can run.
						Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, input.holdMs)
					}
					if (input.text) {
						state.responseMessageContent = input.text
						await lease.save(state)
					}
					process.send({ text: state.responseMessageContent })
				},
				{ leaseMs: input.leaseMs ?? 30000 }
			)
			return
		}
		if (input.action === 'recover') {
			const raw = await redis.get(`test:recovery:${testRun}`)
			if (raw) {
				const job = JSON.parse(raw)
				await processor.handle({ name: job.jobName, data: job.payload })
			}
		} else {
			for (const payload of input.payloads) {
				const message = {
					id: `${testRun}:${payload.sequence}`,
					type: 'channel.lark.chat_stream_event.v1',
					version: 1,
					tenantId: input.context.tenantId,
					headers: { organizationId: input.context.organizationId },
					sessionKey: testRun,
					attempt: 1,
					maxAttempts: 1,
					enqueuedAt: Date.now(),
					traceId: testRun,
					payload: { ...payload, sourceMessageId: testRun, context: input.context }
				}
				const result = await processor.process(message, {
					runId: message.id,
					traceId: testRun,
					abortSignal: new AbortController().signal
				})
				if (result.status !== 'ok') throw new Error(result.reason)
				while (applyJobs.length) {
					const job = applyJobs.shift()
					await processor.handle({ name: job.jobName, data: job.payload })
				}
			}
		}
		process.send({ ok: true })
	} catch (error) {
		process.send({ error: error.stack })
	}
})
process.on('disconnect', () => {
	redis.disconnect()
	process.exit(0)
})
process.send({ ready: true })
