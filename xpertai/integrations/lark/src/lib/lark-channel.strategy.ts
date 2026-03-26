import * as lark from '@larksuiteoapi/node-sdk'
import type { IIntegration, IUser } from '@metad/contracts'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { isEqual } from 'date-fns'
import { NextFunction, Request, Response } from 'express'
import {
	CHAT_CHANNEL_TEXT_LIMITS,
	ChatChannel,
	getErrorMessage,
	IChatChannel,
	INTEGRATION_PERMISSION_SERVICE_TOKEN,
	IntegrationPermissionService,
	type PluginContext,
	TChatCardAction,
	TChatChannelCapabilities,
	TChatChannelMeta,
	TChatContext,
	TChatEventContext,
	TChatEventHandlers,
	TChatInboundMessage,
	TChatSendResult,
	USER_PERMISSION_SERVICE_TOKEN,
	UserPermissionService,
} from '@xpert-ai/plugin-sdk'
import { type Cache } from 'cache-manager'
import { extractLarkSemanticMessage, unwrapLarkEventPayload } from './lark-message-semantics.js'
import { LarkCapabilityService } from './lark-capability.service.js'
import { resolveLarkLongConnectionAppKey } from './lark-long-connection.utils.js'
import { createLarkHttpInstance, getLarkWebSocketAgent } from './lark-network.js'
import { RolesEnum } from './contracts-compat.js'
import { LARK_PLUGIN_CONTEXT } from './tokens.js'
import { stringifyErrorAsJson, toLarkApiErrorMessage } from './utils.js'
import {
	ChatLarkContext,
	isLarkCardActionValue,
	LarkCardActionValue,
	LarkMessage,
	TLarkConnectionMode,
	TIntegrationLarkOptions,
	TLarkUserProvisionOptions
} from './types.js'

type LarkClientCacheEntry = {
	integration: IIntegration<TIntegrationLarkOptions>
	client: lark.Client
	bot:
		| {
				app_name: string
				avatar_url: string
				ip_white_list: string[]
				open_id: string
		  }
		| null
}

type LarkRecipient = {
	type: 'chat_id' | 'open_id' | 'user_id' | 'union_id' | 'email'
	id: string
}

@Injectable()
@ChatChannel('lark')
export class LarkChannelStrategy implements IChatChannel<TIntegrationLarkOptions> {
	private readonly logger = new Logger(LarkChannelStrategy.name)

	@Inject(CACHE_MANAGER)
	private readonly cacheManager: Cache

	private _integrationPermissionService: IntegrationPermissionService
	private _userPermissionService: UserPermissionService

	constructor(
		@Inject(LARK_PLUGIN_CONTEXT)
		private readonly pluginContext: PluginContext,
		private readonly capabilityService: LarkCapabilityService
	) {}

	private get integrationPermissionService(): IntegrationPermissionService {
		if (!this._integrationPermissionService) {
			this._integrationPermissionService = this.pluginContext.resolve(
				INTEGRATION_PERMISSION_SERVICE_TOKEN
			)
		}
		return this._integrationPermissionService
	}

	private get userPermissionService(): UserPermissionService {
		if (!this._userPermissionService) {
			this._userPermissionService = this.pluginContext.resolve(USER_PERMISSION_SERVICE_TOKEN)
		}
		return this._userPermissionService
	}

	/**
	 * Cache of Lark clients by integration ID
	 */
	private clients = new Map<string, LarkClientCacheEntry>()

	meta: TChatChannelMeta = {
		type: 'lark',
		label: '飞书 / Lark',
		description: '通过飞书平台进行双向消息通信',
		icon: 'lark',
		configSchema: {
			type: 'object',
			properties: {
				appId: { type: 'string', description: 'App ID' },
				appSecret: { type: 'string', description: 'App Secret' },
				verificationToken: { type: 'string', description: 'Verification Token' },
				encryptKey: { type: 'string', description: 'Encrypt Key' },
				isLark: { type: 'boolean', description: '是否为国际版 Lark' }
			},
			required: ['appId', 'appSecret']
		}
	}

