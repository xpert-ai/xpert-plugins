import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import Bull, { Queue } from 'bull'
import { randomUUID } from 'crypto'
import { type Cache } from 'cache-manager'
import { ChatLarkContext, LarkGroupWindow, LarkGroupWindowItem, LarkGroupWindowParticipant, TLarkEvent } from './types.js'
import { buildLarkGroupWindowPrompt } from './lark-agent-prompt.js'
import {
	DEFAULT_GROUP_MENTION_DEBOUNCE_MS,
	DEFAULT_GROUP_MENTION_MAX_MESSAGES,
	DEFAULT_GROUP_MENTION_MAX_PARTICIPANTS,
	DEFAULT_GROUP_MENTION_MAX_WINDOW_MS,
	IntegrationLarkPluginConfig
} from './plugin-config.js'
import { LARK_CONVERSATION_QUEUE_SERVICE, LARK_PLUGIN_CONTEXT } from './tokens.js'

type LarkGroupMentionWindowStatus = 'collecting' | 'flushing'

type LarkConversationQueueService = {
	getScopeQueue(scopeKey: string): Promise<Queue<any>>
}

type LarkGroupMentionWindowState = {
	windowId: string
	integrationId: string
	chatId: string
	scopeKey: string
	openedAt: number
	lastEventAt: number
	flushAt: number
	status: LarkGroupMentionWindowStatus
	baseContext: ChatLarkContext<TLarkEvent>
	items: LarkGroupWindowItem[]
	participants: LarkGroupWindowParticipant[]
}

type LarkGroupMentionWindowFlushQueueJob = {
	key: string
}

@Injectable()
export class LarkGroupMentionWindowService implements OnModuleDestroy {
	private readonly logger = new Logger(LarkGroupMentionWindowService.name)
	private readonly windows = new Map<string, LarkGroupMentionWindowState>()
	private flushQueue?: Queue<LarkGroupMentionWindowFlushQueueJob>
	private static readonly cacheTtlMs = 15 * 60 * 1000

	constructor(
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache,
		@Inject(LARK_PLUGIN_CONTEXT)
		private readonly pluginContext: { config?: IntegrationLarkPluginConfig },
		private readonly moduleRef: ModuleRef
	) {}

	buildKey(params: { integrationId?: string | null; chatId?: string | null }): string | null {
		if (!params.integrationId || !params.chatId) {
			return null
		}
		return `lark:mention-window:${params.integrationId}:${params.chatId}`
	}

	async ingest(
		context: ChatLarkContext<TLarkEvent>
	): Promise<boolean> {
		if (context.chatType !== 'group' || !context.integrationId || !context.chatId || !context.scopeKey) {
			return false
		}

		const key = this.buildKey({
			integrationId: context.integrationId,
			chatId: context.chatId
		})
		if (!key) {
			return false
		}

		await this.ensureFlushQueue()

		const config = this.getConfig()
		const now = Date.now()
		let state = await this.getWindow(key)
		if (!state || state.status === 'flushing' || now - state.openedAt >= config.maxWindowMs) {
			state = this.createWindow(context, now, config)
		}

		const item = this.toWindowItem(context)
		if (!item || state.items.some((candidate) => candidate.messageId === item.messageId)) {
			await this.scheduleFlush(key, state.flushAt)
			await this.saveWindow(key, state)
			return false
		}

		state.items.push(item)
		state.participants = this.upsertParticipant(state.participants, {
			senderOpenId: item.senderOpenId,
			userId: item.userId,
			senderName: item.senderName
		})
		state.lastEventAt = now
		state.flushAt = Math.min(state.openedAt + config.maxWindowMs, now + config.debounceMs)
		await this.saveWindow(key, state)

		if (this.shouldFlushImmediately(state, config)) {
			await this.flushWindow(key)
			return true
		}

		await this.scheduleFlush(key, state.flushAt)
		return false
	}

	async onModuleDestroy(): Promise<void> {
		if (this.flushQueue) {
			await this.flushQueue.close()
			this.flushQueue = undefined
		}
		this.windows.clear()
	}

	private getConfig() {
		const configured = this.pluginContext.config?.groupMentionWindow
		return {
			debounceMs: configured?.debounceMs ?? DEFAULT_GROUP_MENTION_DEBOUNCE_MS,
			maxWindowMs: configured?.maxWindowMs ?? DEFAULT_GROUP_MENTION_MAX_WINDOW_MS,
			maxMessages: configured?.maxMessages ?? DEFAULT_GROUP_MENTION_MAX_MESSAGES,
			maxParticipants: configured?.maxParticipants ?? DEFAULT_GROUP_MENTION_MAX_PARTICIPANTS
		}
	}

