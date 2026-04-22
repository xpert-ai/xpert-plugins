import type { I18nObject } from '@metad/contracts'
import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common'
import { getErrorMessage } from '@xpert-ai/plugin-sdk'
import { WeComChannelStrategy } from '../wecom-channel.strategy.js'
import { WeComLongConnectionService } from '../wecom-long-connection.service.js'
import {
  INTEGRATION_WECOM_LONG,
  TIntegrationWeComLongOptions,
  TWeComRuntimeStatus
} from '../types.js'

const WECOM_PLUGIN_NAME = '@xpert-ai/plugin-wecom'
const WECOM_PROVIDER_KEY = 'wecom_long_integration'
const STRATEGY_META_KEY = 'XPERT_STRATEGY_META_KEY'
const VIEW_EXTENSION_PROVIDER = 'VIEW_EXTENSION_PROVIDER'

const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const ViewExtensionProvider = (providerKey: string) =>
  applyDecorators(
    SetMetadata(VIEW_EXTENSION_PROVIDER, providerKey),
    SetMetadata(STRATEGY_META_KEY, VIEW_EXTENSION_PROVIDER)
  )

type WeComStatusSummary = {
  connectionMode: string
  state: string
  botUser: string | null
  ownerInstanceId: string | null
  lastConnectedAt: string | null
  lastDisconnectedAt: string | null
  lastCallbackAt: string | null
  lastPingAt: string | null
  lastError: string | null
  reconnectAttempts: number
  disabledReason: string | null
}

type WeComViewHostContext = {
  hostType: string
  hostId: string
  hostSnapshot?: Record<string, unknown>
}

type WeComViewManifest = {
  key: string
  title: I18nObject
  hostType: string
  slot: string
  order: number
  refreshable?: boolean
  source: {
    provider: string
    plugin: string
  }
  view: {
    type: string
    items: Array<Record<string, unknown>>
  }
  dataSource: Record<string, unknown>
  actions?: Array<Record<string, unknown>>
}

type WeComViewQuery = Record<string, unknown>

type WeComViewDataResult = {
  summary?: WeComStatusSummary
}

type WeComViewActionRequest = Record<string, unknown>

type WeComViewActionResult = {
  success: boolean
  message?: I18nObject
  refresh?: boolean
}

@Injectable()
@ViewExtensionProvider(WECOM_PROVIDER_KEY)
export class WeComIntegrationViewProvider {
  constructor(
    private readonly longConnectionService: WeComLongConnectionService,
    private readonly wecomChannel: WeComChannelStrategy
  ) {}

  supports(context: WeComViewHostContext) {
    if (context.hostType !== 'integration') {
      return false
    }

    return [getStringProperty(context.hostSnapshot, 'provider'), getStringProperty(context.hostSnapshot, 'type')].some(
      (value) => value === INTEGRATION_WECOM_LONG
    )
  }