	capabilities: TChatChannelCapabilities = {
		markdown: true,
		card: true,
		cardAction: true,
		updateMessage: true,
		mention: true,
		group: true,
		thread: false,
		media: true,
		textChunkLimit: CHAT_CHANNEL_TEXT_LIMITS['lark'],
		streamingUpdate: true
	}

	private getBotInfoUrl(isLark?: boolean): string {
		return isLark
			? 'https://open.larksuite.com/open-apis/bot/v3/info'
			: 'https://open.feishu.cn/open-apis/bot/v3/info'
	}

	// ==================== Inbound (Receive Messages) ====================

	createEventDispatcher(
		ctx: TChatEventContext<TIntegrationLarkOptions>,
		handlers: TChatEventHandlers,
		options?: {
			includeCardAction?: boolean
		}
	): lark.EventDispatcher {
		const { integration } = ctx
		const eventHandlers = handlers ?? {}
		const includeCardAction = options?.includeCardAction ?? true

		const dispatcher = new lark.EventDispatcher({
			verificationToken: integration.options.verificationToken,
			encryptKey: integration.options.encryptKey,
			loggerLevel: lark.LoggerLevel.debug
		})

		dispatcher.register({
			'im.message.receive_v1': async (data) => {
				this.logger.verbose('im.message.receive_v1:', data)

				const message = this.parseInboundMessage(data, ctx)
				if (!message) {
					return true
				}

				// Lark webhook callbacks should return within 3s, so we ack first and process in background.
				this.runBackgroundEventHandler('message', async () => {
					if (message.chatType === 'group') {
						const botInfo = await this.getBotInfo(integration)
						if (this.isBotMentioned(message, botInfo.id)) {
							await eventHandlers.onMention?.(message, ctx)
						}
						return
					}
					await eventHandlers.onMessage?.(message, ctx)
				})

				return true
			}
		})

		if (includeCardAction) {
			dispatcher.register({
				'card.action.trigger': async (data: any) => {
					this.logger.verbose('card.action.trigger:', data)

					const action = this.parseCardAction(data, ctx)
					if (action) {
						// Lark webhook callbacks should return within 3s, so we ack first and process in background.
						this.runBackgroundEventHandler('card action', async () => {
							await eventHandlers.onCardAction?.(action, ctx)
						})
					}

					return true
				}
			})
		}

		return dispatcher
	}

	createEventHandler(
		ctx: TChatEventContext<TIntegrationLarkOptions>,
		handlers: TChatEventHandlers
	): (req: Request, res: Response, next?: NextFunction) => Promise<void> {
		return lark.adaptExpress(this.createEventDispatcher(ctx, handlers), { autoChallenge: true })
	}

	private runBackgroundEventHandler(eventName: string, handler: () => Promise<void>): void {
		void handler().catch((error) => {
			this.logger.error(`Error handling ${eventName}:`, error)
		})
	}

	parseInboundMessage(event: any, _ctx: TChatEventContext<TIntegrationLarkOptions>): TChatInboundMessage | null {
		const payload = unwrapLarkEventPayload(event)
		const { message, sender } = payload ?? {}
		if (!message) {
			return null
		}

		const semanticMessage = extractLarkSemanticMessage(event)
		let content = semanticMessage?.displayText || ''
		let contentType: TChatInboundMessage['contentType'] = 'text'

		if (!content) {
			try {
				const parsed = JSON.parse(message.content)
				content = parsed.text || ''
			} catch {
				content = message.content
			}
		}

		switch (message.message_type) {
			case 'text':
				contentType = 'text'
				break
			case 'image':
				contentType = 'image'
				break
			case 'file':
				contentType = 'file'
				break
			case 'audio':
				contentType = 'voice'
				break
		}

		return {
			messageId: message.message_id,
			chatId: message.chat_id,
			chatType: message.chat_type === 'p2p' ? 'private' : 'group',
			senderId: sender?.sender_id?.open_id,
			senderName: (sender as any)?.name,
			content,
			contentType,
			mentions: semanticMessage?.mentions
				?.filter((mention) => mention.idType === 'open_id' && !!mention.id)
				.map((mention) => ({
					id: mention.id as string,
					name: mention.name ?? undefined
				})),
			timestamp: parseInt(message.create_time),
			raw: event,
			semanticMessage
		} as TChatInboundMessage
	}

