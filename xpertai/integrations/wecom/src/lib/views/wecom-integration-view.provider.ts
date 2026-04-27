import type { I18nObject } from '@metad/contracts'
import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common'
import { getErrorMessage } from '@xpert-ai/plugin-sdk'
import {
  WeComConversationBindingListItem,
  WeComConversationService
} from '../conversation.service.js'
import { WeComChannelStrategy } from '../wecom-channel.strategy.js'
import { WeComLongConnectionService } from '../wecom-long-connection.service.js'
import {
  INTEGRATION_WECOM,
  INTEGRATION_WECOM_LONG,
  TIntegrationWeComLongOptions
} from '../types.js'

const WECOM_PLUGIN_NAME = '@xpert-ai/plugin-wecom'
const WECOM_PROVIDER_KEY = 'wecom_long_integration'
const STRATEGY_META_KEY = 'XPERT_STRATEGY_META_KEY'
const VIEW_EXTENSION_PROVIDER = 'VIEW_EXTENSION_PROVIDER'
const DEFAULT_PAGE_SIZE = 10

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

type WeComConversationViewRow = {
  id: string
  chatType: string | null
  chatId: string | null
  senderId: string | null
  xpertId: string
  conversationId: string
  updatedAt: string | null
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
  view: Record<string, unknown>
  dataSource: Record<string, unknown>
  actions?: Array<Record<string, unknown>>
}

type WeComViewQuery = {
  page?: number
  pageSize?: number
  search?: string | null
  sortBy?: string | null
  sortDirection?: 'asc' | 'desc' | null
}

