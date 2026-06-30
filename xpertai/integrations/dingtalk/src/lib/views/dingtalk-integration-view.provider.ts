import type { I18nObject, IIntegration } from '@xpert-ai/contracts'
import type {
  XpertExtensionViewManifest,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery
} from '@xpert-ai/contracts'
import { applyDecorators, Inject, Injectable, SetMetadata } from '@nestjs/common'
import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  IntegrationPermissionService,
  getErrorMessage,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import { DingTalkLongConnectionService } from '../dingtalk-long-connection.service.js'
import { DINGTALK_PLUGIN_CONTEXT } from '../tokens.js'
import {
  INTEGRATION_DINGTALK,
  INTEGRATION_DINGTALK_LONG,
  resolveDingTalkConnectionMode,
  type TIntegrationDingTalkOptions
} from '../types.js'

const DINGTALK_PLUGIN_NAME = '@xpert-ai/plugin-dingtalk'
const DINGTALK_PROVIDER_KEY = 'dingtalk_integration'
const DINGTALK_STREAM_SUBSCRIPTIONS = ['/v1.0/im/bot/messages/get', '/v1.0/card/instances/callback'] as const
const STRATEGY_META_KEY = 'XPERT_STRATEGY_META_KEY'
const VIEW_EXTENSION_PROVIDER = 'VIEW_EXTENSION_PROVIDER'

const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const ViewExtensionProvider = (providerKey: string) =>
  applyDecorators(
    SetMetadata(VIEW_EXTENSION_PROVIDER, providerKey),
    SetMetadata(STRATEGY_META_KEY, VIEW_EXTENSION_PROVIDER)
  )

type DingTalkStatusSummary = {
  connectionMode: string
  state: string
  botUser: string | null
  callbackUrl: string | null
  callbackTokenConfigured: string
  callbackAesKeyConfigured: string
  streamSubscriptions: string
  lastConnectedAt: string | null
  lastDisconnectedAt: string | null
  lastCallbackAt: string | null
  lastError: string | null
  reconnectAttempts: number
}

@Injectable()
@ViewExtensionProvider(DINGTALK_PROVIDER_KEY)
export class DingTalkIntegrationViewProvider {
  private _integrationPermissionService: IntegrationPermissionService

  constructor(
    private readonly longConnectionService: DingTalkLongConnectionService,
    @Inject(DINGTALK_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    if (!this._integrationPermissionService) {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    }
    return this._integrationPermissionService
  }

  supports(context: XpertResolvedViewHostContext) {
    if (context.hostType !== 'integration') {
      return false
    }

    return [getStringProperty(context.hostSnapshot, 'provider'), getStringProperty(context.hostSnapshot, 'type')].some(
      isDingTalkProviderValue
    )
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== 'detail.main_tabs') {
      return []
    }

    return [this.buildStatusManifest(context, slot)]
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    _query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    if (viewKey === 'status') {
      return {
        summary: await this.getStatusSummary(context)
      }
    }

    return {}
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    _request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== 'status') {
      return {
        success: false,
        message: text('Unsupported action', '不支持的操作')
      }
    }

    if (actionKey === 'refresh') {
      return {
        success: true,
        message: text('DingTalk view refreshed', '钉钉视图已刷新'),
        refresh: true
      }
    }

    try {
      const integration = await this.readIntegrationById(context.hostId)
      if (!integration) {
        return {
          success: false,
          message: text('Integration not found', '未找到集成')
        }
      }

      if (resolveDingTalkConnectionMode(integration.options, integration.provider) !== 'long_connection') {
        return {
          success: false,
          message: text('This action is only available for Stream mode', '该操作仅适用于 Stream 模式')
        }
      }

      if (actionKey === 'reconnect') {
        await this.longConnectionService.reconnect(context.hostId)
        return {
          success: true,
          message: text('DingTalk Stream connection reconnected', '钉钉 Stream 连接已重连'),
          refresh: true
        }
      }

      if (actionKey === 'disconnect') {
        await this.longConnectionService.disconnect(context.hostId)
        return {
          success: true,
          message: text('DingTalk Stream connection disconnected', '钉钉 Stream 连接已断开'),
          refresh: true
        }
      }
    } catch (error) {
      const message = getErrorMessage(error)
      return {
        success: false,
        message: text(message, message)
      }
    }