	parseCardAction(
		event: any,
		_ctx: TChatEventContext<TIntegrationLarkOptions>
	): TChatCardAction<LarkCardActionValue> | null {
		const payload = unwrapLarkEventPayload(event) ?? event?.event ?? event
		const { action, context, operator } = payload ?? {}
		if (!action || !context) {
			return null
		}
		const value = action.value ?? action.option
		if (!isLarkCardActionValue(value)) {
			this.logger.warn(`Unsupported Lark card action value: ${JSON.stringify(value)}`)
			return null
		}

		return {
			type: action.tag,
			value,
			messageId: context.open_message_id,
			chatId: context.open_chat_id,
			userId: operator?.open_id,
			raw: event
		}
	}

	isBotMentioned(message: TChatInboundMessage, botId: string): boolean {
		return message.mentions?.some((m) => m.id === botId) ?? false
	}

	// ==================== Outbound (Send Messages) ====================

	async sendText(ctx: TChatContext, content: string): Promise<TChatSendResult> {
		try {
			const client = await this.getOrCreateLarkClientById(ctx.integration.id)
			const { receiveIdType, receiveId } = this.resolveReceiveId(ctx)

			const result = await client.im.message.create({
				params: { receive_id_type: receiveIdType },
				data: {
					receive_id: receiveId,
					msg_type: 'text',
					content: JSON.stringify({ text: content })
				}
			})
			return { success: true, messageId: result.data?.message_id }
		} catch (error: any) {
			this.logger.error('Failed to send text message:', error)
			return { success: false, error: toLarkApiErrorMessage(error) }
		}
	}

	async sendMarkdown(ctx: TChatContext, content: string): Promise<TChatSendResult> {
		try {
			const client = await this.getOrCreateLarkClientById(ctx.integration.id)
			const { receiveIdType, receiveId } = this.resolveReceiveId(ctx)

			const result = await client.im.message.create({
				params: { receive_id_type: receiveIdType },
				data: {
					receive_id: receiveId,
					msg_type: 'interactive',
					content: JSON.stringify({
						elements: [{ tag: 'markdown', content }]
					})
				}
			})
			return { success: true, messageId: result.data?.message_id }
		} catch (error: any) {
			this.logger.error('Failed to send markdown message:', error)
			return { success: false, error: toLarkApiErrorMessage(error) }
		}
	}

	async sendCard(ctx: TChatContext, card: any): Promise<TChatSendResult> {
		try {
			await this.assertCardPayloadSupported(ctx.integration as IIntegration<TIntegrationLarkOptions>, card, 'sendCard')
			const client = await this.getOrCreateLarkClientById(ctx.integration.id)
			const { receiveIdType, receiveId } = this.resolveReceiveId(ctx)

			const result = await client.im.message.create({
				params: { receive_id_type: receiveIdType },
				data: {
					receive_id: receiveId,
					msg_type: 'interactive',
					content: JSON.stringify(card)
				}
			})
			return { success: true, messageId: result.data?.message_id }
		} catch (error: any) {
			this.logger.error('Failed to send card message:', error)
			return { success: false, error: toLarkApiErrorMessage(error) }
		}
	}

	async sendMedia(
		ctx: TChatContext,
		media: {
			type: 'image' | 'file' | 'audio' | 'video'
			url?: string
			content?: Buffer
			filename?: string
		}
	): Promise<TChatSendResult> {
		try {
			const client = await this.getOrCreateLarkClientById(ctx.integration.id)

			if (media.type === 'image' && media.url) {
				const result = await client.im.message.create({
					params: { receive_id_type: 'chat_id' },
					data: {
						receive_id: ctx.chatId,
						msg_type: 'image',
						content: JSON.stringify({ image_key: media.url })
					}
				})
				return { success: true, messageId: result.data?.message_id }
			}

			return { success: false, error: 'Media type not fully supported yet' }
		} catch (error: any) {
			this.logger.error('Failed to send media message:', error)
			return { success: false, error: toLarkApiErrorMessage(error) }
		}
	}

