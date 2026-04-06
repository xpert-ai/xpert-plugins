import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import {
	CancelConversationCommand,
	INTEGRATION_PERMISSION_SERVICE_TOKEN,
	IntegrationPermissionService,
	type PluginContext,
	RequestContext,
	runWithRequestContext,
	TChatCardAction,
	TChatEventContext,
	TChatInboundMessage
} from '@xpert-ai/plugin-sdk'
import Bull, { Queue } from 'bull'
import { type Cache } from 'cache-manager'
import { Repository } from 'typeorm'
import { ChatLarkMessage } from './message.js'
import { buildLarkSpeakerContextInput } from './lark-agent-prompt.js'
import { getLarkInboundIdentityMetadata } from './lark-inbound-identity.service.js'
import {
	normalizeConversationUserKey,
	resolveConversationPrincipalKey,
	resolveConversationScopeKey,
	resolveConversationUserKey,
	toOpenIdConversationUserKey
} from './conversation-user-key.js'
import { translate } from './i18n.js'
import { LarkChannelStrategy } from './lark-channel.strategy.js'
import { DispatchLarkChatCommand, DispatchLarkChatPayload } from './handoff/commands/dispatch-lark-chat.command.js'
import { extractLarkSemanticMessage } from './lark-message-semantics.js'
import { LarkRecipientDirectoryService } from './lark-recipient-directory.service.js'
import { LARK_PLUGIN_CONTEXT } from './tokens.js'
import {
	ChatLarkContext,
	isConfirmAction,
	isEndAction,
	isLarkCardActionValue,
	isRejectAction,
	LarkGroupWindow,
	LARK_TYPING_REACTION_EMOJI_TYPE,
	LarkSemanticMessage,
	RecipientDirectory,
	resolveLarkCardActionValue,
	TIntegrationLarkOptions,
	TLarkEvent
} from './types.js'
import { LarkConversationBindingEntity } from './entities/lark-conversation-binding.entity.js'
import { LarkTriggerBindingEntity } from './entities/lark-trigger-binding.entity.js'
import { LarkGroupMentionWindowService } from './lark-group-mention-window.service.js'

type LarkConversationQueueJob = ChatLarkContext<TLarkEvent> & {
	tenantId?: string
}

type LarkTriggerService = {
	normalizeConfig: (
		config?: Record<string, unknown> | null,
		integrationId?: string | null
	) => Record<string, unknown>
	matchesInboundMessage: (params: {
		binding?: LarkTriggerBindingEntity | null
		config?: Record<string, unknown> | null
		ownerOpenId?: string | null
		integrationId?: string | null
		chatType?: string | null
		chatId?: string | null
		senderOpenId?: string | null
		botMentioned?: boolean
	}) => boolean
	handleInboundMessage: (params: {
		integrationId: string
		input?: string
		larkMessage: ChatLarkMessage
		options?: {
			confirm?: boolean
			reject?: boolean
			fromEndUserId?: string
			executorUserId?: string
			streamingEnabled?: boolean
			botMentioned?: boolean
			groupWindow?: LarkGroupWindow
		}
	}) => Promise<boolean>
}

type LarkActiveMessage = {
	id?: string
	thirdPartyMessage?: {
		id?: string
		messageId?: string
		deliveryMode?: 'interactive' | 'text'
		language?: string
		header?: any
		elements?: any[]
		status?: string
	}
}

type LarkConversationLookupOptions = {
	legacyConversationUserKey?: string | null
}

type LarkConversationBindingLookup = {
	userId?: string
	integrationId?: string
	principalKey?: string
	scopeKey?: string
	chatType?: string
	chatId?: string
	senderOpenId?: string
	conversationUserKey?: string
	xpertId: string
	conversationId: string
	tenantId?: string
	organizationId?: string
	createdById?: string
	updatedById?: string
}

type LarkConversationBindingMeta = {
	userId?: string | null
	integrationId?: string | null
	principalKey?: string | null
	scopeKey?: string | null
	chatType?: string | null
	chatId?: string | null
	senderOpenId?: string | null
	legacyConversationUserKey?: string | null
}

type LarkTargetXpertResolution = {
	scopeBinding: LarkConversationBindingLookup | null
	fallbackBinding: LarkConversationBindingLookup | null
	targetBinding: LarkConversationBindingLookup | null
	targetXpertId: string | null
	useDispatchInputForTrigger: boolean
}

export type LarkDispatchExecutionContextSource = 'exact' | 'xpert-latest' | 'request-fallback'

export interface LarkDispatchExecutionContext {
	tenantId?: string
	organizationId?: string
	createdById?: string
	source: LarkDispatchExecutionContextSource
}

@Injectable()
export class LarkConversationService implements OnModuleDestroy {
	private readonly logger = new Logger(LarkConversationService.name)
	private _integrationPermissionService: IntegrationPermissionService
	private _larkTriggerStrategy: LarkTriggerService

	public static readonly prefix = 'lark:chat'
	private static readonly cacheTtlMs = 60 * 10 * 1000

	private scopeQueues: Map<string, Queue<LarkConversationQueueJob>> = new Map()

	constructor(
		private readonly commandBus: CommandBus,
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache,
		private readonly larkChannel: LarkChannelStrategy,
		private readonly recipientDirectoryService: LarkRecipientDirectoryService,
		private readonly groupMentionWindowService: LarkGroupMentionWindowService,
		@InjectRepository(LarkConversationBindingEntity)
		private readonly conversationBindingRepository: Repository<LarkConversationBindingEntity>,
		@InjectRepository(LarkTriggerBindingEntity)
		private readonly triggerBindingRepository: Repository<LarkTriggerBindingEntity>,
		@Inject(LARK_PLUGIN_CONTEXT)
		private readonly pluginContext: PluginContext
	) {}

	private get integrationPermissionService(): IntegrationPermissionService {
		if (!this._integrationPermissionService) {
			this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
		}
		return this._integrationPermissionService
	}

	private async getLarkTriggerStrategy(): Promise<LarkTriggerService> {
		if (!this._larkTriggerStrategy) {
			const { LarkTriggerStrategy } = await import('./workflow/lark-trigger.strategy.js')
			this._larkTriggerStrategy = this.pluginContext.resolve(LarkTriggerStrategy)
		}
		return this._larkTriggerStrategy
	}

	private buildRecipientDirectoryScope(params: {
		integrationId?: string | null
		chatType?: string | null
		chatId?: string | null
		senderOpenId?: string | null
	}): Omit<RecipientDirectory, 'entries'> {
		const normalizedChatType = params.chatType === 'group' ? 'group' : 'private'
		return {
			scopeType: normalizedChatType,
			integrationId: params.integrationId ?? '',
			chatId: params.chatId ?? undefined,
			senderOpenId: params.senderOpenId ?? undefined
		}
	}

	private async ensureRecipientDirectory(params: {
		integrationId?: string | null
		chatType?: string | null
		chatId?: string | null
		senderOpenId?: string | null
		senderName?: string | null
		semanticMessage?: LarkSemanticMessage | null
	}): Promise<string | undefined> {
		const key = this.recipientDirectoryService.buildKey({
			integrationId: params.integrationId,
			chatType: params.chatType,
			chatId: params.chatId,
			senderOpenId: params.senderOpenId
		})
		if (!key) {
			return undefined
		}

		const scope = this.buildRecipientDirectoryScope({
			integrationId: params.integrationId,
			chatType: params.chatType,
			chatId: params.chatId,
			senderOpenId: params.senderOpenId
		})

		await this.recipientDirectoryService.upsertSender(key, {
			scope,
			openId: params.senderOpenId,
			name: params.senderName
		})
		await this.recipientDirectoryService.upsertMentions(key, {
			scope,
			mentions: params.semanticMessage?.mentions ?? []
		})

		return key
	}