	private createWindow(
		context: ChatLarkContext<TLarkEvent>,
		now: number,
		config: ReturnType<LarkGroupMentionWindowService['getConfig']>
	): LarkGroupMentionWindowState {
		return {
			windowId: `lark-group-window-${randomUUID()}`,
			integrationId: context.integrationId,
			chatId: context.chatId!,
			scopeKey: context.scopeKey!,
			openedAt: now,
			lastEventAt: now,
			flushAt: Math.min(now + config.debounceMs, now + config.maxWindowMs),
			status: 'collecting',
			baseContext: {
				...context
			},
			items: [],
			participants: []
		}
	}

	private toWindowItem(context: ChatLarkContext<TLarkEvent>): LarkGroupWindowItem | null {
		const messageId = this.resolveMessageId(context)
		const senderOpenId = typeof context.senderOpenId === 'string' ? context.senderOpenId.trim() : ''
		const text = typeof context.input === 'string' ? context.input.trim() : ''
		if (!messageId || !senderOpenId || !text) {
			return null
		}

		return {
			messageId,
			senderOpenId,
			userId: context.userId,
			senderName: context.senderName,
			text,
			createTime: this.resolveMessageCreateTime(context),
			mentions:
				context.semanticMessage?.mentions
					.filter((mention) => mention.idType === 'open_id' && typeof mention.id === 'string' && mention.id)
					.map((mention) => ({
						openId: mention.id as string,
						name: mention.name ?? undefined,
						isBot: mention.isBot
					})) ?? []
		}
	}

	private resolveMessageId(context: ChatLarkContext<TLarkEvent>): string | null {
		const messageId = context.message?.message?.message_id
		return typeof messageId === 'string' && messageId.trim().length > 0 ? messageId : null
	}

	private resolveMessageCreateTime(context: ChatLarkContext<TLarkEvent>): string | undefined {
		const createTime = context.message?.message?.create_time
		return typeof createTime === 'string' && createTime.trim().length > 0 ? createTime : undefined
	}

	private upsertParticipant(
		participants: LarkGroupWindowParticipant[],
		participant: LarkGroupWindowParticipant
	): LarkGroupWindowParticipant[] {
		const index = participants.findIndex((candidate) => candidate.senderOpenId === participant.senderOpenId)
		if (index < 0) {
			return [...participants, participant]
		}

		const next = [...participants]
		next[index] = {
			...next[index],
			...participant
		}
		return next
	}

	private shouldFlushImmediately(
		state: LarkGroupMentionWindowState,
		config: ReturnType<LarkGroupMentionWindowService['getConfig']>
	): boolean {
		return (
			state.items.length >= config.maxMessages ||
			state.participants.length >= config.maxParticipants ||
			Date.now() - state.openedAt >= config.maxWindowMs
		)
	}

	private async scheduleFlush(key: string, flushAt: number): Promise<void> {
		const queue = await this.ensureFlushQueue()
		const jobId = this.toFlushJobId(key)
		const existing = await queue.getJob(jobId)
		if (existing) {
			try {
				await existing.remove()
			} catch {
				// Ignore delayed job refresh failures and rely on the next add() attempt.
			}
		}

		const delay = Math.max(0, flushAt - Date.now())
		await queue.add(
			{ key },
			{
				jobId,
				delay,
				removeOnComplete: true,
				removeOnFail: true
			}
		)
	}

	private async flushWindow(key: string): Promise<void> {
		const state = await this.getWindow(key)
		if (!state || state.status === 'flushing') {
			return
		}

		const config = this.getConfig()
		state.status = 'flushing'
		await this.saveWindow(key, state)

		try {
			await this.enqueueFlushContext(this.buildFlushContext(state))
			await this.clearWindow(key)
		} catch (error) {
			this.logger.error(
				`Failed to flush group mention window "${state.windowId}" for scope "${state.scopeKey}": ${
					error instanceof Error ? error.message : String(error)
				}`
			)
			state.status = 'collecting'
			state.flushAt = Date.now() + config.debounceMs
			await this.saveWindow(key, state)
			await this.scheduleFlush(key, state.flushAt)
		}
	}

	private buildFlushContext(state: LarkGroupMentionWindowState): ChatLarkContext<TLarkEvent> {
		const groupWindow = this.toGroupWindow(state)
		const firstItem = state.items[0]
		return {
			...state.baseContext,
			userId: firstItem?.userId ?? state.baseContext.userId,
			senderOpenId: firstItem?.senderOpenId ?? state.baseContext.senderOpenId,
			senderName: firstItem?.senderName ?? state.baseContext.senderName,
			input: this.buildMergedPrompt(groupWindow),
			groupWindow,
			groupWindowId: groupWindow.windowId,
			scopeKey: groupWindow.scopeKey
		}
	}