	async updateMessage(ctx: TChatContext, messageId: string, content: string | any): Promise<TChatSendResult> {
		try {
			if (typeof content !== 'string') {
				await this.assertCardPayloadSupported(
					ctx.integration as IIntegration<TIntegrationLarkOptions>,
					content,
					'updateMessage'
				)
			}
			const contentStr = typeof content === 'string' ? JSON.stringify({ text: content }) : JSON.stringify(content)
			const result = await this.patchMessage(ctx.integration.id, {
				path: { message_id: messageId },
				data: { content: contentStr }
			})
			if (!result) {
				return { success: false, error: 'Failed to update message' }
			}
			return { success: true, messageId }
		} catch (error: any) {
			this.logger.error('Failed to update message:', error)
			return { success: false, error: toLarkApiErrorMessage(error) }
		}
	}

	// ==================== Core Client Management ====================

	createClient(integration: IIntegration<TIntegrationLarkOptions>): lark.Client {
		return this.createClientFromConfig(integration.options)
	}

	createClientFromConfig(config: TIntegrationLarkOptions): lark.Client {
		return new lark.Client({
			appId: config.appId,
			appSecret: config.appSecret,
			appType: lark.AppType.SelfBuild,
			domain: config.isLark ? lark.Domain.Lark : lark.Domain.Feishu,
			httpInstance: createLarkHttpInstance('https:'),
			loggerLevel: lark.LoggerLevel.debug
		})
	}

	createWSClientFromConfig(
		config: TIntegrationLarkOptions,
		options?: { logger?: { error: (...msg: any[]) => void; warn: (...msg: any[]) => void; info: (...msg: any[]) => void; debug: (...msg: any[]) => void; trace: (...msg: any[]) => void } }
	): lark.WSClient {
		return new lark.WSClient({
			appId: config.appId,
			appSecret: config.appSecret,
			domain: config.isLark ? lark.Domain.Lark : lark.Domain.Feishu,
			httpInstance: createLarkHttpInstance('https:'),
			agent: getLarkWebSocketAgent('wss:'),
			loggerLevel: lark.LoggerLevel.debug,
			logger: options?.logger,
			autoReconnect: true
		})
	}

	getOrCreateLarkClient(integration: IIntegration<TIntegrationLarkOptions>): LarkClientCacheEntry {
		let item = this.clients.get(integration.id)
		if (!item || !isEqual(item.integration.updatedAt, integration.updatedAt)) {
			const client = this.createClient(integration)
			item = {
				integration,
				client,
				bot: null
			}
			this.clients.set(integration.id, item)
			this.fetchBotInfo(client, integration.options?.isLark)
				.then((bot) => (item.bot = bot))
				.catch((error) => {
					this.logger.warn(
						`Failed to preload Lark bot info for integration "${integration.id}": ${toLarkApiErrorMessage(error)}`
					)
				})
		}
		return item
	}

	async getOrCreateLarkClientById(id: string): Promise<lark.Client> {
		const integration = await this.readIntegrationById(id)
		if (!integration) {
			throw new Error(`Integration ${id} not found`)
		}
		return this.getOrCreateLarkClient(integration).client
	}

	async readIntegrationById(id: string): Promise<IIntegration<TIntegrationLarkOptions> | null> {
		return this.integrationPermissionService.read<IIntegration<TIntegrationLarkOptions>>(id, {
			relations: ['tenant']
		})
	}

	getClient(id: string): lark.Client | undefined {
		return this.clients.get(id)?.client
	}

	private async fetchBotInfo(client: lark.Client, isLark?: boolean) {
		try {
			const res = await client.request({
				method: 'GET',
				url: this.getBotInfoUrl(isLark),
				data: {},
				params: {}
			})
			return res.bot
		} catch (error) {
			throw new Error(toLarkApiErrorMessage(error))
		}
	}

	async test(integration: IIntegration<TIntegrationLarkOptions>) {
		const client = this.createClient(integration)
		return await this.fetchBotInfo(client, integration.options?.isLark)
	}