	private async resolveSenderName(params: {
		integrationId: string
		recipientDirectoryKey?: string | null
		chatType?: string | null
		chatId?: string | null
		senderOpenId?: string | null
	}): Promise<string | null> {
		const normalizedSenderOpenId = normalizeConversationUserKey(params.senderOpenId)
		if (!normalizedSenderOpenId) {
			return null
		}

		const entry = await this.recipientDirectoryService.resolveByOpenId(
			params.recipientDirectoryKey,
			normalizedSenderOpenId
		)
		if (entry?.name) {
			return entry.name
		}

		const senderName = await this.larkChannel.resolveUserNameByOpenId(params.integrationId, normalizedSenderOpenId)
		if (!senderName || !params.recipientDirectoryKey) {
			return senderName
		}

		await this.recipientDirectoryService.upsertSender(params.recipientDirectoryKey, {
			scope: this.buildRecipientDirectoryScope({
				integrationId: params.integrationId,
				chatType: params.chatType,
				chatId: params.chatId,
				senderOpenId: normalizedSenderOpenId
			}),
			openId: normalizedSenderOpenId,
			name: senderName
		})

		return senderName
	}

	private withSpeakerContext(input: string | undefined, senderName: string | null, chatType?: string | null): string | undefined {
		return buildLarkSpeakerContextInput(input, senderName, chatType)
	}

	private resolveReplyToMessageId(
		context: Pick<ChatLarkContext<TLarkEvent>, 'replyToMessageId' | 'message'>
	): string | undefined {
		if (typeof context.replyToMessageId === 'string' && context.replyToMessageId.trim().length > 0) {
			return context.replyToMessageId.trim()
		}

		const messageId = context.message?.message?.message_id
		return typeof messageId === 'string' && messageId.trim().length > 0 ? messageId.trim() : undefined
	}

	private async attachTypingReaction(context: ChatLarkContext<TLarkEvent>): Promise<void> {
		const replyToMessageId = this.resolveReplyToMessageId(context)
		if (replyToMessageId && !context.replyToMessageId) {
			context.replyToMessageId = replyToMessageId
		}

		if (!context.integrationId || !replyToMessageId || context.typingReaction) {
			return
		}

		try {
			context.typingReaction = await this.larkChannel.createMessageReaction(
				context.integrationId,
				replyToMessageId,
				LARK_TYPING_REACTION_EMOJI_TYPE
			)
		} catch (error) {
			this.logger.warn(
				`Failed to create Lark typing reaction for message "${replyToMessageId}": ${
					error instanceof Error ? error.message : String(error)
				}`
			)
		}
	}

	private async bestEffortAttachTypingReaction(context: ChatLarkContext<TLarkEvent>): Promise<void> {
		try {
			await this.attachTypingReaction(context)
		} catch (error) {
			this.logger.warn(
				`Unexpected failure while preparing Lark typing reaction: ${
					error instanceof Error ? error.message : String(error)
				}`
			)
		}
	}

	private async clearTypingReaction(
		context: Pick<ChatLarkContext<TLarkEvent>, 'integrationId' | 'typingReaction'>
	): Promise<void> {
		const typingReaction = context.typingReaction
		if (!context.integrationId || !typingReaction?.messageId || !typingReaction.reactionId) {
			return
		}

		try {
			await this.larkChannel.deleteMessageReaction(
				context.integrationId,
				typingReaction.messageId,
				typingReaction.reactionId
			)
		} catch (error) {
			this.logger.warn(
				`Failed to delete Lark typing reaction "${typingReaction.reactionId}" for message "${
					typingReaction.messageId
				}": ${error instanceof Error ? error.message : String(error)}`
			)
		}
	}

	private async getBoundXpertId(integrationId: string): Promise<string | null> {
		if (!integrationId) {
			return null
		}
		const binding = await this.getBoundTriggerBinding(integrationId)
		return binding?.xpertId ?? null
	}

	private async getBoundTriggerBinding(integrationId: string): Promise<LarkTriggerBindingEntity | null> {
		if (!integrationId) {
			return null
		}
		return this.triggerBindingRepository.findOne({
			where: {
				integrationId
			}
		})
	}

	private logSingleChatScopeDecision(params: {
		integrationId: string
		senderOpenId?: string | null
		allowed: boolean
		binding: LarkTriggerBindingEntity
		targetBinding: LarkConversationBindingLookup | null
		targetXpertId?: string | null
	}): void {
		const singleChatScope = params.binding.config?.singleChatScope ?? 'all_users'
		const singleChatUserOpenIds = Array.isArray(params.binding.config?.singleChatUserOpenIds)
			? params.binding.config.singleChatUserOpenIds
			: []
		const senderOpenId = normalizeConversationUserKey(params.senderOpenId)
		const matchedSelectedUser = senderOpenId ? singleChatUserOpenIds.includes(senderOpenId) : false

		this.logger.log(
			`[lark-dispatch] single-chat-scope integration=${params.integrationId} sender=${senderOpenId ?? 'n/a'} allowed=${params.allowed} scope=${singleChatScope} matchedSelectedUser=${matchedSelectedUser} selectedUserOpenIds=${JSON.stringify(singleChatUserOpenIds)} boundXpert=${params.binding.xpertId} targetBinding=${params.targetBinding ? 'hit' : 'miss'} targetXpert=${params.targetXpertId ?? 'n/a'}`
		)
	}

	private resolveConversationKeys(params: {
		integrationId?: string | null
		chatType?: string | null
		chatId?: string | null
		senderOpenId?: string | null
		fallbackUserId?: string | null
	}) {
		return {
			principalKey: resolveConversationPrincipalKey({
				integrationId: params.integrationId,
				senderOpenId: params.senderOpenId
			}),
			scopeKey: resolveConversationScopeKey({
				integrationId: params.integrationId,
				chatType: params.chatType,
				chatId: params.chatId,
				senderOpenId: params.senderOpenId
			}),
			legacyConversationUserKey: resolveConversationUserKey({
				senderOpenId: params.senderOpenId,
				fallbackUserId: params.fallbackUserId
			})
		}
	}

	buildBindingMeta(meta: LarkConversationBindingMeta): LarkConversationBindingMeta {
		const normalizedScopeKey = normalizeConversationUserKey(meta.scopeKey)
		const allowLegacyFallback = this.shouldAllowLegacyFallbackForScope(normalizedScopeKey)
		const normalizedLegacyConversationUserKey =
			allowLegacyFallback
				? normalizeConversationUserKey(meta.legacyConversationUserKey) ??
				  (this.shouldMirrorLegacyConversationUserKey(normalizedScopeKey)
						? normalizedScopeKey
						: resolveConversationUserKey({
								senderOpenId: meta.senderOpenId,
								fallbackUserId: meta.userId
						  }))
				: null

		return {
			userId: normalizeConversationUserKey(meta.userId),
			integrationId: normalizeConversationUserKey(meta.integrationId),
			principalKey: normalizeConversationUserKey(meta.principalKey),
			scopeKey: normalizedScopeKey,
			chatType: normalizeConversationUserKey(meta.chatType),
			chatId: normalizeConversationUserKey(meta.chatId),
			senderOpenId: normalizeConversationUserKey(meta.senderOpenId),
			legacyConversationUserKey: normalizedLegacyConversationUserKey
		}
	}