	private toGroupWindow(state: LarkGroupMentionWindowState): LarkGroupWindow {
		return {
			windowId: state.windowId,
			integrationId: state.integrationId,
			chatId: state.chatId,
			scopeKey: state.scopeKey,
			openedAt: state.openedAt,
			lastEventAt: state.lastEventAt,
			items: state.items.map((item) => ({
				...item,
				mentions: [...(item.mentions ?? [])]
			})),
			participants: state.participants.map((participant) => ({
				...participant
			}))
		}
	}

	private buildMergedPrompt(groupWindow: LarkGroupWindow): string {
		return buildLarkGroupWindowPrompt(groupWindow)
	}

	private formatDisplayTime(createTime?: string): string | null {
		if (!createTime) {
			return null
		}

		const numeric = Number(createTime)
		const timestamp = Number.isFinite(numeric)
			? (createTime.length >= 13 ? numeric : numeric * 1000)
			: Date.parse(createTime)
		if (!Number.isFinite(timestamp)) {
			return null
		}

		const date = new Date(timestamp)
		return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(
			date.getSeconds()
		).padStart(2, '0')}`
	}

	private async getWindow(key: string): Promise<LarkGroupMentionWindowState | null> {
		const volatile = this.windows.get(key)
		if (volatile) {
			return volatile
		}

		const cached = await this.cacheManager.get<LarkGroupMentionWindowState | string>(key)
		if (!cached) {
			return null
		}

		const state =
			typeof cached === 'string'
				? (JSON.parse(cached) as LarkGroupMentionWindowState)
				: cached
		this.windows.set(key, state)
		return state
	}

	private async saveWindow(key: string, state: LarkGroupMentionWindowState): Promise<void> {
		this.windows.set(key, state)
		await this.cacheManager.set(key, JSON.stringify(state), LarkGroupMentionWindowService.cacheTtlMs)
	}

	private async clearWindow(key: string): Promise<void> {
		await this.removeFlushJob(key)
		this.windows.delete(key)
		await this.cacheManager.del(key)
	}

	private async enqueueFlushContext(context: ChatLarkContext<TLarkEvent>): Promise<void> {
		const scopeKey = context.scopeKey
		if (!scopeKey) {
			throw new Error('Missing scopeKey while enqueueing Lark group mention window flush')
		}

		const flushContext = context as ChatLarkContext<TLarkEvent> & { tenantId?: string }
		const conversationQueueService = this.moduleRef.get<LarkConversationQueueService>(
			LARK_CONVERSATION_QUEUE_SERVICE,
			{ strict: false }
		)
		if (!conversationQueueService) {
			throw new Error('Lark conversation queue service is unavailable')
		}
		const scopeQueue = await conversationQueueService.getScopeQueue(scopeKey)
		await scopeQueue.add({
			...flushContext,
			tenantId: flushContext.tenantId ?? flushContext.tenant?.id
		})
	}

	private async ensureFlushQueue(): Promise<Queue<LarkGroupMentionWindowFlushQueueJob>> {
		if (!this.flushQueue) {
			this.flushQueue = new Bull<LarkGroupMentionWindowFlushQueueJob>('lark:group-mention-window:flush', {
				redis: this.getBullRedisConfig()
			})
			this.flushQueue.process(1, async (job) => {
				await this.flushWindow(job.data.key)
			})
			this.flushQueue.on('error', (error) => {
				this.logger.error(`Queue lark:group-mention-window:flush error: ${error?.message || error}`)
			})
		}

		return this.flushQueue
	}

	private async removeFlushJob(key: string): Promise<void> {
		if (!this.flushQueue) {
			return
		}

		const existing = await this.flushQueue.getJob(this.toFlushJobId(key))
		if (existing) {
			try {
				await existing.remove()
			} catch {
				// Ignore delayed job cleanup failures during best-effort teardown.
			}
		}
	}

	private toFlushJobId(key: string): string {
		return `flush:${key}`
	}

	private getBullRedisConfig(): Bull.QueueOptions['redis'] {
		const redisUrl = process.env.REDIS_URL
		if (redisUrl) {
			return redisUrl
		}

		const host = process.env.REDIS_HOST || 'localhost'
		const portRaw = process.env.REDIS_PORT || 6379
		const username = process.env['REDIS.USERNAME'] || process.env.REDIS_USER || process.env.REDIS_USERNAME || undefined
		const password = process.env.REDIS_PASSWORD || undefined
		const port = Number(portRaw)
		const redis: Bull.QueueOptions['redis'] = {
			host,
			port: Number.isNaN(port) ? 6379 : port
		}
		if (username) {
			redis['username'] = username
		}
		if (password) {
			redis['password'] = password
		}

		if (process.env.REDIS_TLS === 'true') {
			redis['tls'] = {
				host,
				port: Number.isNaN(port) ? 6379 : port
			}
		}

		return redis
	}
}