	// ==================== User Management ====================

	async getUser(
		client: lark.Client,
		tenantId: string,
		unionId: string,
		userProvision?: TLarkUserProvisionOptions,
		organizationId?: string
	): Promise<IUser | null> {
		if (!tenantId || !unionId) {
			return null
		}

		const larkUserCacheKey = this.getUserByUnionIdCacheKey(tenantId, unionId)
		let user = await this.getUserByCacheOrDatabase(larkUserCacheKey, {
			tenantId,
			thirdPartyId: unionId
		})
		if (user) {
			await this.setUserByIdCache(tenantId, user)
			return user
		}

		if (!this.isAutoProvisionUserEnabled(userProvision)) {
			return null
		}

		const larkUser = await this.safeGetLarkUser(client, unionId)
		try {
			const provisionInput = {
				tenantId,
				organizationId,
				thirdPartyId: unionId,
				profile: {
					username: larkUser?.data?.user?.user_id,
					email: larkUser?.data?.user?.email,
					mobile: larkUser?.data?.user?.mobile,
					imageUrl: larkUser?.data?.user?.avatar?.avatar_240,
					firstName: larkUser?.data?.user?.name
				},
				defaults: {
					roleName: this.resolveAutoProvisionRoleName(userProvision)
				}
			} as any

			user = await this.userPermissionService.provisionByThirdPartyIdentity<IUser>(
				provisionInput
			)
		} catch (error) {
			this.logger.warn(
				`Failed to auto provision user for tenant "${tenantId}" and unionId "${unionId}": ${getErrorMessage(error)}`
			)
			return null
		}

		if (user) {
			await this.cacheManager.set(larkUserCacheKey, user)
			await this.setUserByIdCache(tenantId, user)
		}

		return user
	}

	async getUserById(tenantId: string, userId: string): Promise<IUser | null> {
		if (!tenantId || !userId) {
			return null
		}

		return this.getUserByCacheOrDatabase(this.getUserByIdCacheKey(tenantId, userId), {
			tenantId,
			id: userId
		})
	}

	async resolveUserByRecipient(integrationId: string, recipient: LarkRecipient): Promise<IUser | null> {
		const recipientType = recipient?.type
		const recipientId = recipient?.id?.trim()
		if (!integrationId || !recipientType || !recipientId) {
			return null
		}
		if (recipientType === 'chat_id') {
			return null
		}

		const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationLarkOptions>>(
			integrationId,
			{ relations: ['tenant'] }
		)
		if (!integration?.tenantId) {
			this.logger.warn(
				`Failed to resolve user by recipient "${recipientType}:${recipientId}": integration "${integrationId}" not found or tenantId missing`
			)
			return null
		}

		const client = this.getOrCreateLarkClient(integration).client
		let unionId: string | null = null
		try {
			switch (recipientType) {
				case 'union_id': {
					unionId = recipientId
					break
				}
				case 'open_id':
				case 'user_id': {
					const response = await client.contact.v3.user.get({
						params: {
							user_id_type: recipientType
						},
						path: {
							user_id: recipientId
						}
					})
					unionId = response?.data?.user?.union_id ?? null
					break
				}
				case 'email': {
					const response = await client.contact.v3.user.batchGetId({
						params: {
							user_id_type: 'union_id'
						},
						data: {
							emails: [recipientId]
						}
					})
					unionId = response?.data?.user_list?.[0]?.user_id ?? null
					break
				}
			}
		} catch (error) {
			this.logger.warn(
				`Failed to resolve recipient "${recipientType}:${recipientId}" from Lark integration "${integrationId}": ${getErrorMessage(error)}`
			)
			return null
		}

		if (!unionId) {
			this.logger.warn(
				`Skip recipient binding for "${recipientType}:${recipientId}" on integration "${integrationId}": union_id not found`
			)
			return null
		}

		return this.getUser(
			client,
			integration.tenantId,
			unionId,
			integration.options?.userProvision,
			integration.organizationId
		)
	}