	private shouldMirrorLegacyConversationUserKey(scopeKey: string | null): boolean {
		return Boolean(scopeKey && !scopeKey.startsWith('lark:v2:scope:'))
	}

	private shouldAllowLegacyFallbackForScope(scopeKey: string | null): boolean {
		if (!scopeKey) {
			return false
		}

		if (!scopeKey.startsWith('lark:v2:scope:')) {
			return true
		}

		return scopeKey.includes(':p2p:')
	}

	async getConversation(scopeKey: string, xpertId: string, options?: LarkConversationLookupOptions) {
		const normalizedScopeKey = normalizeConversationUserKey(scopeKey)
		const normalizedXpertId = normalizeConversationUserKey(xpertId)
		const normalizedLegacyConversationUserKey = normalizeConversationUserKey(options?.legacyConversationUserKey)
		const allowLegacyFallback = this.shouldAllowLegacyFallbackForScope(normalizedScopeKey)
		if (!normalizedScopeKey || !normalizedXpertId) {
			return undefined
		}

		const cachedConversationId = await this.cacheManager.get<string>(
			this.getConversationCacheKey(normalizedScopeKey, normalizedXpertId)
		)
		if (cachedConversationId) {
			return cachedConversationId
		}

		if (
			allowLegacyFallback &&
			normalizedLegacyConversationUserKey &&
			normalizedLegacyConversationUserKey !== normalizedScopeKey
		) {
			const legacyCachedConversationId = await this.cacheManager.get<string>(
				this.getConversationCacheKey(normalizedLegacyConversationUserKey, normalizedXpertId)
			)
			if (legacyCachedConversationId) {
				await this.cacheConversation(
					normalizedScopeKey,
					normalizedXpertId,
					legacyCachedConversationId,
					normalizedLegacyConversationUserKey
				)
				return legacyCachedConversationId
			}
		}

		const binding =
			(await this.conversationBindingRepository.findOne({
				where: {
					scopeKey: normalizedScopeKey,
					xpertId: normalizedXpertId
				}
			})) ??
			(allowLegacyFallback
				? await this.findLegacyConversationBinding(
						normalizedLegacyConversationUserKey ?? normalizedScopeKey,
						normalizedXpertId
				  )
				: null)

		const conversationId = normalizeConversationUserKey(binding?.conversationId)
		if (!conversationId) {
			return undefined
		}

		await this.cacheConversation(
			normalizedScopeKey,
			normalizedXpertId,
			conversationId,
			allowLegacyFallback ? normalizeConversationUserKey(binding?.conversationUserKey) : null
		)
		return conversationId
	}

	async setConversation(
		scopeKey: string,
		xpertId: string,
		conversationId: string,
		meta?: LarkConversationBindingMeta
	) {
		const normalizedScopeKey = normalizeConversationUserKey(scopeKey)
		const normalizedXpertId = normalizeConversationUserKey(xpertId)
		const normalizedConversationId = normalizeConversationUserKey(conversationId)
		if (!normalizedScopeKey || !normalizedXpertId || !normalizedConversationId) {
			return
		}

		const bindingMeta = this.buildBindingMeta({
			...meta,
			scopeKey: normalizedScopeKey,
			legacyConversationUserKey: meta?.legacyConversationUserKey ?? normalizedScopeKey
		})

		await this.cacheConversation(
			normalizedScopeKey,
			normalizedXpertId,
			normalizedConversationId,
			bindingMeta.legacyConversationUserKey
		)

		const bindingContext = this.resolveBindingContext()
		const userId =
			bindingMeta.userId ??
			this.resolveOpenIdFromConversationUserKey(bindingMeta.legacyConversationUserKey) ??
			bindingMeta.senderOpenId ??
			null

		await this.conversationBindingRepository.upsert(
			{
				userId,
				integrationId: bindingMeta.integrationId ?? null,
				principalKey: bindingMeta.principalKey ?? null,
				scopeKey: bindingMeta.scopeKey ?? normalizedScopeKey,
				chatType: bindingMeta.chatType ?? null,
				chatId: bindingMeta.chatId ?? null,
				senderOpenId: bindingMeta.senderOpenId ?? null,
				conversationUserKey: bindingMeta.legacyConversationUserKey ?? null,
				xpertId: normalizedXpertId,
				conversationId: normalizedConversationId,
				tenantId: bindingContext.tenantId ?? null,
				organizationId: bindingContext.organizationId ?? null,
				createdById: bindingContext.createdById ?? null,
				updatedById: bindingContext.updatedById ?? null
			},
			bindingMeta.scopeKey ? ['scopeKey', 'xpertId'] : ['conversationUserKey', 'xpertId']
		)
	}

	async getLatestConversationBindingByScopeKey(scopeKey: string): Promise<LarkConversationBindingLookup | null> {
		const normalizedScopeKey = normalizeConversationUserKey(scopeKey)
		if (!normalizedScopeKey) {
			return null
		}

		const binding = await this.conversationBindingRepository.findOne({
			where: {
				scopeKey: normalizedScopeKey
			},
			order: {
				updatedAt: 'DESC'
			}
		})
		return this.normalizeBinding(binding)
	}

	async getLatestConversationBindingByPrincipalKey(principalKey: string): Promise<LarkConversationBindingLookup | null> {
		const normalizedPrincipalKey = normalizeConversationUserKey(principalKey)
		if (!normalizedPrincipalKey) {
			return null
		}

		const binding = await this.conversationBindingRepository.findOne({
			where: {
				principalKey: normalizedPrincipalKey
			},
			order: {
				updatedAt: 'DESC'
			}
		})
		return this.normalizeBinding(binding)
	}

	async getLatestConversationBindingByChatId(
		integrationId: string,
		chatId: string
	): Promise<LarkConversationBindingLookup | null> {
		const normalizedIntegrationId = normalizeConversationUserKey(integrationId)
		const normalizedChatId = normalizeConversationUserKey(chatId)
		if (!normalizedIntegrationId || !normalizedChatId) {
			return null
		}

		const binding = await this.conversationBindingRepository.findOne({
			where: {
				integrationId: normalizedIntegrationId,
				chatId: normalizedChatId
			},
			order: {
				updatedAt: 'DESC'
			}
		})
		return this.normalizeBinding(binding)
	}

	async getLatestConversationBindingByUserId(
		userId: string,
		integrationId?: string | null
	): Promise<LarkConversationBindingLookup | null> {
		const normalizedUserId = normalizeConversationUserKey(userId)
		const normalizedIntegrationId = normalizeConversationUserKey(integrationId)
		if (!normalizedUserId) {
			return null
		}

		const bindings = await this.conversationBindingRepository.find({
			where: {
				userId: normalizedUserId
			},
			order: {
				updatedAt: 'DESC'
			}
		})
		if (!normalizedIntegrationId) {
			return this.normalizeBinding(bindings[0])
		}

		const exactBinding = bindings.find(
			(binding) => normalizeConversationUserKey(binding.integrationId) === normalizedIntegrationId
		)
		if (exactBinding) {
			return this.normalizeBinding(exactBinding)
		}

		const legacyBinding = bindings.find((binding) => !normalizeConversationUserKey(binding.integrationId))
		return this.normalizeBinding(legacyBinding)
	}

