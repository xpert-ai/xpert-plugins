import type {
  I18nObject,
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery
} from '@xpert-ai/contracts'
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
import {
  LarkLongConnectionService,
  LarkManagedConnectionInfo
} from '../lark-long-connection.service.js'
import { LARK_PLUGIN_NAME, LARK_VIEW_PROVIDER_KEY } from '../constants.js'
import { LarkMessageHistoryService } from '../lark-message-history.service.js'
import type { LarkMessageFileEntity, LarkMessageLogEntity } from '../entities/index.js'
import {
  LARK_MESSAGE_HISTORY_REMOTE_ENTRY,
  renderLarkMessageHistoryRemoteHtml
} from './lark-message-history.remote.js'

const DEFAULT_PAGE_SIZE = 10

const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

type LarkStatusSummary = {
  connectionMode: string
  state: string
  connectionKey: string | null
  direction: string | null
  transportType: string | null
  botUser: string | null
  ownerInstanceId: string | null
  lastSeenAt: string | null
  lastConnectedAt: string | null
  lastError: string | null
}

type LarkConnectionViewRow = {
  id: string
  connectionKey: string
  status: string
  direction: string
  transportType: string
  ownerInstanceId: string | null
  connectedAt: string | null
  lastSeenAt: string | null
  leaseExpiresAt: string | null
  integrationCount: number
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

type LarkMessageViewRow = {
  id: string
  createdAt: string | null
  direction: string
  status: string
  conversation: string
  sender: string | null
  messageType: string | null
  content: string | null
  attachmentStatus: string | null
  botMentioned: boolean
  xpertId: string
  error: string | null
}

@Injectable()
@ViewExtensionProvider(LARK_VIEW_PROVIDER_KEY)
export class LarkIntegrationViewProvider implements IXpertViewExtensionProvider {
  constructor(
    private readonly longConnectionService: LarkLongConnectionService,
    private readonly larkChannel: LarkChannelStrategy,
    private readonly recipientDirectoryService: LarkRecipientDirectoryService,
    private readonly conversationService: LarkConversationService,
    private readonly messageHistoryService: LarkMessageHistoryService
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
          provider: LARK_VIEW_PROVIDER_KEY,
          plugin: LARK_PLUGIN_NAME
        },
        view: {
          type: 'stats',
          items: [
            { key: 'connectionMode', label: text('Connection Mode', '连接方式'), valueType: 'text' },
            { key: 'state', label: text('State', '状态'), valueType: 'status' },
            { key: 'connectionKey', label: text('Connection Key', '连接 Key'), valueType: 'text' },
            { key: 'direction', label: text('Direction', '方向'), valueType: 'text' },
            { key: 'transportType', label: text('Transport', '传输'), valueType: 'text' },
            { key: 'botUser', label: text('Bot User', '机器人用户'), valueType: 'text' },
            { key: 'ownerInstanceId', label: text('Owner Instance', '持有实例'), valueType: 'text' },
            { key: 'lastSeenAt', label: text('Last Heartbeat', '最近心跳'), valueType: 'datetime' },
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
        key: 'connections',
        title: text('Connections', '连接'),
        hostType: context.hostType,
        slot,
        order: 20,
        refreshable: true,
        source: {
          provider: LARK_VIEW_PROVIDER_KEY,
          plugin: LARK_PLUGIN_NAME
        },
        view: {
          type: 'table',
          columns: [
            { key: 'status', label: text('Status', '状态'), sortable: true },
            { key: 'direction', label: text('Direction', '方向'), sortable: true },
            { key: 'connectionKey', label: text('Connection Key', '连接 Key'), searchable: true, sortable: true },
            { key: 'transportType', label: text('Transport', '传输'), sortable: true },
            { key: 'ownerInstanceId', label: text('Owner Instance', '持有实例'), searchable: true, sortable: true },
            { key: 'lastSeenAt', label: text('Last Heartbeat', '最近心跳'), sortable: true },
            { key: 'connectedAt', label: text('Connected At', '连接时间'), sortable: true },
            { key: 'integrationCount', label: text('Integrations', '集成数'), sortable: true },
            { key: 'lastError', label: text('Last Error', '最近错误'), searchable: true }
          ],
          pagination: {
            enabled: false,
            pageSize: DEFAULT_PAGE_SIZE
          },
          search: {
            enabled: false
          }
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
        order: 30,
        source: {
          provider: LARK_VIEW_PROVIDER_KEY,
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
        order: 40,
        source: {
          provider: LARK_VIEW_PROVIDER_KEY,
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
      },
      {
        key: 'messages',
        title: text('Messages', '消息'),
        hostType: context.hostType,
        slot,
        order: 50,
        refreshable: true,
        source: {
          provider: LARK_VIEW_PROVIDER_KEY,
          plugin: LARK_PLUGIN_NAME
        },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: LARK_MESSAGE_HISTORY_REMOTE_ENTRY
          },
          dataSource: {
            mode: 'platform'
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
            enabled: false
          }
        }
      }
    ]
  }

  getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): XpertRemoteComponentEntry {
    if (viewKey !== 'messages' || component.entry !== LARK_MESSAGE_HISTORY_REMOTE_ENTRY) {
      return {
        html: '<!doctype html><html><body>Unsupported Lark remote component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }

    return {
      html: renderLarkMessageHistoryRemoteHtml(),
      contentType: 'text/html; charset=utf-8'
    }
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

    if (viewKey === 'connections') {
      const connections = await this.longConnectionService.listManagedConnections(context.hostId)
      return {
        items: connections.map((item) => this.mapConnectionRow(item)),
        total: connections.length
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

    if (viewKey === 'messages') {
      const result = await this.messageHistoryService.listMessageLogs({
        integrationId: context.hostId,
        tenantId: context.tenantId,
        organizationId: context.organizationId,
        cursor: query.cursor,
        page: query.page,
        pageSize: query.pageSize,
        search: query.search,
        sortBy: normalizeMessageSort(query.sortBy),
        sortDirection: query.sortDirection ?? null
      })
      const files = await this.messageHistoryService.listMessageFiles({
        integrationId: context.hostId,
        tenantId: context.tenantId,
        organizationId: context.organizationId,
        messageLogIds: result.items.map((item) => item.id)
      })
      const filesByLogId = groupMessageFiles(files)

      return {
        items: result.items.map((item) => this.mapMessageRow(item, filesByLogId.get(item.id) ?? [])),
        total: result.total,
        ...(result.nextCursor ? { nextCursor: result.nextCursor } : {})
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
    if (viewKey !== 'status' && viewKey !== 'connections' && viewKey !== 'messages') {
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
      connectionKey: runtimeStatus?.connectionKey ?? null,
      direction: runtimeStatus?.direction ?? null,
      transportType: runtimeStatus?.transportType ?? null,
      botUser,
      ownerInstanceId: runtimeStatus?.ownerInstanceId ?? null,
      lastSeenAt: formatDateTime(runtimeStatus?.lastSeenAt ?? null),
      lastConnectedAt: formatDateTime(runtimeStatus?.lastConnectedAt ?? null),
      lastError: normalizeText(runtimeStatus?.lastError) ?? fallback.lastError
    }
  }

  private mapConnectionRow(item: LarkManagedConnectionInfo): LarkConnectionViewRow {
    return {
      id: item.connectionKey,
      connectionKey: item.connectionKey,
      status: item.status,
      direction: item.direction,
      transportType: item.transportType,
      ownerInstanceId: item.ownerInstanceId,
      connectedAt: item.connectedAt,
      lastSeenAt: item.lastSeenAt,
      leaseExpiresAt: item.leaseExpiresAt,
      integrationCount: item.integrationCount,
      lastError: item.lastError
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

  private mapMessageRow(item: LarkMessageLogEntity, files: LarkMessageFileEntity[]): LarkMessageViewRow {
    return {
      id: item.id,
      createdAt: formatDateTime(item.createdAt),
      direction: item.direction,
      status: item.status,
      conversation: item.chatId ?? item.scopeKey,
      sender: item.senderName ?? item.senderOpenId ?? null,
      messageType: item.messageType ?? null,
      content: item.content ?? null,
      attachmentStatus: summarizeAttachmentStatuses(files),
      botMentioned: item.botMentioned,
      xpertId: item.xpertId,
      error: item.error ?? null
    }
  }
}

function normalizeMessageSort(
  value: string | null | undefined
): 'createdAt' | 'messageCreatedAt' | 'direction' | 'status' | 'senderName' | 'botMentioned' | null {
  return value === 'createdAt' ||
    value === 'messageCreatedAt' ||
    value === 'direction' ||
    value === 'status' ||
    value === 'senderName' ||
    value === 'botMentioned'
    ? value
    : null
}

function groupMessageFiles(files: LarkMessageFileEntity[]): Map<string, LarkMessageFileEntity[]> {
  const result = new Map<string, LarkMessageFileEntity[]>()
  for (const file of files) {
    const items = result.get(file.messageLogId) ?? []
    items.push(file)
    result.set(file.messageLogId, items)
  }
  return result
}

function summarizeAttachmentStatuses(files: LarkMessageFileEntity[]): string | null {
  if (!files.length) {
    return null
  }
  const counts = new Map<string, number>()
  for (const file of files) {
    counts.set(file.status, (counts.get(file.status) ?? 0) + 1)
  }
  return [...counts.entries()].map(([status, count]) => `${status} (${count})`).join(', ')
}

function buildFallbackStatusSummary(hostSnapshot: unknown): LarkStatusSummary {
  return {
    connectionMode: getStringProperty(hostSnapshot, 'connectionMode') ?? 'webhook',
    state: getStringProperty(hostSnapshot, 'status') ?? 'idle',
    connectionKey: null,
    direction: null,
    transportType: null,
    botUser: getStringProperty(hostSnapshot, 'botUser'),
    ownerInstanceId: null,
    lastSeenAt: null,
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