	async resolveUserNameByOpenId(integrationId: string, openId: string): Promise<string | null> {
		const normalizedOpenId = openId?.trim()
		if (!integrationId || !normalizedOpenId) {
			return null
		}

		const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationLarkOptions>>(integrationId)
		if (!integration) {
			return null
		}

		try {
			const client = this.getOrCreateLarkClient(integration).client
			const response = await client.contact.v3.user.get({
				params: {
					user_id_type: 'open_id'
				},
				path: {
					user_id: normalizedOpenId
				}
			})
			const name = response?.data?.user?.name?.trim()
			return name || null
		} catch (error) {
			this.logger.warn(
				`Failed to resolve Lark user name for open_id "${normalizedOpenId}" on integration "${integrationId}": ${getErrorMessage(error)}`
			)
			return null
		}
	}

	private getUserByUnionIdCacheKey(tenantId: string, unionId: string): string {
		return `lark:user:union:${tenantId}:${unionId}`
	}

	private getUserByIdCacheKey(tenantId: string, userId: string): string {
		return `lark:user:id:${tenantId}:${userId}`
	}

	private async setUserByIdCache(tenantId: string, user: IUser): Promise<void> {
		if (!user?.id) {
			return
		}
		await this.cacheManager.set(this.getUserByIdCacheKey(tenantId, user.id), user)
	}

	private async getUserByCacheOrDatabase(
		cacheKey: string,
		criteria: Record<string, any>
	): Promise<IUser | null> {
		const cached = await this.cacheManager.get<IUser>(cacheKey)
		if (cached) {
			return cached
		}

		const user = await this.userPermissionService.read<IUser>(criteria)
		if (user) {
			await this.cacheManager.set(cacheKey, user)
		}

		return user
	}

	private async safeGetLarkUser(client: lark.Client, unionId: string) {
		try {
			return await client.contact.user.get({
				params: { user_id_type: 'union_id' },
				path: { user_id: unionId }
			})
		} catch {
			return null
		}
	}

	private isAutoProvisionUserEnabled(userProvision?: TLarkUserProvisionOptions): boolean {
		return userProvision?.autoProvision ?? false
	}

	private resolveAutoProvisionRoleName(userProvision?: TLarkUserProvisionOptions): string {
		return userProvision?.roleName || RolesEnum.EMPLOYEE
	}

	// ==================== Legacy Message Helpers ====================

	async createMessage(integrationId: string, message: LarkMessage) {
		try {
			if (message?.data?.msg_type === 'interactive') {
				const parsed = this.parseJson(message.data.content)
				await this.assertCardPayloadSupportedByIntegrationId(integrationId, parsed, 'createMessage')
				this.logger.debug(
					`[lark-outbound] interactive create integration=${integrationId} payload=${this.toLogString(parsed)}`
				)
			}
			const client = await this.getOrCreateLarkClientById(integrationId)
			return await client.im.message.create(message)
		} catch (err: any) {
			this.logLarkRequestFailure('createMessage', err, {
				integrationId,
				messageType: message?.data?.msg_type,
				payload: message?.data
			})
			throw this.wrapLarkRequestError('createMessage', err)
		}
	}

	async patchMessage(
		integrationId: string,
		payload?: {
			data: { content: string }
			path: { message_id: string }
		}
	) {
		if (!payload) {
			return null
		}
		try {
			const parsed = this.parseJson(payload.data?.content)
			if (parsed && parsed.text === undefined) {
				await this.assertCardPayloadSupportedByIntegrationId(integrationId, parsed, 'patchMessage')
				this.logger.debug(
					`[lark-outbound] interactive patch integration=${integrationId} message=${payload.path?.message_id} payload=${this.toLogString(parsed)}`
				)
			}
			const client = await this.getOrCreateLarkClientById(integrationId)
			return await client.im.message.patch(payload)
		} catch (err: any) {
			this.logLarkRequestFailure('patchMessage', err, {
				integrationId,
				messageId: payload.path?.message_id,
				payload: payload.data
			})
			throw this.wrapLarkRequestError('patchMessage', err)
		}
	}