	private normalizeBinding(binding?: LarkConversationBindingEntity | null): LarkConversationBindingLookup | null {
		if (!binding?.xpertId || !binding?.conversationId) {
			return null
		}

		return {
			userId: normalizeConversationUserKey(binding.userId) ?? undefined,
			integrationId: normalizeConversationUserKey(binding.integrationId) ?? undefined,
			principalKey: normalizeConversationUserKey(binding.principalKey) ?? undefined,
			scopeKey: normalizeConversationUserKey(binding.scopeKey) ?? undefined,
			chatType: normalizeConversationUserKey(binding.chatType) ?? undefined,
			chatId: normalizeConversationUserKey(binding.chatId) ?? undefined,
			senderOpenId: normalizeConversationUserKey(binding.senderOpenId) ?? undefined,
			conversationUserKey: normalizeConversationUserKey(binding.conversationUserKey) ?? undefined,
			xpertId: binding.xpertId,
			conversationId: binding.conversationId,
			tenantId: normalizeConversationUserKey(binding.tenantId) ?? undefined,
			organizationId: normalizeConversationUserKey(binding.organizationId) ?? undefined,
			createdById: normalizeConversationUserKey(binding.createdById) ?? undefined,
			updatedById: normalizeConversationUserKey(binding.updatedById) ?? undefined
		}
	}

	async resolveDispatchExecutionContext(
		xpertId: string,
		scopeKeyOrOptions?: string | (LarkConversationLookupOptions & { scopeKey?: string | null })
	): Promise<LarkDispatchExecutionContext> {
		const normalizedXpertId = normalizeConversationUserKey(xpertId)
		if (!normalizedXpertId) {
			return { source: 'request-fallback' }
		}

		const normalizedScopeKey =
			typeof scopeKeyOrOptions === 'string'
				? normalizeConversationUserKey(scopeKeyOrOptions)
				: normalizeConversationUserKey(scopeKeyOrOptions?.scopeKey)
		const normalizedLegacyConversationUserKey =
			typeof scopeKeyOrOptions === 'string'
				? null
				: normalizeConversationUserKey(scopeKeyOrOptions?.legacyConversationUserKey)
		const allowLegacyFallback = this.shouldAllowLegacyFallbackForScope(normalizedScopeKey)

		const exactBinding =
			(normalizedScopeKey
				? await this.conversationBindingRepository.findOne({
						where: {
							scopeKey: normalizedScopeKey,
							xpertId: normalizedXpertId
						}
				  })
				: null) ??
			(allowLegacyFallback
				? await this.findLegacyConversationBinding(normalizedLegacyConversationUserKey, normalizedXpertId)
				: null)

		const needsXpertLatestBinding = !this.hasCompleteDispatchBindingContext(exactBinding)
		const xpertLatestBinding = needsXpertLatestBinding
			? await this.conversationBindingRepository.findOne({
					where: {
						xpertId: normalizedXpertId
					},
					order: {
						updatedAt: 'DESC'
					}
			  })
			: null

		const tenantId =
			this.normalizeBindingContextField(exactBinding?.tenantId) ??
			this.normalizeBindingContextField(xpertLatestBinding?.tenantId)
		const organizationId =
			this.normalizeBindingContextField(exactBinding?.organizationId) ??
			this.normalizeBindingContextField(xpertLatestBinding?.organizationId)
		const createdById =
			this.normalizeBindingContextField(exactBinding?.createdById) ??
			this.normalizeBindingContextField(xpertLatestBinding?.createdById)

		return {
			tenantId,
			organizationId,
			createdById,
			source: exactBinding ? 'exact' : xpertLatestBinding ? 'xpert-latest' : 'request-fallback'
		}
	}

	async getActiveMessage(
		scopeKey: string,
		xpertId: string,
		options?: LarkConversationLookupOptions
	): Promise<LarkActiveMessage | null> {
		const normalizedScopeKey = normalizeConversationUserKey(scopeKey)
		const normalizedXpertId = normalizeConversationUserKey(xpertId)
		const normalizedLegacyConversationUserKey = normalizeConversationUserKey(options?.legacyConversationUserKey)
		const allowLegacyFallback = this.shouldAllowLegacyFallbackForScope(normalizedScopeKey)
		if (!normalizedScopeKey || !normalizedXpertId) {
			return null
		}

		const message = await this.cacheManager.get<LarkActiveMessage>(
			this.getActiveMessageCacheKey(normalizedScopeKey, normalizedXpertId)
		)
		if (message) {
			return message
		}

		if (
			allowLegacyFallback &&
			normalizedLegacyConversationUserKey &&
			normalizedLegacyConversationUserKey !== normalizedScopeKey
		) {
			return (
				(await this.cacheManager.get<LarkActiveMessage>(
					this.getActiveMessageCacheKey(normalizedLegacyConversationUserKey, normalizedXpertId)
				)) ?? null
			)
		}

		return null
	}

	async setActiveMessage(
		scopeKey: string,
		xpertId: string,
		message: LarkActiveMessage,
		options?: LarkConversationLookupOptions
	): Promise<void> {
		const normalizedScopeKey = normalizeConversationUserKey(scopeKey)
		const normalizedXpertId = normalizeConversationUserKey(xpertId)
		const normalizedLegacyConversationUserKey = normalizeConversationUserKey(options?.legacyConversationUserKey)
		const allowLegacyFallback = this.shouldAllowLegacyFallbackForScope(normalizedScopeKey)
		if (!normalizedScopeKey || !normalizedXpertId) {
			return
		}

		await this.cacheManager.set(
			this.getActiveMessageCacheKey(normalizedScopeKey, normalizedXpertId),
			message,
			LarkConversationService.cacheTtlMs
		)

		if (
			allowLegacyFallback &&
			normalizedLegacyConversationUserKey &&
			normalizedLegacyConversationUserKey !== normalizedScopeKey
		) {
			await this.cacheManager.set(
				this.getActiveMessageCacheKey(normalizedLegacyConversationUserKey, normalizedXpertId),
				message,
				LarkConversationService.cacheTtlMs
			)
		}
	}

	async clearConversationSession(
		scopeKey: string,
		xpertId: string,
		options?: LarkConversationLookupOptions
	): Promise<void> {
		const normalizedScopeKey = normalizeConversationUserKey(scopeKey)
		const normalizedXpertId = normalizeConversationUserKey(xpertId)
		const normalizedLegacyConversationUserKey = normalizeConversationUserKey(options?.legacyConversationUserKey)
		const allowLegacyFallback = this.shouldAllowLegacyFallbackForScope(normalizedScopeKey)
		if (!normalizedScopeKey || !normalizedXpertId) {
			return
		}

		await this.cacheManager.del(this.getConversationCacheKey(normalizedScopeKey, normalizedXpertId))
		await this.cacheManager.del(this.getActiveMessageCacheKey(normalizedScopeKey, normalizedXpertId))
		if (
			allowLegacyFallback &&
			normalizedLegacyConversationUserKey &&
			normalizedLegacyConversationUserKey !== normalizedScopeKey
		) {
			await this.cacheManager.del(this.getConversationCacheKey(normalizedLegacyConversationUserKey, normalizedXpertId))
			await this.cacheManager.del(this.getActiveMessageCacheKey(normalizedLegacyConversationUserKey, normalizedXpertId))
		}
		await this.removeConversationBindingFromStore(
			normalizedScopeKey,
			normalizedXpertId,
			normalizedLegacyConversationUserKey
		)
	}

	async ask(xpertId: string, content: string, message: ChatLarkMessage) {
		await this.dispatchToLarkChat({
			xpertId,
			input: content,
			larkMessage: message
		})
	}

