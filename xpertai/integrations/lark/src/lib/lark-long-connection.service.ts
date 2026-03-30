import * as lark from '@larksuiteoapi/node-sdk'
import axios from 'axios'
import { randomUUID } from 'crypto'
import { hostname } from 'os'
import type { IIntegration, IPagination, IUser } from '@metad/contracts'
import {
	INTEGRATION_PERMISSION_SERVICE_TOKEN,
	IntegrationPermissionService,
	RequestContext,
	runWithRequestContext,
	TChatEventContext,
	TChatEventHandlers,
	type PluginContext
} from '@xpert-ai/plugin-sdk'
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { LarkConversationService } from './conversation.service.js'
import { LarkConversationBindingSchemaService } from './lark-conversation-binding-schema.service.js'
import { LarkInboundIdentityService } from './lark-inbound-identity.service.js'
import {
	classifyLongConnectionError,
	getLarkLongConnectionLockKey,
	getLarkLongConnectionOwnerKey,
	getLarkLongConnectionStatusKey
} from './lark-long-connection.utils.js'
import { LarkChannelStrategy } from './lark-channel.strategy.js'
import { describeLarkProxy, getLarkAxiosRequestConfig, getLarkWebSocketAgent } from './lark-network.js'
import { LARK_PLUGIN_CONTEXT } from './tokens.js'
import {
	TIntegrationLarkOptions,
	TLarkConnectionProbeResult,
	TLarkLongConnectionState,
	TLarkRuntimeStatus
} from './types.js'
import { toLarkApiErrorMessage } from './utils.js'

type RedisLike = {
	set?: (...args: any[]) => Promise<any>
	get?: (key: string) => Promise<string | null>
	del?: (...keys: string[]) => Promise<any>
	sadd?: (key: string, ...members: string[]) => Promise<any>
	sAdd?: (key: string, members: string[] | string) => Promise<any>
	srem?: (key: string, ...members: string[]) => Promise<any>
	sRem?: (key: string, members: string[] | string) => Promise<any>
	smembers?: (key: string) => Promise<string[]>
	sMembers?: (key: string) => Promise<string[]>
	hset?: (key: string, ...args: string[]) => Promise<any>
	hSet?: (key: string, value: Record<string, string>) => Promise<any>
	hgetall?: (key: string) => Promise<Record<string, string>>
	hGetAll?: (key: string) => Promise<Record<string, string>>
	expire?: (key: string, seconds: number) => Promise<any>
	eval?: (...args: any[]) => Promise<any>
}

type LarkLongConnectionSession = {
	appKey: string
	primaryIntegrationId: string | null
	integrationIds: Set<string>
	options: TIntegrationLarkOptions
	state: TLarkLongConnectionState
	lockId?: string | null
	client?: lark.WSClient | null
	renewTimer?: NodeJS.Timeout | null
	retryTimer?: NodeJS.Timeout | null
	connectedAt?: number | null
	lastError?: string | null
	failureCount: number
	endpoint400Count: number
	nextReconnectAt?: number | null
	disabledReason?: string | null
}

const REDIS_CLIENT_TOKEN = 'REDIS_CLIENT'
const REGISTRY_KEY = 'lark:ws:registry'
const LOCK_TTL_MS = 45_000
const RENEW_INTERVAL_MS = 15_000
const DEFAULT_RETRY_MS = 5_000
const MAX_RETRY_MS = 30_000
const MAX_UNRECOVERABLE_FAILURES = 3
const MAX_ENDPOINT_400_FAILURES = 3
const INITIAL_CONNECT_TIMEOUT_MS = 8_000

