import * as lark from '@larksuiteoapi/node-sdk'
import axios from 'axios'
import { createRequire } from 'module'
import { randomUUID } from 'crypto'
import { hostname } from 'os'
import type { IIntegration, IUser } from '@xpert-ai/contracts'
import {
	INTEGRATION_PERMISSION_SERVICE_TOKEN,
	IntegrationPermissionService,
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
import { LARK_PLUGIN_CONTEXT } from './tokens.js'
import {
	TIntegrationLarkOptions,
	TLarkConnectionProbeResult,
	TLarkLongConnectionState,
	TLarkRuntimeStatus
} from './types.js'
import { toLarkApiErrorMessage } from './utils.js'
import {
	CONNECTION_COMMAND_ROUTER_TOKEN,
	ConnectionCommandRouter,
	MANAGED_CONNECTION_REGISTRY_TOKEN,
	ManagedConnectionCommandRequest,
	ManagedConnectionRecord,
	ManagedConnectionRegistry
} from './managed-connection-compat.js'

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

export type LarkManagedConnectionInfo = {
	connectionKey: string
	status: 'connected' | 'disconnected' | 'stale' | 'error'
	connected: boolean
	direction: 'inbound' | 'outbound' | 'internal'
	transportType: string
	ownerInstanceId: string | null
	connectedAt: string | null
	lastSeenAt: string | null
	leaseExpiresAt: string | null
	integrationCount: number
	lastError: string | null
}

const REDIS_CLIENT_TOKEN = 'REDIS_CLIENT'
const REGISTRY_KEY = 'lark:ws:registry'
const LARK_MANAGED_CONNECTION_PLUGIN_NAME = '@xpert-ai/plugin-lark'
const LARK_LONG_CONNECTION_TYPE = 'lark_long_connection'
const LOCK_TTL_MS = 45_000
const RENEW_INTERVAL_MS = 15_000
const DEFAULT_RETRY_MS = 5_000
const MAX_RETRY_MS = 30_000
const MAX_UNRECOVERABLE_FAILURES = 3
const MAX_ENDPOINT_400_FAILURES = 3
const INITIAL_CONNECT_TIMEOUT_MS = 8_000
const require = createRequire(import.meta.url)

@Injectable()
export class LarkLongConnectionService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(LarkLongConnectionService.name)
	private readonly instanceId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`
	private readonly sessions = new Map<string, LarkLongConnectionSession>()
	private _integrationPermissionService: IntegrationPermissionService
	private _redis: RedisLike | null | undefined
	private managedRegistryResolved = false
	private managedRegistryValue: ManagedConnectionRegistry | null = null
	private commandRouterResolved = false
	private commandRouterValue: ConnectionCommandRouter | null = null

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

	private get managedRegistry(): ManagedConnectionRegistry | null {
		if (!this.managedRegistryResolved) {
			this.managedRegistryResolved = true
			try {
				this.managedRegistryValue = this.pluginContext.resolve(MANAGED_CONNECTION_REGISTRY_TOKEN)
			} catch {
				this.managedRegistryValue = null
			}
		}
		return this.managedRegistryValue
	}

	private get commandRouter(): ConnectionCommandRouter | null {
		if (!this.commandRouterResolved) {
			this.commandRouterResolved = true
			try {
				this.commandRouterValue = this.pluginContext.resolve(CONNECTION_COMMAND_ROUTER_TOKEN)
			} catch {
				this.commandRouterValue = null
			}
		}
		return this.commandRouterValue
	}

	async onModuleInit(): Promise<void> {
		this.commandRouter?.registerHandler(LARK_LONG_CONNECTION_TYPE, (request) => this.handleManagedCommand(request))
		await this.conversationBindingSchemaService.ensureSchema()
		const integrationIds = await this.loadBootstrapIntegrationIds()
		this.logger.debug(`[lark-long] bootstrapping long connection sessions for integrations: [${integrationIds.join(', ')}]`)
		await Promise.allSettled(integrationIds.map((integrationId) => this.connect(integrationId)))
	}

	async onModuleDestroy(): Promise<void> {
		await Promise.allSettled([...this.sessions.values()].map((session) => this.stopSession(session, true, 'service shutting down')))
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
		if (this.larkChannel.resolveConnectionMode(integration) !== 'long_connection') {
			await this.unregisterIntegration(integrationId)
			return this.buildDetachedStatus(integrationId, this.larkChannel.resolveConnectionMode(integration))
		}
		if (await this.invokeOwnerIfAvailable(integration, 'reconnect', { integrationId })) {
			return this.status(integrationId)
		}
		return this.reconnectLocalIntegration(integration, integrationId)
	}

	async disconnect(integrationId: string): Promise<TLarkRuntimeStatus> {
		const integration = await this.safeReadIntegration(integrationId)
		if (!integration) {
			await this.dropMissingIntegration(integrationId)
			return this.buildDetachedStatus(integrationId, 'webhook')
		}
		if (this.larkChannel.resolveConnectionMode(integration) !== 'long_connection') {
			await this.unregisterIntegration(integrationId)
			return this.buildDetachedStatus(integrationId, this.larkChannel.resolveConnectionMode(integration))
		}
		if (await this.invokeOwnerIfAvailable(integration, 'disconnect', { integrationId })) {
			return this.buildDetachedStatus(integrationId, 'long_connection')
		}
		return this.disconnectLocalIntegration(integrationId, integration)
	}

	private async reconnectLocalIntegration(
		integration: IIntegration<TIntegrationLarkOptions>,
		integrationId: string
	): Promise<TLarkRuntimeStatus> {
		const session = this.ensureSession(integration)
		await this.synchronizeSessionIntegrations(session, integrationId)
		session.failureCount = 0
		session.endpoint400Count = 0
		session.disabledReason = null
		session.lastError = null
		session.nextReconnectAt = null
		session.state = 'idle'
		await this.writeStatus(session)
		await this.stopSession(session, true, 'lark long connection reconnecting')
		await this.startSession(session)
		return this.buildStatus(session, integrationId)
	}

	private async disconnectLocalIntegration(
		integrationId: string,
		integration?: IIntegration<TIntegrationLarkOptions> | null
	): Promise<TLarkRuntimeStatus> {
		await this.unregisterIntegration(integrationId)

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

		const managedStatus = await this.readManagedRuntimeStatus(integration)
		if (managedStatus?.connected) {
			return managedStatus
		}

		const session = this.sessions.get(this.larkChannel.resolveLongConnectionAppKey(integration))
		if (!session) {
			void this.connect(integrationId).catch((error) => {
				this.logger.warn(`[lark-long] lazy connect failed integration=${integrationId}: ${toLarkApiErrorMessage(error)}`)
			})
			return managedStatus ?? this.readStoredStatus(integrationId, connectionMode)
		}

		this.refreshSessionState(session)
		await this.writeStatus(session)
		return this.buildStatus(session, integrationId)
	}

	async listManagedConnections(integrationId: string): Promise<LarkManagedConnectionInfo[]> {
		const integration = await this.safeReadIntegration(integrationId)
		if (!integration || this.larkChannel.resolveConnectionMode(integration) !== 'long_connection') {
			return []
		}

		const registry = this.managedRegistry
		if (!registry) {
			const status = await this.status(integrationId)
			if (!status.connectionKey) {
				return []
			}
			return [
				{
					connectionKey: status.connectionKey,
					status: status.connected ? 'connected' : 'disconnected',
					connected: status.connected,
					direction: status.direction ?? 'outbound',
					transportType: status.transportType ?? 'websocket',
					ownerInstanceId: status.ownerInstanceId ?? null,
					connectedAt: this.toIsoFromNumber(status.lastConnectedAt),
					lastSeenAt: this.toIsoFromNumber(status.lastSeenAt),
					leaseExpiresAt: null,
					integrationCount: 1,
					lastError: status.lastError ?? null
				}
			]
		}

		const appKey = this.larkChannel.resolveLongConnectionAppKey(integration)
		const records = await registry.list({
			pluginName: LARK_MANAGED_CONNECTION_PLUGIN_NAME,
			connectionType: LARK_LONG_CONNECTION_TYPE,
			connectionKey: appKey,
			direction: 'outbound',
			limit: 20
		}).catch(() => [])
		if (!records.length) {
			const status = await this.status(integrationId)
			return status.connectionKey
				? [
						{
							connectionKey: status.connectionKey,
							status: status.connected ? 'connected' : 'disconnected',
							connected: status.connected,
							direction: status.direction ?? 'outbound',
							transportType: status.transportType ?? 'websocket',
							ownerInstanceId: status.ownerInstanceId ?? null,
							connectedAt: this.toIsoFromNumber(status.lastConnectedAt),
							lastSeenAt: this.toIsoFromNumber(status.lastSeenAt),
							leaseExpiresAt: null,
							integrationCount: 1,
							lastError: status.lastError ?? null
						}
					]
				: []
		}

		return records.map((record) => this.managedRecordToInfo(record))
	}

	async probeConfig(config: TIntegrationLarkOptions): Promise<TLarkConnectionProbeResult> {
		const checkedAt = Date.now()
		const baseUrl = config?.isLark ? 'https://open.larksuite.com' : 'https://open.feishu.cn'

		try {
			const endpointResponse = await axios.post(
				`${baseUrl}/callback/ws/endpoint`,
				{
					AppID: config.appId,
					AppSecret: config.appSecret
				},
				{
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

	private async handleManagedCommand(request: ManagedConnectionCommandRequest): Promise<unknown> {
		const integrationId = this.getPayloadString(request.payload, 'integrationId')
		if (request.command === 'disconnect') {
			const session = this.sessions.get(request.connectionKey)
			if (!session) {
				return { disconnected: false }
			}
			if (integrationId) {
				await this.disconnectLocalIntegration(integrationId, await this.safeReadIntegration(integrationId))
			} else {
				for (const id of [...session.integrationIds]) {
					await this.disconnectLocalIntegration(id, await this.safeReadIntegration(id))
				}
			}
			return { disconnected: true }
		}

		if (request.command === 'reconnect') {
			const targetIntegrationId = integrationId || this.sessions.get(request.connectionKey)?.primaryIntegrationId
			if (!targetIntegrationId) {
				return { reconnected: false }
			}
			const integration = await this.safeReadIntegration(targetIntegrationId)
			if (!integration) {
				return { reconnected: false }
			}
			await this.reconnectLocalIntegration(integration, targetIntegrationId)
			return { reconnected: true }
		}

		throw new Error(`Unsupported Lark long connection command "${request.command}"`)
	}

	private async invokeOwnerIfAvailable(
		integration: IIntegration<TIntegrationLarkOptions>,
		command: 'disconnect' | 'reconnect',
		payload: Record<string, unknown>
	): Promise<boolean> {
		const registry = this.managedRegistry
		const router = this.commandRouter
		if (!registry || !router) {
			return false
		}

		const connectionKey = this.larkChannel.resolveLongConnectionAppKey(integration)
		const owner = await registry.getOwner({
			pluginName: LARK_MANAGED_CONNECTION_PLUGIN_NAME,
			connectionType: LARK_LONG_CONNECTION_TYPE,
			connectionKey,
			tenantId: integration.tenantId,
			organizationId: integration.organizationId
		}).catch(() => null)
		if (!owner) {
			return false
		}

		await router.invokeOwner(
			LARK_LONG_CONNECTION_TYPE,
			connectionKey,
			command,
			payload,
			{
				pluginName: LARK_MANAGED_CONNECTION_PLUGIN_NAME,
				tenantId: integration.tenantId,
				organizationId: integration.organizationId,
				timeoutMs: 30_000
			}
		)
		return true
	}

	private async registerManagedSession(session: LarkLongConnectionSession): Promise<void> {
		const registry = this.managedRegistry
		if (!registry || !session.primaryIntegrationId) {
			return
		}
		const scope = await this.readSessionScope(session)
		await registry.register({
			pluginName: LARK_MANAGED_CONNECTION_PLUGIN_NAME,
			connectionType: LARK_LONG_CONNECTION_TYPE,
			connectionKey: session.appKey,
			transportType: 'websocket',
			direction: 'outbound',
			tenantId: scope?.tenantId ?? null,
			organizationId: scope?.organizationId ?? null,
			metadata: this.buildManagedMetadata(session),
			leaseTtlMs: LOCK_TTL_MS * 2
		}).catch(() => undefined)
	}

	private async heartbeatManagedSession(session: LarkLongConnectionSession): Promise<void> {
		const registry = this.managedRegistry
		if (!registry || !session.primaryIntegrationId) {
			return
		}
		await registry.heartbeat({
			pluginName: LARK_MANAGED_CONNECTION_PLUGIN_NAME,
			connectionType: LARK_LONG_CONNECTION_TYPE,
			connectionKey: session.appKey,
			metadata: this.buildManagedMetadata(session),
			leaseTtlMs: LOCK_TTL_MS * 2
		}).catch(() => undefined)
	}

	private async syncManagedSession(session: LarkLongConnectionSession): Promise<void> {
		const registry = this.managedRegistry
		if (!registry || !session.primaryIntegrationId) {
			return
		}
		const scope = await this.readSessionScope(session)
		await registry.syncMetadata({
			pluginName: LARK_MANAGED_CONNECTION_PLUGIN_NAME,
			connectionType: LARK_LONG_CONNECTION_TYPE,
			connectionKey: session.appKey,
			tenantId: scope?.tenantId ?? null,
			organizationId: scope?.organizationId ?? null,
			metadata: this.buildManagedMetadata(session),
			leaseTtlMs: LOCK_TTL_MS * 2
		}).catch(() => undefined)
	}

	private async markManagedSessionDisconnected(
		session: LarkLongConnectionSession,
		reason?: string
	): Promise<void> {
		const registry = this.managedRegistry
		if (!registry) {
			return
		}
		const scope = await this.readSessionScope(session)
		await registry.markDisconnected(
			{
				pluginName: LARK_MANAGED_CONNECTION_PLUGIN_NAME,
				connectionType: LARK_LONG_CONNECTION_TYPE,
				connectionKey: session.appKey,
				tenantId: scope?.tenantId ?? null,
				organizationId: scope?.organizationId ?? null
			},
			reason
		).catch(() => undefined)
	}

	private buildManagedMetadata(session: LarkLongConnectionSession): Record<string, unknown> {
		return {
			appKey: session.appKey,
			appId: session.options?.appId ?? null,
			domain: session.options?.isLark ? 'larksuite' : 'feishu',
			connectionMode: 'long_connection',
			primaryIntegrationId: session.primaryIntegrationId ?? null,
			integrationIds: [...session.integrationIds],
			integrationCount: session.integrationIds.size,
			state: session.state,
			localInstanceId: this.instanceId,
			lastConnectedAt: session.connectedAt ?? null,
			lastSeenAt: Date.now(),
			failureCount: session.failureCount,
			nextReconnectAt: session.nextReconnectAt ?? null,
			disabledReason: session.disabledReason ?? null,
			lastError: session.lastError ?? null
		}
	}

	private async readSessionScope(
		session: LarkLongConnectionSession
	): Promise<Pick<IIntegration<TIntegrationLarkOptions>, 'tenantId' | 'organizationId'> | null> {
		const integrationId = session.primaryIntegrationId || [...session.integrationIds][0]
		if (!integrationId) {
			return null
		}
		return this.safeReadIntegration(integrationId).catch(() => null)
	}

	private async readManagedRuntimeStatus(
		integration: IIntegration<TIntegrationLarkOptions>
	): Promise<TLarkRuntimeStatus | null> {
		const registry = this.managedRegistry
		if (!registry) {
			return null
		}
		const appKey = this.larkChannel.resolveLongConnectionAppKey(integration)
		const records = await registry.list({
			pluginName: LARK_MANAGED_CONNECTION_PLUGIN_NAME,
			connectionType: LARK_LONG_CONNECTION_TYPE,
			connectionKey: appKey,
			direction: 'outbound',
			limit: 1
		}).catch(() => [])
		const [record] = records
		if (!record) {
			return null
		}
		return this.managedRecordToRuntimeStatus(record, integration.id)
	}

	private managedRecordToRuntimeStatus(
		record: ManagedConnectionRecord,
		integrationId: string
	): TLarkRuntimeStatus {
		const metadata = this.objectPayload(record.metadata)
		const leaseExpiresAt = this.toDateTime(record.leaseExpiresAt)
		const connected = record.status === 'connected' && (!leaseExpiresAt || leaseExpiresAt > Date.now())
		return {
			integrationId,
			connectionMode: 'long_connection',
			connected,
			state: this.normalizeManagedState(metadata.state, connected),
			connectionKey: record.connectionKey,
			direction: record.direction ?? 'outbound',
			transportType: record.transportType,
			ownerInstanceId: connected ? record.ownerInstanceId : null,
			lastSeenAt: this.toDateTime(record.lastSeenAt ?? metadata.lastSeenAt),
			lastConnectedAt: this.toDateTime(metadata.lastConnectedAt ?? record.connectedAt),
			lastError: record.lastError ?? this.stringValue(metadata.lastError) ?? null,
			failureCount: this.numberValue(metadata.failureCount) ?? 0,
			nextReconnectAt: this.toDateTime(metadata.nextReconnectAt),
			disabledReason: this.stringValue(metadata.disabledReason)
		}
	}

	private managedRecordToInfo(record: ManagedConnectionRecord): LarkManagedConnectionInfo {
		const metadata = this.objectPayload(record.metadata)
		const leaseExpiresAt = this.toDateTime(record.leaseExpiresAt)
		const connected = record.status === 'connected' && (!leaseExpiresAt || leaseExpiresAt > Date.now())
		return {
			connectionKey: record.connectionKey,
			status: connected ? 'connected' : record.status,
			connected,
			direction: record.direction ?? 'outbound',
			transportType: record.transportType,
			ownerInstanceId: connected ? record.ownerInstanceId : null,
			connectedAt: this.toIsoValue(record.connectedAt ?? metadata.lastConnectedAt),
			lastSeenAt: this.toIsoValue(record.lastSeenAt ?? metadata.lastSeenAt),
			leaseExpiresAt: this.toIsoValue(record.leaseExpiresAt),
			integrationCount: this.numberValue(metadata.integrationCount) ?? this.arrayValue(metadata.integrationIds).length,
			lastError: record.lastError ?? this.stringValue(metadata.lastError) ?? null
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
		const wsModule = require('ws')
		const WebSocketCtor = (wsModule.default ?? wsModule) as any

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
				} catch {
					//
				}
				try {
					if (ws?.readyState === WebSocketCtor.OPEN) {
						ws.close()
					} else {
						ws?.terminate?.()
					}
				} catch {
					//
				}
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
				ws = new WebSocketCtor(connectUrl)
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
			await this.stopSession(session, true, 'no lark integrations remain')
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
					await this.stopSession(session, true, 'primary lark integration is missing')
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
			await this.registerManagedSession(session)
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
			user = (
				await this.inboundIdentityService.resolveInboundIdentityForEvent(integration, rawPayload)
			).requestUser
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
			user = (
				await this.inboundIdentityService.resolveInboundIdentityForEvent(integration, rawPayload)
			).requestUser
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
		await this.stopSession(session, true, reason)
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
			await this.stopSession(session, true, session.lastError)
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
		await this.stopSession(session, true, session.lastError)
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
			await this.stopSession(session, true, 'Lost long-connection ownership')
			await this.writeStatus(session)
			this.scheduleRetry(session, DEFAULT_RETRY_MS)
			return
		}

		await this.writeOwner(session, ownerKey)
		this.refreshSessionState(session)
		await this.writeStatus(session)
		if (session.state === 'connected') {
			await this.heartbeatManagedSession(session)
		}
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

	private async stopSession(
		session: LarkLongConnectionSession,
		clearOwnership: boolean,
		reason?: string
	): Promise<void> {
		this.clearRenewTimer(session)
		this.clearRetryTimer(session)

		const client = session.client
		const hadManagedConnection = Boolean(client || session.lockId || session.state === 'connected')
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

		if (hadManagedConnection) {
			await this.markManagedSessionDisconnected(session, reason)
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
		const permissionService = this.integrationPermissionService

		try {
			const result = await permissionService.findAll<IIntegration<TIntegrationLarkOptions>>({
				where: {
					provider: 'lark'
				},
				relations: ['tenant']
			})
			this.logger.debug(`[lark-long] loaded ${result?.items?.length ?? 0} lark integrations from permission service`)
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
				await this.stopSession(session, true, 'no lark integrations remain')
				this.sessions.delete(session.appKey)
				continue
			}
			await this.writeStatus(session)
			await this.syncManagedSession(session)
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
			connectionKey: null,
			direction: connectionMode === 'long_connection' ? 'outbound' : null,
			transportType: connectionMode === 'long_connection' ? 'websocket' : null,
			ownerInstanceId: data.ownerInstanceId || null,
			lastSeenAt: null,
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
			connectionKey: session.appKey,
			direction: 'outbound',
			transportType: 'websocket',
			ownerInstanceId: session.lockId ? this.instanceId : null,
			lastSeenAt: Date.now(),
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
			connectionKey: null,
			direction: connectionMode === 'long_connection' ? 'outbound' : null,
			transportType: connectionMode === 'long_connection' ? 'websocket' : null,
			ownerInstanceId: null,
			lastSeenAt: null,
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

	private getPayloadString(payload: unknown, key: string): string | null {
		const object = this.objectPayload(payload)
		return this.stringValue(object[key])
	}

	private objectPayload(value: unknown): Record<string, unknown> {
		return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
	}

	private stringValue(value: unknown): string | null {
		if (typeof value !== 'string') {
			return null
		}
		const normalized = value.trim()
		return normalized.length ? normalized : null
	}

	private numberValue(value: unknown): number | null {
		if (typeof value === 'number' && Number.isFinite(value)) {
			return value
		}
		if (typeof value === 'string' && value.trim()) {
			const parsed = Number(value)
			return Number.isFinite(parsed) ? parsed : null
		}
		return null
	}

	private arrayValue(value: unknown): unknown[] {
		return Array.isArray(value) ? value : []
	}

	private toDateTime(value: unknown): number | null {
		if (value instanceof Date) {
			const time = value.getTime()
			return Number.isFinite(time) ? time : null
		}
		if (typeof value === 'number' && Number.isFinite(value)) {
			return value
		}
		if (typeof value === 'string' && value.trim()) {
			const numeric = Number(value)
			if (Number.isFinite(numeric)) {
				return numeric
			}
			const parsed = Date.parse(value)
			return Number.isFinite(parsed) ? parsed : null
		}
		return null
	}

	private toIsoValue(value: unknown): string | null {
		const time = this.toDateTime(value)
		return this.toIsoFromNumber(time)
	}

	private toIsoFromNumber(value: number | null | undefined): string | null {
		if (!Number.isFinite(value)) {
			return null
		}
		const date = new Date(value as number)
		return Number.isNaN(date.getTime()) ? null : date.toISOString()
	}

	private normalizeManagedState(value: unknown, connected: boolean): TLarkLongConnectionState {
		if (
			value === 'idle' ||
			value === 'connecting' ||
			value === 'connected' ||
			value === 'retrying' ||
			value === 'unhealthy'
		) {
			return value
		}
		return connected ? 'connected' : 'idle'
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