	private buildDispatchOptions(params?: {
		groupWindow?: LarkGroupWindow
		mappedUserId?: string | null
	}): DispatchLarkChatPayload['options'] | undefined {
		const fromEndUserId = normalizeConversationUserKey(
			params?.groupWindow?.items[0]?.userId ?? params?.mappedUserId
		)
		if (!params?.groupWindow && !fromEndUserId) {
			return undefined
		}

		return {
			...(fromEndUserId ? { fromEndUserId } : {}),
			...(params?.groupWindow ? { groupWindow: params.groupWindow } : {})
		}
	}

	private shouldPreferHistoricalBinding(
		binding: LarkConversationBindingLookup | null,
		integrationId?: string | null,
		configuredXpertId?: string | null
	): boolean {
		if (!binding?.xpertId) {
			return false
		}

		const normalizedIntegrationId = normalizeConversationUserKey(integrationId)
		const bindingIntegrationId = normalizeConversationUserKey(binding.integrationId)
		const normalizedConfiguredXpertId = normalizeConversationUserKey(configuredXpertId)
		if (bindingIntegrationId) {
			return !normalizedIntegrationId || bindingIntegrationId === normalizedIntegrationId
		}

		if (!normalizedConfiguredXpertId) {
			return true
		}

		return binding.xpertId === normalizedConfiguredXpertId
	}

	private shouldPurgeBindingForConfiguredXpert(
		binding: LarkConversationBindingLookup | null,
		integrationId?: string | null,
		configuredXpertId?: string | null
	): boolean {
		if (!binding?.xpertId || !configuredXpertId || binding.xpertId === configuredXpertId) {
			return false
		}

		const normalizedIntegrationId = normalizeConversationUserKey(integrationId)
		const bindingIntegrationId = normalizeConversationUserKey(binding.integrationId)
		return !bindingIntegrationId || !normalizedIntegrationId || bindingIntegrationId === normalizedIntegrationId
	}

	private async purgeBindingSession(
		binding: LarkConversationBindingLookup | null,
		fallbackScopeKey?: string | null,
		fallbackLegacyConversationUserKey?: string | null
	): Promise<void> {
		if (!binding?.xpertId) {
			return
		}

		const scopeKey =
			normalizeConversationUserKey(binding.scopeKey) ??
			normalizeConversationUserKey(fallbackScopeKey) ??
			normalizeConversationUserKey(binding.conversationUserKey)
		if (!scopeKey) {
			return
		}

		await this.clearConversationSession(scopeKey, binding.xpertId, {
			legacyConversationUserKey:
				normalizeConversationUserKey(binding.conversationUserKey) ??
				normalizeConversationUserKey(fallbackLegacyConversationUserKey)
		})
	}

	private async purgeDisallowedTriggerBindings(params: {
		integrationId: string
		scopeBinding: LarkConversationBindingLookup | null
		fallbackBinding: LarkConversationBindingLookup | null
		scopeKey?: string | null
		legacyConversationUserKey?: string | null
	}): Promise<void> {
		const normalizedIntegrationId = normalizeConversationUserKey(params.integrationId)
		const bindings = [params.scopeBinding, params.fallbackBinding]
		const visited = new Set<string>()

		for (const binding of bindings) {
			if (!binding?.xpertId) {
				continue
			}

			const bindingIntegrationId = normalizeConversationUserKey(binding.integrationId)
			if (bindingIntegrationId && bindingIntegrationId !== normalizedIntegrationId) {
				continue
			}

			const bindingKey = [
				normalizeConversationUserKey(binding.scopeKey) ?? '',
				normalizeConversationUserKey(binding.conversationUserKey) ?? '',
				binding.xpertId
			].join('|')
			if (visited.has(bindingKey)) {
				continue
			}
			visited.add(bindingKey)

			await this.purgeBindingSession(
				binding,
				params.scopeKey ?? binding.scopeKey ?? binding.conversationUserKey,
				params.legacyConversationUserKey
			)
		}
	}

	private async resolveTargetXpertId(params: {
		integrationId: string
		scopeKey?: string | null
		legacyConversationUserKey?: string | null
		principalKey?: string | null
		senderOpenId?: string | null
		fallbackXpertId?: string | null
		}): Promise<LarkTargetXpertResolution> {
		let scopeBinding = params.scopeKey ? await this.getLatestConversationBindingByScopeKey(params.scopeKey) : null
		let fallbackBinding =
			scopeBinding
				? null
				: (params.principalKey ? await this.getLatestConversationBindingByPrincipalKey(params.principalKey) : null) ??
				  (params.senderOpenId
						? await this.getLatestConversationBindingByUserId(params.senderOpenId, params.integrationId)
						: null)
		const boundXpertId = await this.getBoundXpertId(params.integrationId)
		const configuredXpertId = boundXpertId ?? normalizeConversationUserKey(params.fallbackXpertId)
		if (this.shouldPurgeBindingForConfiguredXpert(scopeBinding, params.integrationId, configuredXpertId)) {
			await this.purgeBindingSession(scopeBinding, params.scopeKey, params.legacyConversationUserKey)
			scopeBinding = null
		}
		if (
			!scopeBinding &&
			this.shouldPurgeBindingForConfiguredXpert(fallbackBinding, params.integrationId, configuredXpertId)
		) {
			await this.purgeBindingSession(
				fallbackBinding,
				params.scopeKey ?? fallbackBinding?.scopeKey ?? fallbackBinding?.conversationUserKey,
				params.legacyConversationUserKey
			)
			fallbackBinding = null
		}
		const targetScopeKey =
			normalizeConversationUserKey(params.scopeKey) ?? normalizeConversationUserKey(params.legacyConversationUserKey)
		const allowHistoricalTargetReuse = this.shouldAllowLegacyFallbackForScope(targetScopeKey)
		const targetBinding =
			scopeBinding ??
			(allowHistoricalTargetReuse &&
			this.shouldPreferHistoricalBinding(fallbackBinding, params.integrationId, configuredXpertId)
				? fallbackBinding
				: null)

		return {
			scopeBinding,
			fallbackBinding,
			targetBinding,
			targetXpertId: targetBinding?.xpertId ?? configuredXpertId ?? null,
			useDispatchInputForTrigger: !targetBinding && Boolean(boundXpertId)
		}
	}

