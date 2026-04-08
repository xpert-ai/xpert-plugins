import type {
  I18nObject,
  XpertExtensionViewManifest,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery
} from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { IXpertViewExtensionProvider, ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import {
  LarkConversationBindingListItem,
  LarkConversationService
} from '../conversation.service.js'
import {
  LarkRecipientDirectoryListItem,
  LarkRecipientDirectoryService
} from '../lark-recipient-directory.service.js'
import { LarkChannelStrategy } from '../lark-channel.strategy.js'
import { LarkLongConnectionService } from '../lark-long-connection.service.js'

const LARK_PLUGIN_NAME = '@xpert-ai/plugin-lark'
const LARK_PROVIDER_KEY = 'lark_integration'
const DEFAULT_PAGE_SIZE = 10

const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

type LarkStatusSummary = {
  connectionMode: string
  state: string
  botUser: string | null
  ownerInstanceId: string | null
  lastConnectedAt: string | null
  lastError: string | null
}

type LarkUserViewRow = {
  id: string
  name: string
  openId: string
  source: string
  lastSeenAt: string | null
}

type LarkConversationViewRow = {
  id: string
  chatType: string | null
  chatId: string | null
  senderOpenId: string | null
  xpertId: string
  conversationId: string
  updatedAt: string | null
}

@Injectable()
@ViewExtensionProvider(LARK_PROVIDER_KEY)
export class LarkIntegrationViewProvider implements IXpertViewExtensionProvider {
  constructor(
    private readonly longConnectionService: LarkLongConnectionService,
    private readonly larkChannel: LarkChannelStrategy,
    private readonly recipientDirectoryService: LarkRecipientDirectoryService,
    private readonly conversationService: LarkConversationService
  ) {}

  supports(context: XpertResolvedViewHostContext) {
    if (context.hostType !== 'integration') {
      return false
    }

    return [getStringProperty(context.hostSnapshot, 'provider'), getStringProperty(context.hostSnapshot, 'type')].some(
      isLarkProviderValue
    )
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
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
          provider: LARK_PROVIDER_KEY,
          plugin: LARK_PLUGIN_NAME
        },
        view: {
          type: 'stats',
          items: [
            { key: 'connectionMode', label: text('Connection Mode', '连接方式'), valueType: 'text' },
            { key: 'state', label: text('State', '状态'), valueType: 'status' },
            { key: 'botUser', label: text('Bot User', '机器人用户'), valueType: 'text' },
            { key: 'ownerInstanceId', label: text('Owner Instance', '持有实例'), valueType: 'text' },
            { key: 'lastConnectedAt', label: text('Last Connected', '最近连接'), valueType: 'datetime' },
            { key: 'lastError', label: text('Last Error', '最近错误'), valueType: 'text' }
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
              title: text('Disconnect Lark long connection', '断开飞书长连接'),
              message: text(
                'Disconnect the current Lark long connection session?',
                '确认断开当前飞书长连接会话吗？'
              )
            }
          }
        ]
      },
      {
        key: 'users',
        title: text('Users', '用户'),
        hostType: context.hostType,
        slot,
        order: 20,
        source: {
          provider: LARK_PROVIDER_KEY,
          plugin: LARK_PLUGIN_NAME
        },
        view: {
          type: 'table',
          columns: [
            { key: 'name', label: text('Name', '名称'), searchable: true, sortable: true },
            { key: 'openId', label: text('Open ID', 'Open ID'), searchable: true, sortable: true },
            { key: 'source', label: text('Source', '来源'), sortable: true },
            { key: 'lastSeenAt', label: text('Last Seen', '最近出现'), sortable: true }
          ],
          pagination: {
            enabled: true,
            pageSize: DEFAULT_PAGE_SIZE
          },
          search: {
            enabled: true,
            placeholder: text('Search users', '搜索用户')
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
        }
      },
      {
        key: 'conversations',
        title: text('Conversations', '会话'),
        hostType: context.hostType,
        slot,
        order: 30,
        source: {
          provider: LARK_PROVIDER_KEY,
          plugin: LARK_PLUGIN_NAME
        },
        view: {
          type: 'table',
          columns: [
            { key: 'chatType', label: text('Chat Type', '会话类型'), sortable: true },
            { key: 'chatId', label: text('Chat ID', '会话 ID'), searchable: true, sortable: true },
            { key: 'senderOpenId', label: text('Sender Open ID', '发送者 Open ID'), searchable: true, sortable: true },
            { key: 'xpertId', label: text('Xpert ID', '数字专家 ID'), searchable: true, sortable: true },
            { key: 'conversationId', label: text('Conversation ID', '对话 ID'), searchable: true, sortable: true },
            { key: 'updatedAt', label: text('Updated At', '更新时间'), sortable: true }
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
        }
      }
    ]
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    if (viewKey === 'status') {
      const summary = await this.getStatusSummary(context)
      return {
        summary
      }
    }

    if (viewKey === 'users') {
      const result = await this.recipientDirectoryService.listByIntegration(context.hostId, {
        page: query.page,
        pageSize: query.pageSize,
        search: query.search,
        sortBy: query.sortBy,
        sortDirection: query.sortDirection ?? null
      })

      return {
        items: result.items.map((item) => this.mapUserRow(item)),
        total: result.total
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
        message: text('Lark view refreshed', 'Lark 视图已刷新'),
        refresh: true
      }
    }

    const integration = await this.larkChannel.readIntegrationById(context.hostId)
    if (!integration) {
      return {
        success: false,
        message: text('Integration not found', '未找到集成')
      }
    }

    if (this.larkChannel.resolveConnectionMode(integration) !== 'long_connection') {
      return {
        success: false,
        message: text(
          'This action is only available for long connection mode',
          '该操作仅适用于长连接模式'
        )
      }
    }

    try {
      if (actionKey === 'reconnect') {
        await this.longConnectionService.reconnect(context.hostId)
        return {
          success: true,
          message: text('Lark long connection reconnected', 'Lark 长连接已重连'),
          refresh: true
        }
      }

      if (actionKey === 'disconnect') {
        await this.longConnectionService.disconnect(context.hostId)
        return {
          success: true,
          message: text('Lark long connection disconnected', 'Lark 长连接已断开'),
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

  private async getStatusSummary(context: XpertResolvedViewHostContext): Promise<LarkStatusSummary> {
    const fallback = buildFallbackStatusSummary(context.hostSnapshot)
    const [runtimeResult, integrationResult] = await Promise.allSettled([
      this.longConnectionService.status(context.hostId),
      this.larkChannel.readIntegrationById(context.hostId)
    ])

    const runtimeStatus = runtimeResult.status === 'fulfilled' ? runtimeResult.value : null
    const integration = integrationResult.status === 'fulfilled' ? integrationResult.value : null

    let botUser = fallback.botUser
    if (integration) {
      try {
        const botInfo = await this.larkChannel.getBotInfo(integration)
        botUser = botInfo.name ?? botInfo.id ?? botUser
      } catch {
        //
      }
    }

    return {
      connectionMode:
        runtimeStatus?.connectionMode ??
        (integration ? this.larkChannel.resolveConnectionMode(integration) : fallback.connectionMode),
      state: runtimeStatus?.state ?? fallback.state,
      botUser,
      ownerInstanceId: runtimeStatus?.ownerInstanceId ?? null,
      lastConnectedAt: formatDateTime(runtimeStatus?.lastConnectedAt ?? null),
      lastError: normalizeText(runtimeStatus?.lastError) ?? fallback.lastError
    }
  }

  private mapUserRow(item: LarkRecipientDirectoryListItem): LarkUserViewRow {
    return {
      id: item.id,
      name: item.name,
      openId: item.openId,
      source: item.source,
      lastSeenAt: formatDateTime(item.lastSeenAt)
    }
  }

  private mapConversationRow(item: LarkConversationBindingListItem): LarkConversationViewRow {
    return {
      id: item.id,
      chatType: normalizeText(item.chatType),
      chatId: normalizeText(item.chatId),
      senderOpenId: normalizeText(item.senderOpenId),
      xpertId: item.xpertId,
      conversationId: item.conversationId,
      updatedAt: formatDateTime(item.updatedAt)
    }
  }
}

function buildFallbackStatusSummary(hostSnapshot: unknown): LarkStatusSummary {
  return {
    connectionMode: getStringProperty(hostSnapshot, 'connectionMode') ?? 'webhook',
    state: getStringProperty(hostSnapshot, 'status') ?? 'idle',
    botUser: getStringProperty(hostSnapshot, 'botUser'),
    ownerInstanceId: null,
    lastConnectedAt: null,
    lastError: null
  }
}

function getStringProperty(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !(key in value)) {
    return null
  }

  const candidate = Reflect.get(value, key)
  return normalizeText(candidate)
}

function isLarkProviderValue(value: string | null): boolean {
  return value?.trim().toLocaleLowerCase() === 'lark'
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length ? normalized : null
}

function formatDateTime(value: Date | number | string | null | undefined): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }

  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  if (typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? normalizeText(value) : date.toISOString()
  }

  return null
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return 'Unknown error'
}