	async deleteMessage(integrationId: string, messageId: string) {
		if (!messageId) {
			return null
		}
		try {
			const client = await this.getOrCreateLarkClientById(integrationId)
			return await (client.im.message as any).delete({
				path: { message_id: messageId }
			})
		} catch (err: any) {
			this.logger.error(err)
			return null
		}
	}

	async errorMessage({ integrationId, chatId }: { integrationId: string; chatId?: string }, err: Error) {
		await this.createMessage(integrationId, {
			params: { receive_id_type: 'chat_id' },
			data: {
				receive_id: chatId,
				content: JSON.stringify({ text: `Error: ${err.message}` }),
				msg_type: 'text'
			}
		} as LarkMessage)
	}

	async textMessage(context: { integrationId: string; chatId: string; messageId?: string }, content: string) {
		const { chatId, messageId } = context
		if (messageId) {
			return await this.patchMessage(context.integrationId, {
				data: { content: JSON.stringify({ text: content }) },
				path: { message_id: messageId }
			})
		}
		return await this.createMessage(context.integrationId, {
			params: { receive_id_type: 'chat_id' },
			data: {
				receive_id: chatId,
				content: JSON.stringify({ text: content }),
				msg_type: 'text'
			}
		} as LarkMessage)
	}

	async interactiveMessage(context: ChatLarkContext, data: any) {
		await this.assertCardPayloadSupportedByIntegrationId(context.integrationId, data, 'interactiveMessage')
		return await this.createMessage(context.integrationId, {
			params: { receive_id_type: 'chat_id' },
			data: {
				receive_id: context.chatId,
				content: JSON.stringify(data),
				msg_type: 'interactive'
			}
		} as LarkMessage)
	}

	async markdownMessage(context: ChatLarkContext, content: string) {
		await this.createMessage(context.integrationId, {
			params: { receive_id_type: 'chat_id' },
			data: {
				receive_id: context.chatId,
				content: JSON.stringify({
					elements: [{ tag: 'markdown', content }]
				}),
				msg_type: 'interactive'
			}
		} as LarkMessage)
	}

	async patchInteractiveMessage(integrationId: string, messageId: string, data: any) {
		await this.assertCardPayloadSupportedByIntegrationId(integrationId, data, 'patchInteractiveMessage')
		return await this.patchMessage(integrationId, {
			data: { content: JSON.stringify(data) },
			path: { message_id: messageId }
		})
	}

	// ==================== Utility ====================

	private resolveReceiveId(ctx: TChatContext): {
		receiveIdType: 'chat_id' | 'open_id' | 'user_id'
		receiveId: string
	} {
		if (ctx.chatId) {
			return { receiveIdType: 'chat_id', receiveId: ctx.chatId }
		}
		if (ctx.userId) {
			return { receiveIdType: 'open_id', receiveId: ctx.userId }
		}
		this.logger.warn('No chatId or userId provided in context')
		return { receiveIdType: 'chat_id', receiveId: '' }
	}

	async getBotInfo(integration: IIntegration<TIntegrationLarkOptions>): Promise<{
		id: string
		name?: string
		avatar?: string
	}> {
		const item = this.getOrCreateLarkClient(integration)
		if (!item.bot) {
			item.bot = await this.fetchBotInfo(item.client, integration.options?.isLark)
		}
		return {
			id: item.bot?.open_id,
			name: item.bot?.app_name,
			avatar: item.bot?.avatar_url
		}
	}

	resolveConnectionMode(
		integration: Pick<IIntegration<TIntegrationLarkOptions>, 'options'> | TIntegrationLarkOptions
	): TLarkConnectionMode {
		return this.capabilityService.resolveConnectionMode(this.extractOptions(integration))
	}

	resolveLongConnectionAppKey(
		integration: Pick<IIntegration<TIntegrationLarkOptions>, 'options'> | TIntegrationLarkOptions
	): string {
		return resolveLarkLongConnectionAppKey(this.extractOptions(integration))
	}

	getCapabilities(integration: Pick<IIntegration<TIntegrationLarkOptions>, 'options'> | TIntegrationLarkOptions) {
		return this.capabilityService.getCapabilities(this.extractOptions(integration))
	}