	async processMessage(options: ChatLarkContext<TLarkEvent>): Promise<unknown> {
		const { userId, integrationId, message, senderOpenId } = options
		const integration = await this.integrationPermissionService.read(integrationId)
		if (!integration) {
			throw new Error(`Integration ${integrationId} not found`)
		}

		const semanticMessage = options.semanticMessage ?? extractLarkSemanticMessage(message)
		let text = options.input || semanticMessage?.agentText
		if (!text && message?.message?.content) {
			try {
				const textContent = JSON.parse(message.message.content)
				text = textContent.text as string
			} catch {
				text = message.message.content as any
			}
		}

		const keys = this.resolveConversationKeys({
			integrationId,
			chatType: options.chatType,
			chatId: options.chatId,
			senderOpenId,
			fallbackUserId: userId
		})

		const recipientDirectoryKey =
			options.recipientDirectoryKey ??
			(await this.ensureRecipientDirectory({
				integrationId,
				chatType: options.chatType,
				chatId: options.chatId,
				senderOpenId,
				senderName: options.senderName ?? null,
				semanticMessage
			}))
		const senderName =
			options.senderName ??
			(await this.resolveSenderName({
				integrationId,
				recipientDirectoryKey,
				chatType: options.chatType,
				chatId: options.chatId,
				senderOpenId
			}))
		const dispatchInput =
			options.groupWindow && text
				? text
				: this.withSpeakerContext(text, senderName, options.chatType)
		const fallbackXpertId = integration.options?.xpertId
		const boundTriggerBinding = await this.getBoundTriggerBinding(integrationId)
		const {
			scopeBinding,
			fallbackBinding,
			targetBinding,
			targetXpertId,
			useDispatchInputForTrigger
		} = await this.resolveTargetXpertId({
			integrationId,
			scopeKey: keys.scopeKey,
			legacyConversationUserKey: keys.legacyConversationUserKey,
			principalKey: keys.principalKey,
			senderOpenId,
			fallbackXpertId
		})

		if (!targetXpertId) {
			await this.clearTypingReaction(options)
			await this.larkChannel.errorMessage(
				{
					integrationId,
					chatId: options.chatId
				},
				new Error('No xpertId configured for this Lark integration. Please configure xpertId first.')
			)
			return null
		}

		const effectiveScopeKey =
			keys.scopeKey ??
			scopeBinding?.scopeKey ??
			keys.legacyConversationUserKey ??
			fallbackBinding?.scopeKey ??
			fallbackBinding?.conversationUserKey ??
			userId
		const legacyConversationUserKey = keys.legacyConversationUserKey ?? fallbackBinding?.conversationUserKey ?? userId
		if (scopeBinding?.conversationId) {
			await this.cacheConversation(
				effectiveScopeKey,
				scopeBinding.xpertId,
				scopeBinding.conversationId,
				this.shouldAllowLegacyFallbackForScope(effectiveScopeKey) ? legacyConversationUserKey : null
			)
		}

		const activeMessage = await this.getActiveMessage(effectiveScopeKey, targetXpertId, {
			legacyConversationUserKey
		})
		const larkMessage = new ChatLarkMessage(
			{
				...options,
				connectionMode: integration.options?.connectionMode ?? 'webhook',
				semanticMessage,
				senderName,
				replyToMessageId: options.replyToMessageId ?? this.resolveReplyToMessageId(options),
				typingReaction: options.typingReaction,
				principalKey: keys.principalKey ?? options.principalKey,
				scopeKey: effectiveScopeKey,
				legacyConversationUserKey,
				recipientDirectoryKey,
				larkChannel: this.larkChannel
			},
			{
				text,
				language: activeMessage?.thirdPartyMessage?.language || integration.options?.preferLanguage
			}
		)

		const dispatchOptions = this.buildDispatchOptions({
			groupWindow: options.groupWindow,
			mappedUserId: options.mappedUserId
		})
		const larkTriggerStrategy = await this.getLarkTriggerStrategy()
		if (boundTriggerBinding) {
			const matchesBoundTrigger = larkTriggerStrategy.matchesInboundMessage({
				binding: boundTriggerBinding,
				integrationId,
				chatType: options.chatType,
				chatId: options.chatId,
				senderOpenId,
				botMentioned: options.botMentioned
			})
			if ((options.chatType ?? 'p2p') !== 'group') {
				this.logSingleChatScopeDecision({
					integrationId,
					senderOpenId,
					allowed: matchesBoundTrigger,
					binding: boundTriggerBinding,
					targetBinding,
					targetXpertId
				})
			}
			if (!matchesBoundTrigger) {
				await this.purgeDisallowedTriggerBindings({
					integrationId,
					scopeBinding,
					fallbackBinding,
					scopeKey: effectiveScopeKey,
					legacyConversationUserKey
				})
				this.logger.debug(
					`[lark-dispatch] inbound blocked by trigger scope integration=${integrationId} chat=${options.chatId ?? 'n/a'} sender=${senderOpenId ?? 'n/a'}`
				)
				await this.clearTypingReaction(options)
				return null
			}
		}
		if (targetBinding) {
			return await this.dispatchToLarkChat({
				xpertId: targetXpertId,
				input: dispatchInput,
				larkMessage,
				options: dispatchOptions
			})
		}

		const handledByTrigger = await larkTriggerStrategy.handleInboundMessage({
			integrationId,
			input: useDispatchInputForTrigger ? dispatchInput : text,
			larkMessage,
			options: {
				...dispatchOptions,
				botMentioned: options.botMentioned
			}
		})
		if (handledByTrigger) {
			return larkMessage
		}

		if (!boundTriggerBinding && fallbackXpertId) {
			return await this.dispatchToLarkChat({
				xpertId: fallbackXpertId,
				input: dispatchInput,
				larkMessage,
				options: dispatchOptions
			})
		}

		await this.clearTypingReaction(options)
		await this.larkChannel.errorMessage(
			{
				integrationId,
				chatId: options.chatId
			},
			new Error('No xpertId configured for this Lark integration. Please configure xpertId first.')
		)
		return null
	}

	async onAction(
		action: string,
		chatContext: ChatLarkContext,
		scopeKey: string,
		xpertId: string,
		actionMessageId?: string,
		legacyConversationUserKey?: string
	) {
		const conversationId = await this.getConversation(scopeKey, xpertId, {
			legacyConversationUserKey
		})
		if (!conversationId) {
			return this.replyActionSessionTimedOut(chatContext)
		}

		if (!isEndAction(action) && !isConfirmAction(action) && !isRejectAction(action)) {
			const scopeQueue = await this.getScopeQueue(chatContext.scopeKey ?? scopeKey)
			await scopeQueue.add({
				...chatContext,
				tenantId: RequestContext.currentUser()?.tenantId,
				input: action
			})
			return
		}

		const activeMessage = await this.getActiveMessage(scopeKey, xpertId, {
			legacyConversationUserKey
		})
		const thirdPartyMessage = activeMessage?.thirdPartyMessage
		const larkMessageId = actionMessageId || thirdPartyMessage?.id
		if (!activeMessage || !thirdPartyMessage || !larkMessageId) {
			await this.clearConversationSession(scopeKey, xpertId, {
				legacyConversationUserKey
			})
			return this.replyActionSessionTimedOut(chatContext)
		}

		const prevMessage = new ChatLarkMessage(
			{
				...chatContext,
				connectionMode: chatContext.connectionMode ?? 'webhook',
				scopeKey,
				legacyConversationUserKey,
				larkChannel: this.larkChannel
			},
			{
				id: larkMessageId,
				messageId: activeMessage.id || thirdPartyMessage.messageId,
				deliveryMode: thirdPartyMessage.deliveryMode,
				language: thirdPartyMessage.language,
				header: thirdPartyMessage.header,
				elements: [...(thirdPartyMessage.elements ?? [])],
				status: thirdPartyMessage.status as any
			} as any
		)

		const newMessage = new ChatLarkMessage(
			{
				...chatContext,
				connectionMode: chatContext.connectionMode ?? 'webhook',
				scopeKey,
				legacyConversationUserKey,
				larkChannel: this.larkChannel
			},
			{
				language: thirdPartyMessage.language
			} as any
		)

		if (isEndAction(action)) {
			await prevMessage.end()
			await this.cancelConversation(conversationId)
			await this.clearConversationSession(scopeKey, xpertId, {
				legacyConversationUserKey
			})
			return
		}

		await prevMessage.done()
		await this.dispatchToLarkChat({
			xpertId,
			larkMessage: newMessage,
			options: isConfirmAction(action) ? { confirm: true } : { reject: true }
		})
	}

	private async cacheConversation(
		scopeKey: string,
		xpertId: string,
		conversationId: string,
		legacyConversationUserKey?: string | null
	): Promise<void> {
		await this.cacheManager.set(
			this.getConversationCacheKey(scopeKey, xpertId),
			conversationId,
			LarkConversationService.cacheTtlMs
		)

		const normalizedLegacyConversationUserKey = normalizeConversationUserKey(legacyConversationUserKey)
		if (normalizedLegacyConversationUserKey && normalizedLegacyConversationUserKey !== scopeKey) {
			await this.cacheManager.set(
				this.getConversationCacheKey(normalizedLegacyConversationUserKey, xpertId),
				conversationId,
				LarkConversationService.cacheTtlMs
			)
		}
	}