type WeComViewDataResult = {
  summary?: WeComStatusSummary
  items?: Array<Record<string, unknown>>
  total?: number
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
    private readonly wecomChannel: WeComChannelStrategy,
    private readonly conversationService: WeComConversationService
  ) {}

  supports(context: WeComViewHostContext) {
    if (context.hostType !== 'integration') {
      return false
    }

    return [getStringProperty(context.hostSnapshot, 'provider'), getStringProperty(context.hostSnapshot, 'type')].some(
      isWeComProviderValue
    )
  }

  getViewManifests(context: WeComViewHostContext, slot: string): WeComViewManifest[] {
    if (slot !== 'detail.main_tabs') {
      return []
    }

    const provider = resolveWeComProviderValue(context.hostSnapshot)
    const manifests: WeComViewManifest[] = []

    if (provider === INTEGRATION_WECOM_LONG) {
      manifests.push(this.buildStatusManifest(context, slot))
    }

    manifests.push(this.buildConversationsManifest(context, slot))
    return manifests
  }

  async getViewData(
    context: WeComViewHostContext,
    viewKey: string,
    query: WeComViewQuery
  ): Promise<WeComViewDataResult> {
    if (viewKey === 'status') {
      return {
        summary: await this.getStatusSummary(context)
      }
    }

    if (viewKey === 'conversations') {
      const result = await this.conversationService.listBindingsByIntegration(context.hostId, {
        page: query.page,
        pageSize: query.pageSize,
        search: query.search,
        sortBy: query.sortBy,
        sortDirection: query.sortDirection ?? null
      })

      return {
        items: result.items.map((item) => this.mapConversationRow(item)),
        total: result.total
      }
    }

    return {}
  }

  async executeViewAction(
    context: WeComViewHostContext,
    viewKey: string,
    actionKey: string,
    request: WeComViewActionRequest
  ): Promise<WeComViewActionResult> {
    if (viewKey === 'status' && actionKey === 'refresh') {
      return {
        success: true,
        message: text('WeCom view refreshed', 'WeCom 视图已刷新'),
        refresh: true
      }
    }

    try {
      if (viewKey === 'conversations' && actionKey === 'restart_conversation') {
        const targetId = normalizeText(request.targetId)
        if (!targetId) {
          return {
            success: false,
            message: text('Missing conversation target', '缺少可重置的会话目标')
          }
        }

        await this.conversationService.restartConversationBinding(context.hostId, targetId)
        return {
          success: true,
          message: text(
            'New conversation started. Please continue asking.',
            '已开启新会话，请继续提问'
          ),
          refresh: true
        }
      }

      if (viewKey !== 'status') {
        return {
          success: false,
          message: text('Unsupported action', '不支持的操作')
        }
      }

      const integration = await this.wecomChannel.readIntegrationById(context.hostId)
      if (!integration || integration.provider !== INTEGRATION_WECOM_LONG) {
        return {
          success: false,
          message: text('Integration not found', '未找到集成')
        }
      }

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

  private buildStatusManifest(context: WeComViewHostContext, slot: string): WeComViewManifest {
    return {
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
  }

  private buildConversationsManifest(context: WeComViewHostContext, slot: string): WeComViewManifest {
    return {
      key: 'conversations',
      title: text('Conversations', '会话'),
      hostType: context.hostType,
      slot,
      order: 30,
      source: {
        provider: WECOM_PROVIDER_KEY,
        plugin: WECOM_PLUGIN_NAME
      },
      view: {
        type: 'table',
        columns: [
          { key: 'chatType', label: text('Chat Type', '会话类型'), sortable: true },
          { key: 'chatId', label: text('Chat ID', '会话 ID'), searchable: true, sortable: true },
          { key: 'senderId', label: text('Sender ID', '发送者 ID'), searchable: true, sortable: true },
          { key: 'xpertId', label: text('Xpert ID', '数字专家 ID'), searchable: true, sortable: true },
          { key: 'conversationId', label: text('Conversation ID', '对话 ID'), searchable: true, sortable: true },
          { key: 'updatedAt', label: text('Updated At', '更新时间'), sortable: true, dataType: 'datetime' }
        ],
        pagination: {
          enabled: true,
          pageSize: DEFAULT_PAGE_SIZE
        },
        search: {
          enabled: true,
          placeholder: text('Search conversations', '搜索会话')
        }
      },
      dataSource: {
        mode: 'platform',
        querySchema: {
          supportsPagination: true,
          supportsSearch: true,
          supportsSort: true,
          defaultPageSize: DEFAULT_PAGE_SIZE
        },
        cache: {
          ttlMs: 30 * 1000
        }
      },
      actions: [
        {
          key: 'restart_conversation',
          label: text('Restart Conversation', '重置会话'),
          icon: 'ri-restart-line',
          placement: 'row',
          actionType: 'invoke',
          confirm: {
            title: text('Restart WeCom conversation', '重新开始企微会话'),
            message: text(
              'This uses the same logic as /new. The current session state will be cleared, and the next message will start a new conversation.',
              '这会执行与 /new 一致的逻辑：清空当前会话状态，下一条消息将从新会话开始。'
            )
          }
        }
      ]
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

  private mapConversationRow(item: WeComConversationBindingListItem): WeComConversationViewRow {
    return {
      id: item.id,
      chatType: normalizeText(item.chatType),
      chatId: normalizeText(item.chatId),
      senderId: normalizeText(item.senderId),
      xpertId: item.xpertId,
      conversationId: item.conversationId,
      updatedAt: formatDateTime(item.updatedAt)
    }
  }
}

function resolveWeComProviderValue(
  snapshot: Record<string, unknown> | undefined
): typeof INTEGRATION_WECOM | typeof INTEGRATION_WECOM_LONG | null {
  const candidates = [getStringProperty(snapshot, 'provider'), getStringProperty(snapshot, 'type')]
  for (const candidate of candidates) {
    if (candidate === INTEGRATION_WECOM || candidate === INTEGRATION_WECOM_LONG) {
      return candidate
    }
  }

  return null
}

function isWeComProviderValue(value: string | null): boolean {
  return value === INTEGRATION_WECOM || value === INTEGRATION_WECOM_LONG
}

function buildFallbackStatusSummary(
  snapshot: Record<string, unknown> | undefined
): WeComStatusSummary {
  const provider = resolveWeComProviderValue(snapshot)
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