	async assertCardPayloadSupportedByIntegrationId(
		integrationId: string,
		payload: unknown,
		operation = 'send Lark card'
	): Promise<void> {
		const integration = await this.readIntegrationById(integrationId)
		if (!integration) {
			throw new Error(`Integration ${integrationId} not found`)
		}
		await this.assertCardPayloadSupported(integration, payload, operation)
	}

	async assertCardPayloadSupported(
		integration: Pick<IIntegration<TIntegrationLarkOptions>, 'options' | 'id'>,
		payload: unknown,
		operation = 'send Lark card'
	): Promise<void> {
		this.capabilityService.assertCardPayloadSupported(integration.options, payload, operation)
	}

	async validateConfig(config: TIntegrationLarkOptions): Promise<{
		valid: boolean
		errors?: string[]
	}> {
		const errors: string[] = []

		if (!config.appId) {
			errors.push('App ID is required')
		}

		if (!config.appSecret) {
			errors.push('App Secret is required')
		}

		if (errors.length > 0) {
			return { valid: false, errors }
		}

		try {
			const client = this.createClientFromConfig(config)
			const res = await client.request({
				method: 'GET',
				url: this.getBotInfoUrl(config?.isLark),
				data: {},
				params: {}
			})
			if (!res.bot?.open_id) {
				errors.push('Failed to get bot info from Lark API')
			}
		} catch (error: any) {
			errors.push(`Lark API connection failed: ${toLarkApiErrorMessage(error)}`)
		}

		return {
			valid: errors.length === 0,
			errors: errors.length > 0 ? errors : undefined
		}
	}

	async testConnection(integration: IIntegration<TIntegrationLarkOptions>): Promise<{
		success: boolean
		message?: string
	}> {
		try {
			const botInfo = await this.getBotInfo(integration)
			if (botInfo.id) {
				return {
					success: true,
					message: `Connected to bot: ${botInfo.name || botInfo.id}`
				}
			}
			return {
				success: false,
				message: 'Failed to get bot info'
			}
		} catch (error: any) {
			return {
				success: false,
				message: toLarkApiErrorMessage(error)
			}
		}
	}

	private parseJson(value: string | undefined): any {
		if (!value) {
			return null
		}

		try {
			return JSON.parse(value)
		} catch {
			return null
		}
	}

	private extractOptions(
		integration: Pick<IIntegration<TIntegrationLarkOptions>, 'options'> | TIntegrationLarkOptions
	): TIntegrationLarkOptions {
		return ('options' in integration ? integration.options : integration) as TIntegrationLarkOptions
	}

	private logLarkRequestFailure(
		operation: string,
		error: unknown,
		context?: Record<string, unknown>
	): void {
		const responseData = (error as any)?.response?.data
		const responseStatus = (error as any)?.response?.status
		const requestUrl = (error as any)?.config?.url
		const requestMethod = (error as any)?.config?.method
		const summary = toLarkApiErrorMessage(error)

		this.logger.error(
			`[lark-outbound] ${operation} failed: ${summary} | status=${responseStatus ?? 'unknown'} | method=${requestMethod ?? 'unknown'} | url=${requestUrl ?? 'unknown'}`
		)

		if (context) {
			this.logger.warn(`[lark-outbound] ${operation} context=${this.toLogString(context)}`)
		}

		if (responseData !== undefined) {
			this.logger.warn(`[lark-outbound] ${operation} response=${this.toLogString(responseData)}`)
			return
		}

		this.logger.warn(`[lark-outbound] ${operation} error=${this.toLogString(stringifyErrorAsJson(error))}`)
	}

	private wrapLarkRequestError(operation: string, error: unknown): Error {
		const wrapped = new Error(`Lark ${operation} failed: ${toLarkApiErrorMessage(error)}`)
		;(wrapped as any).cause = error
		return wrapped
	}

	private toLogString(value: unknown): string {
		const serialized = typeof value === 'string' ? value : stringifyErrorAsJson(value)
		return serialized.length > 4000 ? `${serialized.slice(0, 4000)}...(truncated)` : serialized
	}
}