	private async dispatchToLarkChat(payload: DispatchLarkChatPayload): Promise<ChatLarkMessage> {
		return this.commandBus.execute(new DispatchLarkChatCommand(payload))
	}

	private resolveOpenIdFromConversationUserKey(conversationUserKey?: string | null): string | null {
		if (!conversationUserKey || !conversationUserKey.startsWith('open_id:')) {
			return null
		}
		return normalizeConversationUserKey(conversationUserKey.slice('open_id:'.length))
	}

	private resolveBindingContext() {
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const userId = RequestContext.currentUserId()
		return {
			tenantId: tenantId ?? null,
			organizationId: organizationId ?? null,
			createdById: userId ?? null,
			updatedById: userId ?? null
		}
	}

	private hasCompleteDispatchBindingContext(
		binding?: Pick<LarkConversationBindingEntity, 'tenantId' | 'organizationId' | 'createdById'> | null
	): boolean {
		return Boolean(
			this.normalizeBindingContextField(binding?.tenantId) &&
				this.normalizeBindingContextField(binding?.organizationId) &&
				this.normalizeBindingContextField(binding?.createdById)
		)
	}

	private normalizeBindingContextField(value: unknown): string | undefined {
		return normalizeConversationUserKey(value) ?? undefined
	}

	private async findLegacyConversationBinding(
		conversationUserKey?: string | null,
		xpertId?: string | null
	): Promise<LarkConversationBindingEntity | null> {
		const normalizedConversationUserKey = normalizeConversationUserKey(conversationUserKey)
		const normalizedXpertId = normalizeConversationUserKey(xpertId)
		if (!normalizedConversationUserKey || !normalizedXpertId) {
			return null
		}

		return (
			(await this.conversationBindingRepository.findOne({
				where: {
					conversationUserKey: normalizedConversationUserKey,
					xpertId: normalizedXpertId
				},
				order: {
					updatedAt: 'DESC'
				}
			})) ?? null
		)
	}

	private async removeConversationBindingFromStore(
		scopeKey: string,
		xpertId: string,
		legacyConversationUserKey?: string | null
	): Promise<void> {
		await this.conversationBindingRepository.delete({
			scopeKey,
			xpertId
		})

		const normalizedLegacyConversationUserKey = normalizeConversationUserKey(legacyConversationUserKey)
		if (
			this.shouldAllowLegacyFallbackForScope(scopeKey) &&
			normalizedLegacyConversationUserKey &&
			normalizedLegacyConversationUserKey !== scopeKey
		) {
			await this.conversationBindingRepository.delete({
				conversationUserKey: normalizedLegacyConversationUserKey,
				xpertId
			})
		}
	}

	private getConversationCacheKey(scopeKey: string, xpertId: string): string {
		return `${LarkConversationService.prefix}:${scopeKey}:${xpertId}`
	}

	private getActiveMessageCacheKey(scopeKey: string, xpertId: string): string {
		return `${this.getConversationCacheKey(scopeKey, xpertId)}:active-message`
	}

	private async replyActionSessionTimedOut(chatContext: ChatLarkContext): Promise<void> {
		const { integrationId, chatId } = chatContext
		await this.larkChannel.errorMessage(
			{ integrationId, chatId },
			new Error(translate('integration.Lark.ActionSessionTimedOut'))
		)
	}

	private async cancelConversation(conversationId?: string): Promise<void> {
		if (!conversationId) {
			return
		}

		try {
			await this.commandBus.execute(new CancelConversationCommand({ conversationId }))
		} catch (error) {
			this.logger.warn(
				`Failed to cancel conversation "${conversationId}" from Lark end action: ${
					(error as Error)?.message ?? error
				}`
			)
		}
	}