@Injectable()
export class LarkLongConnectionService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(LarkLongConnectionService.name)
	private readonly instanceId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`
	private readonly sessions = new Map<string, LarkLongConnectionSession>()
	private _integrationPermissionService: IntegrationPermissionService
	private _redis: RedisLike | null | undefined

	constructor(
		private readonly larkChannel: LarkChannelStrategy,
		private readonly conversation: LarkConversationService,
		private readonly conversationBindingSchemaService: LarkConversationBindingSchemaService,
		private readonly inboundIdentityService: LarkInboundIdentityService,
		@Inject(LARK_PLUGIN_CONTEXT)
		private readonly pluginContext: PluginContext
	) {}

	private get integrationPermissionService(): IntegrationPermissionService {
		if (!this._integrationPermissionService) {
			this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
		}
		return this._integrationPermissionService
	}

	private get redis(): RedisLike | null {
		if (this._redis === undefined) {
			try {
				this._redis = this.pluginContext.resolve(REDIS_CLIENT_TOKEN) as RedisLike
			} catch {
				this._redis = null
			}
		}
		return this._redis
	}

	async onModuleInit(): Promise<void> {
		await this.conversationBindingSchemaService.ensureSchema()
		const integrationIds = await this.loadBootstrapIntegrationIds()
		await Promise.allSettled(integrationIds.map((integrationId) => this.connect(integrationId)))
	}

	async onModuleDestroy(): Promise<void> {
		await Promise.allSettled([...this.sessions.values()].map((session) => this.stopSession(session, true)))
	}

	async connect(integrationId: string): Promise<TLarkRuntimeStatus> {
		const integration = await this.safeReadIntegration(integrationId)
		if (!integration) {
			await this.dropMissingIntegration(integrationId)
			return this.buildDetachedStatus(integrationId, 'webhook')
		}
		if (this.larkChannel.resolveConnectionMode(integration) !== 'long_connection') {
			await this.unregisterIntegration(integrationId)
			return this.buildDetachedStatus(integrationId, 'webhook')
		}

		await this.registerIntegration(integrationId)
		const session = this.ensureSession(integration)
		await this.synchronizeSessionIntegrations(session, integrationId)

		if (session.state === 'unhealthy') {
			return this.buildStatus(session, integration.id)
		}

		if (session.state === 'connected' && session.client) {
			return this.buildStatus(session, integration.id)
		}

		await this.startSession(session)
		return this.buildStatus(session, integration.id)
	}

	async reconnect(integrationId: string): Promise<TLarkRuntimeStatus> {
		const integration = await this.safeReadIntegration(integrationId)
		if (!integration) {
			await this.dropMissingIntegration(integrationId)
			return this.buildDetachedStatus(integrationId, 'webhook')
		}
		const session = this.ensureSession(integration)
		await this.synchronizeSessionIntegrations(session, integrationId)
		session.failureCount = 0
		session.endpoint400Count = 0
		session.disabledReason = null
		session.lastError = null
		session.nextReconnectAt = null
		session.state = 'idle'
		await this.writeStatus(session)
		await this.stopSession(session, true)
		await this.startSession(session)
		return this.buildStatus(session, integrationId)
	}

	async disconnect(integrationId: string): Promise<TLarkRuntimeStatus> {
		await this.unregisterIntegration(integrationId)

		const integration = await this.safeReadIntegration(integrationId)
		await this.removeIntegrationFromSessions(integrationId)
		await this.clearStatus(integrationId)
		return this.buildDetachedStatus(
			integrationId,
			integration ? this.larkChannel.resolveConnectionMode(integration) : 'webhook'
		)
	}

	async status(integrationId: string): Promise<TLarkRuntimeStatus> {
		const integration = await this.safeReadIntegration(integrationId)
		if (!integration) {
			await this.dropMissingIntegration(integrationId)
			return this.readStoredStatus(integrationId, 'webhook')
		}

		const connectionMode = this.larkChannel.resolveConnectionMode(integration)
		if (connectionMode !== 'long_connection') {
			await this.unregisterIntegration(integrationId)
			return this.buildDetachedStatus(integrationId, connectionMode)
		}

		const session = this.sessions.get(this.larkChannel.resolveLongConnectionAppKey(integration))
		if (!session) {
			void this.connect(integrationId).catch((error) => {
				this.logger.warn(`[lark-long] lazy connect failed integration=${integrationId}: ${toLarkApiErrorMessage(error)}`)
			})
			return this.readStoredStatus(integrationId, connectionMode)
		}

		this.refreshSessionState(session)
		await this.writeStatus(session)
		return this.buildStatus(session, integrationId)
	}

	async probeConfig(config: TIntegrationLarkOptions): Promise<TLarkConnectionProbeResult> {
		const checkedAt = Date.now()
		const baseUrl = config?.isLark ? 'https://open.larksuite.com' : 'https://open.feishu.cn'
		const axiosConfig = getLarkAxiosRequestConfig('https:')
		const proxyInfo = describeLarkProxy('https:')
		if (proxyInfo.note) {
			this.logger.log(`[lark-long] ${proxyInfo.note}`)
		}

		try {
			const endpointResponse = await axios.post(
				`${baseUrl}/callback/ws/endpoint`,
				{
					AppID: config.appId,
					AppSecret: config.appSecret
				},
				{
					...axiosConfig,
					headers: {
						locale: 'zh'
					},
					timeout: 15_000
				}
			)

			const endpointData = endpointResponse?.data
			const connectUrl = endpointData?.data?.URL
			if (endpointData?.code !== 0 || !connectUrl) {
				const error = new Error(endpointData?.msg || 'Failed to fetch long connection endpoint')
				const classification = classifyLongConnectionError(error)
				return {
					connectionMode: 'long_connection',
					connected: false,
					state: 'failed',
					checkedAt,
					endpointValidated: false,
					lastError: classification.reason,
					recoverable: classification.recoverable
				}
			}

			return await this.probeWebSocket(connectUrl, checkedAt)
		} catch (error) {
			const classification = classifyLongConnectionError(error)
			return {
				connectionMode: 'long_connection',
				connected: false,
				state: 'failed',
				checkedAt,
				endpointValidated: false,
				lastError: classification.reason,
				recoverable: classification.recoverable
			}
		}
	}

	private ensureSession(integration: IIntegration<TIntegrationLarkOptions>): LarkLongConnectionSession {
		const appKey = this.larkChannel.resolveLongConnectionAppKey(integration)
		const existing = this.sessions.get(appKey)
		if (existing) {
			existing.integrationIds.add(integration.id)
			if (
				!existing.primaryIntegrationId ||
				!existing.integrationIds.has(existing.primaryIntegrationId)
			) {
				existing.primaryIntegrationId = integration.id
			}
			existing.options = integration.options
			return existing
		}

		const created: LarkLongConnectionSession = {
			appKey,
			primaryIntegrationId: integration.id,
			integrationIds: new Set([integration.id]),
			options: integration.options,
			state: 'idle',
			failureCount: 0,
			endpoint400Count: 0,
			lastError: null,
			nextReconnectAt: null,
			disabledReason: null
		}
		this.sessions.set(appKey, created)
		return created
	}

	private async probeWebSocket(connectUrl: string, checkedAt: number): Promise<TLarkConnectionProbeResult> {
		const wsModule = (Function('return require')() as (name: string) => any)('ws')
		const WebSocketCtor = (wsModule.default ?? wsModule) as any
		const wsAgent = getLarkWebSocketAgent(connectUrl.startsWith('wss:') ? 'wss:' : 'ws:')

		return await new Promise<TLarkConnectionProbeResult>((resolve) => {
			let settled = false
			let ws: any = null

			const finish = (result: TLarkConnectionProbeResult) => {
				if (settled) {
					return
				}
				settled = true
				clearTimeout(timer)
				try {
					ws?.removeAllListeners?.()
				} catch {}
				try {
					if (ws?.readyState === WebSocketCtor.OPEN) {
						ws.close()
					} else {
						ws?.terminate?.()
					}
				} catch {}
				resolve(result)
			}

			const timer = setTimeout(() => {
				const classification = classifyLongConnectionError(
					new Error('Timed out waiting for long connection handshake')
				)
				finish({
					connectionMode: 'long_connection',
					connected: false,
					state: 'failed',
					checkedAt,
					endpointValidated: true,
					lastError: classification.reason,
					recoverable: classification.recoverable
				})
			}, 10_000)

			try {
				ws = new WebSocketCtor(connectUrl, wsAgent ? { agent: wsAgent } : undefined)
			} catch (error) {
				const classification = classifyLongConnectionError(error)
				finish({
					connectionMode: 'long_connection',
					connected: false,
					state: 'failed',
					checkedAt,
					endpointValidated: true,
					lastError: classification.reason,
					recoverable: classification.recoverable
				})
				return
			}

			ws.on('open', () => {
				finish({
					connectionMode: 'long_connection',
					connected: true,
					state: 'connected',
					checkedAt,
					endpointValidated: true,
					lastError: null,
					recoverable: true
				})
			})

			ws.on('error', (error: unknown) => {
				const classification = classifyLongConnectionError(error)
				finish({
					connectionMode: 'long_connection',
					connected: false,
					state: 'failed',
					checkedAt,
					endpointValidated: true,
					lastError: classification.reason,
					recoverable: classification.recoverable
				})
			})

			ws.on('close', () => {
				if (settled) {
					return
				}
				const classification = classifyLongConnectionError(
					new Error('Long connection probe closed before websocket became ready')
				)
				finish({
					connectionMode: 'long_connection',
					connected: false,
					state: 'failed',
					checkedAt,
					endpointValidated: true,
					lastError: classification.reason,
					recoverable: classification.recoverable
				})
			})
		})
	}

	private async startSession(session: LarkLongConnectionSession): Promise<void> {
		if (session.state === 'connecting' || session.state === 'connected' || session.state === 'unhealthy') {
			await this.writeStatus(session)
			return
		}

		await this.synchronizeSessionIntegrations(session)
		if (session.integrationIds.size === 0 || !session.primaryIntegrationId) {
			await this.stopSession(session, true)
			this.sessions.delete(session.appKey)
			return
		}

		const lockKey = getLarkLongConnectionLockKey(session.options)
		const ownerKey = getLarkLongConnectionOwnerKey(session.options)
		const lockId = await this.acquireLock(lockKey, LOCK_TTL_MS)
		if (!lockId) {
			session.state = 'retrying'
			session.lastError = 'Waiting for long-connection ownership from another instance'
			session.nextReconnectAt = Date.now() + DEFAULT_RETRY_MS
			await this.writeStatus(session)
			this.scheduleRetry(session, DEFAULT_RETRY_MS)
			return
		}

		session.lockId = lockId
		session.state = 'connecting'
		session.lastError = null
		session.nextReconnectAt = null
		await this.writeOwner(session, ownerKey)
		await this.writeStatus(session)

		try {
			let integration = await this.safeReadIntegration(session.primaryIntegrationId)
			if (!integration) {
				await this.synchronizeSessionIntegrations(session)
				if (!session.primaryIntegrationId) {
					await this.stopSession(session, true)
					this.sessions.delete(session.appKey)
					return
				}
				integration = await this.inboundIdentityService.readIntegration(session.primaryIntegrationId)
			}
			const handlers: TChatEventHandlers = {
				onMessage: async (message, ctx) => {
					await this.handleInboundMessage(integration, message, ctx)
				},
				onMention: async (message, ctx) => {
					await this.handleInboundMessage(integration, message, ctx)
				},
				onCardAction: async (action, ctx) => {
					await this.handleInboundCardAction(integration, action, ctx)
				}
			}

			const dispatcher = this.larkChannel.createEventDispatcher(
				{
					integration,
					tenantId: integration.tenantId,
					organizationId: integration.organizationId
				},
				handlers,
				{ includeCardAction: true }
			)

			const client = this.larkChannel.createWSClientFromConfig(integration.options, {
				logger: this.createWSLogger(session)
			})
			session.client = client
			await client.start({ eventDispatcher: dispatcher })
			const connected = await this.waitForClientConnection(session, client)
			if (!connected) {
				if ((session.state as TLarkLongConnectionState) === 'unhealthy') {
					return
				}
				throw new Error(
					session.lastError || 'Long connection client did not establish a websocket session'
				)
			}

			session.connectedAt = Date.now()
			session.state = 'connected'
			session.failureCount = 0
			session.endpoint400Count = 0
			session.disabledReason = null
			session.lastError = null
			await this.writeStatus(session)
			this.startRenew(session)
			this.logger.log(
				`[lark-long] connected integration=${session.primaryIntegrationId} app=${session.appKey} owner=${this.instanceId}`
			)
		} catch (error) {
			await this.handleStartFailure(session, error)
		}
	}

	private async handleInboundMessage(
		integration: IIntegration<TIntegrationLarkOptions>,
		message: any,
		ctx: TChatEventContext<TIntegrationLarkOptions>
	): Promise<void> {
		const rawPayload = message?.raw
		if (!rawPayload) {
			return
		}

		this.logger.debug(
			`[lark-long] inbound message integration=${integration.id} payload=${this.stringifyInboundPayload(rawPayload)}`
		)

		let user: IUser
		try {
			user = await this.inboundIdentityService.resolveUserForEvent(integration, rawPayload)
		} catch (error) {
			this.logger.warn(
				`[lark-long] skip inbound event integration=${integration.id}: ${toLarkApiErrorMessage(error)}`
			)
			return
		}

		const requestHeaders: Record<string, string> = {
			'organization-id': integration.organizationId,
			'tenant-id': integration.tenantId
		}
		if (integration.options?.preferLanguage || user?.preferredLanguage) {
			requestHeaders['language'] = integration.options?.preferLanguage || user?.preferredLanguage
		}

		await new Promise<void>((resolve, reject) => {
			runWithRequestContext(
				{
					user,
					headers: requestHeaders
				},
				{},
				() => {
					this.conversation.handleMessage(message, ctx).then(resolve).catch(reject)
				}
			)
		})
	}

	private async handleInboundCardAction(
		integration: IIntegration<TIntegrationLarkOptions>,
		action: any,
		ctx: TChatEventContext<TIntegrationLarkOptions>
	): Promise<void> {
		const rawPayload = action?.raw
		if (!rawPayload) {
			return
		}

		this.logger.debug(
			`[lark-long] inbound card action integration=${integration.id} payload=${this.stringifyInboundPayload(
				rawPayload
			)}`
		)

		let user: IUser
		try {
			user = await this.inboundIdentityService.resolveUserForEvent(integration, rawPayload)
		} catch (error) {
			this.logger.warn(
				`[lark-long] skip inbound card action integration=${integration.id}: ${toLarkApiErrorMessage(error)}`
			)
			return
		}

		const requestHeaders: Record<string, string> = {
			'organization-id': integration.organizationId,
			'tenant-id': integration.tenantId
		}
		if (integration.options?.preferLanguage || user?.preferredLanguage) {
			requestHeaders['language'] = integration.options?.preferLanguage || user?.preferredLanguage
		}

		await new Promise<void>((resolve, reject) => {
			runWithRequestContext(
				{
					user,
					headers: requestHeaders
				},
				{},
				() => {
					this.conversation.handleCardAction(action, ctx).then(resolve).catch(reject)
				}
			)
		})
	}

	private createWSLogger(session: LarkLongConnectionSession) {
		const emit = (level: 'error' | 'warn' | 'info' | 'debug' | 'trace', ...messages: any[]) => {
			const rendered = messages
				.map((message) => {
					if (typeof message === 'string') {
						return message
					}
					try {
						return JSON.stringify(message)
					} catch {
						return String(message)
					}
				})
				.join(' ')
			this.observeWSLog(session, rendered)

			if (level === 'error') {
				this.logger.error(rendered)
				return
			}
			if (level === 'warn') {
				this.logger.warn(rendered)
				return
			}
			if (level === 'info') {
				this.logger.log(rendered)
				return
			}
			this.logger.debug(rendered)
		}

		return {
			error: (...messages: any[]) => emit('error', ...messages),
			warn: (...messages: any[]) => emit('warn', ...messages),
			info: (...messages: any[]) => emit('info', ...messages),
			debug: (...messages: any[]) => emit('debug', ...messages),
			trace: (...messages: any[]) => emit('trace', ...messages)
		}
	}

	private observeWSLog(session: LarkLongConnectionSession, message: string): void {
		const normalized = message.toLowerCase()

		if (normalized.includes('ws connect success') || normalized.includes('reconnect success')) {
			session.endpoint400Count = 0
			return
		}

		if (!normalized.includes('request failed with status code 400')) {
			return
		}

		session.endpoint400Count += 1
		session.lastError = message
		if (session.endpoint400Count < MAX_ENDPOINT_400_FAILURES || session.state === 'unhealthy') {
			return
		}

		void this.markSessionUnhealthy(
			session,
			'Feishu long connection endpoint returned HTTP 400 repeatedly. Check app type, connection mode, credentials, permissions, tenant installation, and region/domain.'
		)
	}

	private async waitForClientConnection(
		session: LarkLongConnectionSession,
		client: lark.WSClient
	): Promise<boolean> {
		const deadline = Date.now() + INITIAL_CONNECT_TIMEOUT_MS
		while (Date.now() < deadline) {
			if (session.state === 'unhealthy') {
				return false
			}
			if (this.isClientConnected(client)) {
				return true
			}
			await new Promise((resolve) => setTimeout(resolve, 250))
		}
		return this.isClientConnected(client)
	}

	private isClientConnected(client?: lark.WSClient | null): boolean {
		const wsInstance = (client as any)?.wsConfig?.getWSInstance?.()
		return wsInstance?.readyState === 1
	}

	private async markSessionUnhealthy(
		session: LarkLongConnectionSession,
		reason: string
	): Promise<void> {
		session.state = 'unhealthy'
		session.lastError = reason
		session.disabledReason = reason
		session.failureCount = Math.max(session.failureCount, MAX_UNRECOVERABLE_FAILURES)
		session.nextReconnectAt = null
		await this.stopSession(session, true)
		await this.writeStatus(session)
		this.logger.error(
			`[lark-long] unhealthy integration=${session.primaryIntegrationId} app=${session.appKey}: ${reason}`
		)
	}

	private async handleStartFailure(session: LarkLongConnectionSession, error: unknown): Promise<void> {
		if (session.state === 'unhealthy') {
			await this.writeStatus(session)
			return
		}

		const classification = classifyLongConnectionError(error)
		const reconnectInfo = session.client?.getReconnectInfo?.()
		session.lastError = classification.reason || toLarkApiErrorMessage(error)
		session.connectedAt = null

		if (!classification.recoverable) {
			session.failureCount += 1
		}

		if (!classification.recoverable && session.failureCount >= MAX_UNRECOVERABLE_FAILURES) {
			session.state = 'unhealthy'
			session.disabledReason = session.lastError
			session.nextReconnectAt = null
			await this.stopSession(session, true)
			await this.writeStatus(session)
			this.logger.error(
				`[lark-long] unhealthy integration=${session.primaryIntegrationId} app=${session.appKey}: ${session.lastError}`
			)
			return
		}

		const nextReconnectAt =
			typeof reconnectInfo?.nextConnectTime === 'number' && reconnectInfo.nextConnectTime > Date.now()
				? reconnectInfo.nextConnectTime
				: Date.now() + DEFAULT_RETRY_MS
		const retryDelay = Math.min(Math.max(nextReconnectAt - Date.now(), DEFAULT_RETRY_MS), MAX_RETRY_MS)

		session.state = 'retrying'
		session.nextReconnectAt = Date.now() + retryDelay
		await this.stopSession(session, true)
		await this.writeStatus(session)
		this.scheduleRetry(session, retryDelay)
		this.logger.warn(
			`[lark-long] connect failed integration=${session.primaryIntegrationId} recoverable=${classification.recoverable}: ${session.lastError}`
		)
	}

	private scheduleRetry(session: LarkLongConnectionSession, delayMs: number): void {
		if (session.state === 'unhealthy' || session.retryTimer) {
			return
		}

		session.retryTimer = setTimeout(() => {
			session.retryTimer = null
			void this.startSession(session)
		}, delayMs)
	}

	private startRenew(session: LarkLongConnectionSession): void {
		this.clearRenewTimer(session)
		session.renewTimer = setInterval(() => {
			void this.renewOwnership(session)
		}, RENEW_INTERVAL_MS)
	}

	private async renewOwnership(session: LarkLongConnectionSession): Promise<void> {
		if (!session.lockId) {
			return
		}

		const lockKey = getLarkLongConnectionLockKey(session.options)
		const ownerKey = getLarkLongConnectionOwnerKey(session.options)
		const renewed = await this.renewLock(lockKey, session.lockId, LOCK_TTL_MS)
		if (!renewed) {
			session.lastError = 'Lost long-connection ownership'
			session.state = 'retrying'
			session.nextReconnectAt = Date.now() + DEFAULT_RETRY_MS
			await this.stopSession(session, true)
			await this.writeStatus(session)
			this.scheduleRetry(session, DEFAULT_RETRY_MS)
			return
		}

		await this.writeOwner(session, ownerKey)
		this.refreshSessionState(session)
		await this.writeStatus(session)
	}

	private refreshSessionState(session: LarkLongConnectionSession): void {
		const connected = this.isClientConnected(session.client)
		if (connected) {
			session.state = 'connected'
			session.endpoint400Count = 0
			session.nextReconnectAt = null
			return
		}

		if (session.client && session.state === 'connected') {
			session.state = 'retrying'
			const reconnectInfo = session.client.getReconnectInfo?.()
			session.nextReconnectAt =
				typeof reconnectInfo?.nextConnectTime === 'number' ? reconnectInfo.nextConnectTime : Date.now() + DEFAULT_RETRY_MS
		}
	}

	private async stopSession(session: LarkLongConnectionSession, clearOwnership: boolean): Promise<void> {
		this.clearRenewTimer(session)
		this.clearRetryTimer(session)

		const client = session.client
		session.client = null
		if (client) {
			try {
				await client.close({ force: true })
			} catch (error) {
				this.logger.warn(`[lark-long] close failed app=${session.appKey}: ${toLarkApiErrorMessage(error)}`)
			}
		}

		if (clearOwnership && session.lockId) {
			await this.releaseLock(getLarkLongConnectionLockKey(session.options), session.lockId)
			session.lockId = null
			await this.clearOwner(session)
		}
	}

	private clearRenewTimer(session: LarkLongConnectionSession): void {
		if (session.renewTimer) {
			clearInterval(session.renewTimer)
			session.renewTimer = null
		}
	}

	private clearRetryTimer(session: LarkLongConnectionSession): void {
		if (session.retryTimer) {
			clearTimeout(session.retryTimer)
			session.retryTimer = null
		}
	}

	private async registerIntegration(integrationId: string): Promise<void> {
		const redis = this.redis
		if (!redis) {
			return
		}
		if (typeof redis.sadd === 'function') {
			await redis.sadd(REGISTRY_KEY, integrationId)
			return
		}
		if (typeof redis.sAdd === 'function') {
			await redis.sAdd(REGISTRY_KEY, integrationId)
		}
	}

	private async unregisterIntegration(integrationId: string): Promise<void> {
		const redis = this.redis
		if (!redis) {
			return
		}
		if (typeof redis.srem === 'function') {
			await redis.srem(REGISTRY_KEY, integrationId)
			return
		}
		if (typeof redis.sRem === 'function') {
			await redis.sRem(REGISTRY_KEY, integrationId)
		}
	}

	private async loadRegistry(): Promise<string[]> {
		const redis = this.redis
		if (!redis) {
			return []
		}
		if (typeof redis.smembers === 'function') {
			return (await redis.smembers(REGISTRY_KEY)) ?? []
		}
		if (typeof redis.sMembers === 'function') {
			return (await redis.sMembers(REGISTRY_KEY)) ?? []
		}
		return []
	}

	private async loadBootstrapIntegrationIds(): Promise<string[]> {
		const permissionService = this.integrationPermissionService as IntegrationPermissionService & {
			findAll?: <TIntegration = IIntegration>(
				options?: Record<string, any>
			) => Promise<IPagination<TIntegration>>
		}

		if (typeof permissionService.findAll === 'function') {
			try {
				const result = await permissionService.findAll<IIntegration<TIntegrationLarkOptions>>({
					where: {
						provider: 'lark'
					},
					relations: ['tenant']
				})
				const items = (result?.items ?? []).filter(
					(item) => this.larkChannel.resolveConnectionMode(item) === 'long_connection'
				)
				for (const item of items) {
					await this.registerIntegration(item.id)
				}
				return items.map((item) => item.id)
			} catch (error) {
				this.logger.warn(`[lark-long] load from integration service failed: ${toLarkApiErrorMessage(error)}`)
			}
		}

		return this.loadRegistry()
	}

	private async writeOwner(session: LarkLongConnectionSession, ownerKey: string): Promise<void> {
		const redis = this.redis
		if (!redis || typeof redis.set !== 'function') {
			return
		}

		const value = JSON.stringify({
			instanceId: this.instanceId,
			integrationId: session.primaryIntegrationId
		})

		await this.setWithTtl(ownerKey, value, LOCK_TTL_MS)
	}

	private async clearOwner(session: LarkLongConnectionSession): Promise<void> {
		await this.redis?.del(getLarkLongConnectionOwnerKey(session.options))
	}

	private async writeStatus(session: LarkLongConnectionSession): Promise<void> {
		const redis = this.redis
		if (!redis) {
			return
		}

		const payload = {
			state: session.state,
			connected: session.state === 'connected' ? 'true' : 'false',
			ownerInstanceId: session.lockId ? this.instanceId : '',
			lastConnectedAt: session.connectedAt ? String(session.connectedAt) : '',
			lastError: session.lastError || '',
			failureCount: String(session.failureCount ?? 0),
			nextReconnectAt: session.nextReconnectAt ? String(session.nextReconnectAt) : '',
			disabledReason: session.disabledReason || ''
		}

		for (const integrationId of session.integrationIds) {
			const statusKey = getLarkLongConnectionStatusKey(integrationId)
			if (typeof redis.hset === 'function') {
				await redis.hset(statusKey, ...Object.entries(payload).flat())
			} else if (typeof redis.hSet === 'function') {
				await redis.hSet(statusKey, payload)
			}
			if (typeof redis.expire === 'function') {
				await redis.expire(statusKey, 60 * 60 * 24)
			}
		}
	}

	private async clearStatus(integrationId: string): Promise<void> {
		await this.redis?.del(getLarkLongConnectionStatusKey(integrationId))
	}

	private async dropMissingIntegration(integrationId: string): Promise<void> {
		await this.unregisterIntegration(integrationId)
		await this.removeIntegrationFromSessions(integrationId)
		await this.clearStatus(integrationId)
	}

	private async removeIntegrationFromSessions(integrationId: string): Promise<void> {
		for (const session of this.sessions.values()) {
			if (!session.integrationIds.has(integrationId)) {
				continue
			}

			session.integrationIds.delete(integrationId)
			if (session.primaryIntegrationId === integrationId) {
				session.primaryIntegrationId = [...session.integrationIds][0] || null
			}
			if (session.integrationIds.size === 0) {
				await this.stopSession(session, true)
				this.sessions.delete(session.appKey)
				continue
			}
			await this.writeStatus(session)
		}
	}

	private async synchronizeSessionIntegrations(
		session: LarkLongConnectionSession,
		preferredIntegrationId?: string
	): Promise<void> {
		const staleIds: string[] = []
		for (const integrationId of session.integrationIds) {
			const integration = await this.safeReadIntegration(integrationId)
			if (!integration) {
				staleIds.push(integrationId)
				continue
			}
			session.options = integration.options
		}

		for (const integrationId of staleIds) {
			session.integrationIds.delete(integrationId)
			await this.unregisterIntegration(integrationId)
			await this.clearStatus(integrationId)
		}

		const nextPrimary =
			(preferredIntegrationId && session.integrationIds.has(preferredIntegrationId) && preferredIntegrationId) ||
			(session.primaryIntegrationId &&
				session.integrationIds.has(session.primaryIntegrationId) &&
				session.primaryIntegrationId) ||
			[...session.integrationIds][0] ||
			null

		session.primaryIntegrationId = nextPrimary as string | null
	}

	private async readStoredStatus(
		integrationId: string,
		connectionMode: 'webhook' | 'long_connection'
	): Promise<TLarkRuntimeStatus> {
		const redis = this.redis
		const statusKey = getLarkLongConnectionStatusKey(integrationId)
		const data =
			(redis && typeof redis.hgetall === 'function'
				? await redis.hgetall(statusKey)
				: redis && typeof redis.hGetAll === 'function'
					? await redis.hGetAll(statusKey)
					: {}) ?? {}
		if (!Object.keys(data).length) {
			return this.buildDetachedStatus(integrationId, connectionMode)
		}

		return {
			integrationId,
			connectionMode,
			connected: data.connected === 'true',
			state: (data.state as TLarkLongConnectionState) || 'idle',
			ownerInstanceId: data.ownerInstanceId || null,
			lastConnectedAt: data.lastConnectedAt ? Number(data.lastConnectedAt) : null,
			lastError: data.lastError || null,
			failureCount: data.failureCount ? Number(data.failureCount) : 0,
			nextReconnectAt: data.nextReconnectAt ? Number(data.nextReconnectAt) : null,
			disabledReason: data.disabledReason || null
		}
	}

	private buildStatus(session: LarkLongConnectionSession, integrationId: string): TLarkRuntimeStatus {
		return {
			integrationId,
			connectionMode: 'long_connection',
			connected: session.state === 'connected',
			state: session.state,
			ownerInstanceId: session.lockId ? this.instanceId : null,
			lastConnectedAt: session.connectedAt ?? null,
			lastError: session.lastError ?? null,
			failureCount: session.failureCount,
			nextReconnectAt: session.nextReconnectAt ?? null,
			disabledReason: session.disabledReason ?? null
		}
	}

	private buildDetachedStatus(
		integrationId: string,
		connectionMode: 'webhook' | 'long_connection'
	): TLarkRuntimeStatus {
		return {
			integrationId,
			connectionMode,
			connected: false,
			state: 'idle',
			ownerInstanceId: null,
			lastConnectedAt: null,
			lastError: null,
			failureCount: 0,
			nextReconnectAt: null,
			disabledReason: null
		}
	}

	private async safeReadIntegration(
		integrationId: string
	): Promise<IIntegration<TIntegrationLarkOptions> | null> {
		return this.integrationPermissionService.read<IIntegration<TIntegrationLarkOptions>>(integrationId, {
			relations: ['tenant']
		})
	}

	private async acquireLock(key: string, ttlMs: number): Promise<string | null> {
		const redis = this.redis
		if (!redis || typeof redis.set !== 'function') {
			return randomUUID()
		}

		const lockId = randomUUID()
		const result = await redis.set(key, lockId, { PX: ttlMs, NX: true })
		return result === 'OK' ? lockId : null
	}

	private async renewLock(key: string, lockId: string, ttlMs: number): Promise<boolean> {
		const redis = this.redis
		if (!redis || typeof redis.eval !== 'function') {
			return true
		}

		const script = `
			if redis.call("get", KEYS[1]) == ARGV[1]
			then
				return redis.call("pexpire", KEYS[1], ARGV[2])
			else
				return 0
			end
		`
		const result = await this.evalRedisScript(redis, script, [key], [lockId, String(ttlMs)])
		return result === 1
	}

	private async releaseLock(key: string, lockId: string): Promise<boolean> {
		const redis = this.redis
		if (!redis || typeof redis.eval !== 'function') {
			return true
		}

		const script = `
			if redis.call("get", KEYS[1]) == ARGV[1]
			then
				return redis.call("del", KEYS[1])
			else
				return 0
			end
		`
		const result = await this.evalRedisScript(redis, script, [key], [lockId])
		return result === 1
	}

	private async setWithTtl(key: string, value: string, ttlMs: number): Promise<void> {
		const redis = this.redis
		if (!redis || typeof redis.set !== 'function') {
			return
		}

		await redis.set(key, value, { PX: ttlMs })
	}

	private async evalRedisScript(
		redis: RedisLike,
		script: string,
		keys: string[],
		args: string[]
	): Promise<any> {
		try {
			return await redis.eval?.(script, keys.length, ...keys, ...args)
		} catch {
			return await redis.eval?.(script, { keys, arguments: args })
		}
	}

	private stringifyInboundPayload(payload: unknown): string {
		try {
			const serialized = JSON.stringify(payload)
			if (!serialized) {
				return 'null'
			}
			return serialized.length > 8000 ? `${serialized.slice(0, 8000)}...(truncated)` : serialized
		} catch (error) {
			return `<<unserializable: ${toLarkApiErrorMessage(error)}>>`
		}
	}
}