  getViewManifests(context: WeComViewHostContext, slot: string): WeComViewManifest[] {
    if (slot !== 'detail.main_tabs') {
      return []
    }

    return [
      {
        key: 'status',
        title: text('Status', '状态'),
        hostType: context.hostType,
        slot,
        order: 10,
        refreshable: true,
        source: {
          provider: WECOM_PROVIDER_KEY,
          plugin: WECOM_PLUGIN_NAME
        },
        view: {
          type: 'stats',
          items: [
            { key: 'connectionMode', label: text('Connection Mode', '连接方式'), valueType: 'text' },
            { key: 'state', label: text('State', '状态'), valueType: 'status' },
            { key: 'botUser', label: text('Bot User / Bot ID', '机器人用户 / Bot ID'), valueType: 'text' },
            { key: 'ownerInstanceId', label: text('Owner Instance', '持有实例'), valueType: 'text' },
            { key: 'lastConnectedAt', label: text('Last Connected', '最近连接'), valueType: 'datetime' },
            { key: 'lastDisconnectedAt', label: text('Last Disconnected', '最近断开'), valueType: 'datetime' },
            { key: 'lastCallbackAt', label: text('Last Callback', '最近回调'), valueType: 'datetime' },
            { key: 'lastPingAt', label: text('Last Ping', '最近心跳'), valueType: 'datetime' },
            { key: 'lastError', label: text('Last Error', '最近错误'), valueType: 'text' },
            { key: 'reconnectAttempts', label: text('Reconnect Attempts', '重连次数'), valueType: 'number' },
            { key: 'disabledReason', label: text('Disabled Reason', '停止/禁用原因'), valueType: 'text' }
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
              title: text('Disconnect WeCom long connection', '断开企微长连接'),
              message: text(
                'Disconnect the current WeCom long connection session?',
                '确认断开当前企微长连接会话吗？'
              )
            }
          }
        ]
      }
    ]
  }

  async getViewData(
    context: WeComViewHostContext,
    viewKey: string,
    _query: WeComViewQuery
  ): Promise<WeComViewDataResult> {
    if (viewKey !== 'status') {
      return {}
    }

    return {
      summary: await this.getStatusSummary(context)
    }
  }

  async executeViewAction(
    context: WeComViewHostContext,
    viewKey: string,
    actionKey: string,
    _request: WeComViewActionRequest
  ): Promise<WeComViewActionResult> {
    if (viewKey !== 'status') {
      return {
        success: false,
        message: text('Unsupported action', '不支持的操作')
      }
    }

    if (actionKey === 'refresh') {
      return {
        success: true,
        message: text('WeCom view refreshed', 'WeCom 视图已刷新'),
        refresh: true
      }
    }

    const integration = await this.wecomChannel.readIntegrationById(context.hostId)
    if (!integration || integration.provider !== INTEGRATION_WECOM_LONG) {
      return {
        success: false,
        message: text('Integration not found', '未找到集成')
      }
    }

    try {
      if (actionKey === 'reconnect') {
        await this.longConnectionService.reconnect(context.hostId)
        return {
          success: true,
          message: text('WeCom long connection reconnected', 'WeCom 长连接已重连'),
          refresh: true
        }
      }

      if (actionKey === 'disconnect') {
        await this.longConnectionService.disconnect(context.hostId)
        return {
          success: true,
          message: text('WeCom long connection disconnected', 'WeCom 长连接已断开'),
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

  private async getStatusSummary(context: WeComViewHostContext): Promise<WeComStatusSummary> {
    const fallback = buildFallbackStatusSummary(context.hostSnapshot)
    const [runtimeResult, integrationResult] = await Promise.allSettled([
      this.longConnectionService.status(context.hostId),
      this.wecomChannel.readIntegrationById(context.hostId)
    ])

    const runtimeStatus = runtimeResult.status === 'fulfilled' ? runtimeResult.value : null
    const integration =
      integrationResult.status === 'fulfilled'
        ? (integrationResult.value as { name?: string; options?: TIntegrationWeComLongOptions } | null)
        : null

    const botUser =
      normalizeText(integration?.name) ||
      normalizeText(integration?.options?.botId) ||
      fallback.botUser

    return {
      connectionMode: runtimeStatus?.connectionMode ?? fallback.connectionMode,
      state: runtimeStatus?.state ?? fallback.state,
      botUser,
      ownerInstanceId: runtimeStatus?.ownerInstanceId ?? null,
      lastConnectedAt: formatDateTime(runtimeStatus?.lastConnectedAt ?? null),
      lastDisconnectedAt: formatDateTime(runtimeStatus?.lastDisconnectedAt ?? null),
      lastCallbackAt: formatDateTime(runtimeStatus?.lastCallbackAt ?? null),
      lastPingAt: formatDateTime(runtimeStatus?.lastPingAt ?? null),
      lastError: normalizeText(runtimeStatus?.lastError) ?? fallback.lastError,
      reconnectAttempts: runtimeStatus?.reconnectAttempts ?? 0,
      disabledReason: normalizeText(runtimeStatus?.disabledReason) ?? null
    }
  }
}

function buildFallbackStatusSummary(
  snapshot: Record<string, unknown> | undefined
): WeComStatusSummary {
  const provider = getStringProperty(snapshot, 'provider')
  const state = getStringProperty(snapshot, 'status') || 'idle'
  return {
    connectionMode: provider === INTEGRATION_WECOM_LONG ? 'long_connection' : 'webhook',
    state,
    botUser: getStringProperty(snapshot, 'name') || getStringProperty(snapshot, 'botId'),
    ownerInstanceId: null,
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    lastCallbackAt: null,
    lastPingAt: null,
    lastError: null,
    reconnectAttempts: 0,
    disabledReason: null
  }
}

function getStringProperty(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const candidate = Reflect.get(value, key)
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null
}

function normalizeText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function formatDateTime(value: number | null | undefined): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? new Date(value).toISOString() : null
}