    return {
      success: false,
      message: text('Unsupported action', '不支持的操作')
    }
  }

  private buildStatusManifest(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest {
    return {
      key: 'status',
      title: text('Status', '状态'),
      hostType: context.hostType,
      slot,
      order: 10,
      refreshable: true,
      source: {
        provider: DINGTALK_PROVIDER_KEY,
        plugin: DINGTALK_PLUGIN_NAME
      },
      view: {
        type: 'stats',
        items: [
          { key: 'connectionMode', label: text('Connection Mode', '连接方式'), valueType: 'text' },
          { key: 'state', label: text('State', '状态'), valueType: 'status' },
          { key: 'botUser', label: text('Bot / Integration', '机器人 / 集成'), valueType: 'text' },
          { key: 'callbackUrl', label: text('Callback URL', '回调地址'), valueType: 'text' },
          { key: 'callbackTokenConfigured', label: text('Callback Token', '回调 Token'), valueType: 'text' },
          { key: 'callbackAesKeyConfigured', label: text('Callback AES Key', '回调 AES Key'), valueType: 'text' },
          { key: 'streamSubscriptions', label: text('Stream Subscriptions', 'Stream 订阅'), valueType: 'text' },
          { key: 'lastConnectedAt', label: text('Last Connected', '最近连接'), valueType: 'datetime' },
          { key: 'lastDisconnectedAt', label: text('Last Disconnected', '最近断开'), valueType: 'datetime' },
          { key: 'lastCallbackAt', label: text('Last Callback', '最近回调'), valueType: 'datetime' },
          { key: 'lastError', label: text('Last Error', '最近错误'), valueType: 'text' },
          { key: 'reconnectAttempts', label: text('Reconnect Attempts', '重连次数'), valueType: 'number' }
        ]
      },
      dataSource: {
        mode: 'platform',
        cache: {
          ttlMs: 15 * 1000
        },
        polling: {
          enabled: true,
          intervalMs: 15 * 1000
        }
      },
      actions: [
        {
          key: 'refresh',
          label: text('Refresh', '刷新'),
          icon: 'ri-refresh-line',
          placement: 'toolbar',
          actionType: 'refresh'
        },
        {
          key: 'reconnect',
          label: text('Reconnect', '重连'),
          icon: 'ri-restart-line',
          placement: 'toolbar',
          actionType: 'invoke'
        },
        {
          key: 'disconnect',
          label: text('Disconnect', '断开'),
          icon: 'ri-plug-line',
          placement: 'toolbar',
          actionType: 'invoke',
          confirm: {
            title: text('Disconnect DingTalk Stream connection', '断开钉钉 Stream 连接'),
            message: text(
              'Disconnect the current DingTalk Stream session?',
              '确认断开当前钉钉 Stream 会话吗？'
            )
          }
        }
      ]
    }
  }

  private async getStatusSummary(context: XpertResolvedViewHostContext): Promise<DingTalkStatusSummary> {
    const fallback = buildFallbackStatusSummary(context.hostSnapshot)
    const [runtimeResult, integrationResult] = await Promise.allSettled([
      this.longConnectionService.status(context.hostId),
      this.readIntegrationById(context.hostId)
    ])

    const runtimeStatus = runtimeResult.status === 'fulfilled' ? runtimeResult.value : null
    const integration = integrationResult.status === 'fulfilled' ? integrationResult.value : null
    const connectionMode = integration
      ? resolveDingTalkConnectionMode(integration.options, integration.provider)
      : runtimeStatus?.connectionMode ?? fallback.connectionMode
    const options = integration?.options

    return {
      connectionMode,
      state: runtimeStatus?.state ?? fallback.state,
      botUser:
        normalizeText(integration?.name) ||
        normalizeText(options?.robotCode) ||
        normalizeText(options?.clientId) ||
        fallback.botUser,
      callbackUrl: connectionMode === 'webhook' ? resolveCallbackUrl(context.hostId) : null,
      callbackTokenConfigured: connectionMode === 'webhook' ? formatConfigured(options?.callbackToken) : 'N/A',
      callbackAesKeyConfigured: connectionMode === 'webhook' ? formatConfigured(options?.callbackAesKey) : 'N/A',
      streamSubscriptions: connectionMode === 'long_connection' ? DINGTALK_STREAM_SUBSCRIPTIONS.join(', ') : 'N/A',
      lastConnectedAt: formatDateTime(runtimeStatus?.lastConnectedAt ?? null),
      lastDisconnectedAt: formatDateTime(runtimeStatus?.lastDisconnectedAt ?? null),
      lastCallbackAt: formatDateTime(runtimeStatus?.lastCallbackAt ?? null),
      lastError: normalizeText(runtimeStatus?.lastError) ?? fallback.lastError,
      reconnectAttempts: runtimeStatus?.reconnectAttempts ?? 0
    }
  }

  private async readIntegrationById(id: string): Promise<IIntegration<TIntegrationDingTalkOptions> | null> {
    return await this.integrationPermissionService.read<IIntegration<TIntegrationDingTalkOptions>>(id, {
      relations: ['tenant']
    })
  }
}