	async getScopeQueue(scopeKey: string): Promise<Bull.Queue<LarkConversationQueueJob>> {
		const normalizedScopeKey = normalizeConversationUserKey(scopeKey)
		if (!normalizedScopeKey) {
			throw new Error('Missing scopeKey for Lark queue')
		}

		if (!this.scopeQueues.has(normalizedScopeKey)) {
			const queue = new Bull<LarkConversationQueueJob>(`lark:scope:${normalizedScopeKey}`, {
				redis: this.getBullRedisConfig()
			})

			queue.process(1, async (job) => {
				const tenantId = job.data.tenantId || job.data.tenant?.id
				if (!tenantId) {
					this.logger.warn(`Missing tenantId for scope ${normalizedScopeKey}, skip job ${job.id}`)
					return
				}

				const user = await this.larkChannel.getUserById(tenantId, job.data.userId)
				if (!user) {
					this.logger.warn(`User ${job.data.userId} not found, skip job ${job.id}`)
					return
				}

				runWithRequestContext(
					{
						user,
						headers: {
							['organization-id']: job.data.organizationId,
							['tenant-id']: tenantId,
							...(job.data.preferLanguage
								? {
										language: job.data.preferLanguage
								  }
								: {})
						}
					},
					{},
					async () => {
						try {
							await this.processMessage(job.data as ChatLarkContext<TLarkEvent>)
							return `Processed message: ${job.id}`
						} catch (err) {
							this.logger.error(err)
							return `Failed to process message: ${job.id} with error ${(err as Error)?.message ?? err}`
						}
					}
				)
			})

			queue.on('completed', (job) => {
				console.log(`Job ${job.id} for scope ${normalizedScopeKey} completed.`)
			})
			queue.on('failed', (job, error) => {
				console.error(`Job ${job.id} for scope ${normalizedScopeKey} failed:`, error.message)
			})
			queue.on('error', (error) => {
				this.logger.error(`Queue lark:scope:${normalizedScopeKey} error: ${error?.message || error}`)
			})

			this.scopeQueues.set(normalizedScopeKey, queue)
		}

		return this.scopeQueues.get(normalizedScopeKey)!
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

	private resolveInboundText(
		message: TChatInboundMessage,
		semanticMessage?: LarkSemanticMessage | null
	): string | undefined {
		if (semanticMessage?.agentText) {
			return semanticMessage.agentText
		}
		return typeof message.content === 'string' && message.content.trim().length > 0
			? message.content.trim()
			: undefined
	}

	private getMappedUserIdFromCurrentRequest(): string | undefined {
		return (
			normalizeConversationUserKey(
				getLarkInboundIdentityMetadata(RequestContext.currentUser())?.mappedUserId
			) ?? undefined
		)
	}

	private async shouldBypassGroupMentionWindow(
		queueJob: LarkConversationQueueJob
	): Promise<boolean> {
		if (queueJob.chatType !== 'group') {
			return false
		}

		const binding = await this.triggerBindingRepository.findOne({
			where: {
				integrationId: queueJob.integrationId
			}
		})
		if (!binding?.xpertId) {
			return false
		}

		const larkTriggerStrategy = await this.getLarkTriggerStrategy()
		const normalizedConfig = larkTriggerStrategy.normalizeConfig(binding.config, queueJob.integrationId)
		if (normalizedConfig?.groupReplyStrategy !== 'all_messages') {
			return false
		}

		return larkTriggerStrategy.matchesInboundMessage({
			binding,
			integrationId: queueJob.integrationId,
			chatType: queueJob.chatType,
			chatId: queueJob.chatId,
			senderOpenId: queueJob.senderOpenId,
			botMentioned: queueJob.botMentioned
		})
	}

	async handleMessage(message: TChatInboundMessage, ctx: TChatEventContext<TIntegrationLarkOptions>): Promise<void> {
		const user = RequestContext.currentUser()
		if (!user) {
			this.logger.warn('No user in request context, cannot handle message')
			return
		}
		const mappedUserId = this.getMappedUserIdFromCurrentRequest()

		const semanticMessage =
			(message as TChatInboundMessage & { semanticMessage?: LarkSemanticMessage }).semanticMessage ??
			extractLarkSemanticMessage(message.raw)
		const recipientDirectoryKey = await this.ensureRecipientDirectory({
			integrationId: ctx.integration.id,
			chatType: message.chatType,
			chatId: message.chatId,
			senderOpenId: message.senderId,
			senderName: message.senderName,
			semanticMessage
		})
		const keys = this.resolveConversationKeys({
			integrationId: ctx.integration.id,
			chatType: message.chatType,
			chatId: message.chatId,
			senderOpenId: message.senderId,
			fallbackUserId: user.id
		})
		const queueJob: LarkConversationQueueJob = {
			tenant: ctx.integration.tenant,
			tenantId: user.tenantId || ctx.tenantId,
			organizationId: ctx.organizationId,
			integrationId: ctx.integration.id,
			preferLanguage: ctx.integration.options?.preferLanguage,
			userId: user.id,
			mappedUserId,
			message: message.raw,
			input: this.resolveInboundText(message, semanticMessage),
			chatId: message.chatId,
			chatType: message.chatType === 'private' ? 'p2p' : message.chatType,
			replyToMessageId:
				typeof message.messageId === 'string' && message.messageId.trim().length > 0
					? message.messageId.trim()
					: undefined,
			senderOpenId: message.senderId,
			senderName: message.senderName,
			semanticMessage,
			principalKey: keys.principalKey ?? undefined,
			scopeKey: keys.scopeKey ?? undefined,
			legacyConversationUserKey: keys.legacyConversationUserKey ?? undefined,
			recipientDirectoryKey,
			botMentioned: Boolean((message as any).isBotMentioned)
		}

		this.logger.debug(
			`[lark-dispatch] inbound integration=${ctx.integration.id} chat=${message.chatId} sender=${message.senderId} content=${JSON.stringify(message.content)}`
		)

		if (queueJob.chatType === 'group' && queueJob.scopeKey) {
			if (await this.shouldBypassGroupMentionWindow(queueJob)) {
				await this.bestEffortAttachTypingReaction(queueJob)
				const scopeQueue = await this.getScopeQueue(queueJob.scopeKey)
				await scopeQueue.add(queueJob)
				return
			}
			if (queueJob.botMentioned) {
				await this.groupMentionWindowService.ingest(queueJob)
			}
			return
		}

		await this.bestEffortAttachTypingReaction(queueJob)
		const scopeQueue = await this.getScopeQueue(queueJob.scopeKey ?? queueJob.legacyConversationUserKey ?? user.id)
		await scopeQueue.add(queueJob)
	}

	async handleCardAction(action: TChatCardAction, ctx: TChatEventContext<TIntegrationLarkOptions>): Promise<void> {
		const user = RequestContext.currentUser()
		if (!user) {
			this.logger.warn('No user in request context, cannot handle card action')
			return
		}

		if (!isLarkCardActionValue(action.value)) {
			this.logger.warn(`Unsupported card action value from Lark: ${JSON.stringify(action.value)}`)
			return
		}

		const legacyConversationUserKey = toOpenIdConversationUserKey(action.userId)
		if (!legacyConversationUserKey) {
			this.logger.warn('Missing Lark action user open_id, skip card action conversation handling')
			return
		}

		const principalKey = resolveConversationPrincipalKey({
			integrationId: ctx.integration.id,
			senderOpenId: action.userId
		})
		const historicalBinding =
			(action.chatId ? await this.getLatestConversationBindingByChatId(ctx.integration.id, action.chatId) : null) ??
			(principalKey ? await this.getLatestConversationBindingByPrincipalKey(principalKey) : null) ??
			(await this.getLatestConversationBindingByUserId(action.userId, ctx.integration.id))
		const boundXpertId = await this.getBoundXpertId(ctx.integration.id)
		const configuredXpertId = boundXpertId ?? normalizeConversationUserKey(ctx.integration.options?.xpertId)
		if (this.shouldPurgeBindingForConfiguredXpert(historicalBinding, ctx.integration.id, configuredXpertId)) {
			await this.purgeBindingSession(historicalBinding, historicalBinding?.scopeKey ?? legacyConversationUserKey, legacyConversationUserKey)
		}
		const latestBinding = this.shouldPreferHistoricalBinding(
			historicalBinding,
			ctx.integration.id,
			configuredXpertId
		)
			? historicalBinding
			: null
		const xpertId = latestBinding?.xpertId ?? configuredXpertId
		if (!xpertId) {
			this.logger.warn('No xpertId configured for integration')
			return
		}

		const boundTriggerBinding = await this.getBoundTriggerBinding(ctx.integration.id)
		if (boundTriggerBinding) {
			const larkTriggerStrategy = await this.getLarkTriggerStrategy()
			const matchesBoundTrigger = larkTriggerStrategy.matchesInboundMessage({
				binding: boundTriggerBinding,
				integrationId: ctx.integration.id,
				chatType: latestBinding?.chatType,
				chatId: action.chatId,
				senderOpenId: action.userId,
				botMentioned: true
			})
			if (!matchesBoundTrigger) {
				const rejectedScopeKey =
					latestBinding?.scopeKey ??
					resolveConversationScopeKey({
						integrationId: ctx.integration.id,
						chatType: latestBinding?.chatType,
						chatId: action.chatId,
						senderOpenId: action.userId
					}) ??
					legacyConversationUserKey
				await this.purgeDisallowedTriggerBindings({
					integrationId: ctx.integration.id,
					scopeBinding: latestBinding,
					fallbackBinding: historicalBinding,
					scopeKey: rejectedScopeKey,
					legacyConversationUserKey
				})
				this.logger.debug(
					`[lark-dispatch] card action blocked by trigger scope integration=${ctx.integration.id} chat=${action.chatId ?? 'n/a'} sender=${action.userId ?? 'n/a'}`
				)
				return
			}
		}

		const scopeKey =
			latestBinding?.scopeKey ??
			resolveConversationScopeKey({
				integrationId: ctx.integration.id,
				chatType: latestBinding?.chatType,
				chatId: action.chatId,
				senderOpenId: action.userId
			}) ??
			legacyConversationUserKey
		if (latestBinding?.conversationId) {
			await this.cacheConversation(scopeKey, latestBinding.xpertId, latestBinding.conversationId, legacyConversationUserKey)
		}

		await this.onAction(
			resolveLarkCardActionValue(action.value),
			{
				tenant: ctx.integration.tenant,
				organizationId: ctx.organizationId,
				integrationId: ctx.integration.id,
				preferLanguage: ctx.integration.options?.preferLanguage,
				userId: user.id,
				senderOpenId: action.userId,
				principalKey: principalKey ?? undefined,
				scopeKey,
				legacyConversationUserKey,
				chatId: action.chatId,
				chatType: latestBinding?.chatType
			} as ChatLarkContext,
			scopeKey,
			xpertId,
			action.messageId,
			legacyConversationUserKey
		)
	}

	async onModuleDestroy() {
		for (const queue of this.scopeQueues.values()) {
			await queue.close()
		}
	}
}