function resolveProviderValue(snapshot: unknown): typeof INTEGRATION_DINGTALK | typeof INTEGRATION_DINGTALK_LONG | null {
  const candidates = [getStringProperty(snapshot, 'provider'), getStringProperty(snapshot, 'type')]
  for (const candidate of candidates) {
    if (candidate === INTEGRATION_DINGTALK || candidate === INTEGRATION_DINGTALK_LONG) {
      return candidate
    }
  }

  return null
}

function isDingTalkProviderValue(value: string | null): boolean {
  return value === INTEGRATION_DINGTALK || value === INTEGRATION_DINGTALK_LONG
}

function buildFallbackStatusSummary(snapshot: unknown): DingTalkStatusSummary {
  const provider = resolveProviderValue(snapshot)
  const connectionMode = provider === INTEGRATION_DINGTALK_LONG ? 'long_connection' : 'webhook'
  return {
    connectionMode,
    state: getStringProperty(snapshot, 'status') || 'idle',
    botUser: getStringProperty(snapshot, 'name') || getStringProperty(snapshot, 'robotCode'),
    callbackUrl: null,
    callbackTokenConfigured: connectionMode === 'webhook' ? 'No' : 'N/A',
    callbackAesKeyConfigured: connectionMode === 'webhook' ? 'No' : 'N/A',
    streamSubscriptions: connectionMode === 'long_connection' ? DINGTALK_STREAM_SUBSCRIPTIONS.join(', ') : 'N/A',
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    lastCallbackAt: null,
    lastError: null,
    reconnectAttempts: 0
  }
}

function resolveCallbackUrl(integrationId: string): string {
  const apiBaseUrl = normalizeText(process.env.API_BASE_URL)
  const path = `/api/dingtalk/webhook/${integrationId}`
  return apiBaseUrl ? `${apiBaseUrl.replace(/\/+$/, '')}${path}` : path
}

function formatConfigured(value: unknown): 'Yes' | 'No' {
  return normalizeText(value) ? 'Yes' : 'No'
}

function getStringProperty(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const candidate = Reflect.get(value, key)
  return normalizeText(candidate)
}

function normalizeText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function formatDateTime(value: Date | number | string | null | undefined): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? new Date(value).toISOString() : null
  }

  if (typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? normalizeText(value) : date.toISOString()
  }

  return null
}
