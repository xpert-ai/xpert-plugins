import { Injectable } from '@nestjs/common'
import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import type {
  IconDefinition,
  I18nObject,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery
} from '@xpert-ai/contracts'
import {
  IXpertViewExtensionProvider,
  renderRemoteReactIframeHtml,
  ViewExtensionProvider,
  getErrorMessage
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  WECHAT_PERSONAL_FEATURE,
  WECHAT_PERSONAL_ICON,
  WECHAT_PERSONAL_PLUGIN_NAME,
  WECHAT_PERSONAL_PROVIDER_KEY,
  WECHAT_PERSONAL_REMOTE_ENTRY_KEY,
  WECHAT_PERSONAL_VIEW_KEY,
  WECHAT_PERSONAL_VIEW_PROVIDER_KEY
} from '../constants.js'
import { WechatPersonalConversationService } from '../conversation.service.js'
import type { WechatPersonalWorkbenchTableKey, WechatPersonalWorkbenchTableQuery } from '../conversation.service.js'
import { WechatPersonalChannelStrategy } from '../wechat-personal-channel.strategy.js'

const __filename = fileURLToPath(import.meta.url)
const moduleDir = dirname(__filename)
const requireFromHere = createRequire(__filename)
const INTEGRATION_DETAIL_MAIN_TABS_SLOT = 'detail.main_tabs'
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const WECHAT_PERSONAL_VIEW_ICON = {
  type: 'svg',
  value: WECHAT_PERSONAL_ICON,
  alt: 'Personal WeChat'
} satisfies IconDefinition
type SdkViewManifestsResult = ReturnType<IXpertViewExtensionProvider['getViewManifests']>
type SdkViewManifest = Awaited<SdkViewManifestsResult>[number]
// plugin-sdk 3.10 still types view icons as strings, while contracts 3.11 accepts IconDefinition.
const WECHAT_PERSONAL_VIEW_ICON_FOR_SDK = WECHAT_PERSONAL_VIEW_ICON as unknown as SdkViewManifest['icon']

@Injectable()
@ViewExtensionProvider(WECHAT_PERSONAL_VIEW_PROVIDER_KEY)
export class WechatPersonalViewProvider implements IXpertViewExtensionProvider {
  constructor(
    private readonly conversationService: WechatPersonalConversationService,
    private readonly wechatChannel: WechatPersonalChannelStrategy
  ) {}

  supports(context: XpertResolvedViewHostContext) {
    if (context.hostType === 'agent') {
      return true
    }
    if (context.hostType !== 'integration') {
      return false
    }
    return [getStringProperty(context.hostSnapshot, 'provider'), getStringProperty(context.hostSnapshot, 'type')].some(
      (value) => value === WECHAT_PERSONAL_PROVIDER_KEY
    )
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): SdkViewManifestsResult {
    if (!isSupportedSlot(context, slot)) {
      return []
    }

    const isAgentFixedWorkbench = context.hostType === 'agent' && slot === AGENT_WORKBENCH_FIXED_SLOT
    const requiresFeatureActivation = context.hostType === 'agent'

    return [
      {
        key: WECHAT_PERSONAL_VIEW_KEY,
        title: text('Personal WeChat', '个人微信'),
        description: text(
          'Manage wx2.0 accounts, conversations, message logs, callbacks, and dispatch settings.',
          '管理 wx2.0 账号、会话、消息日志、回调和派发配置。'
        ),
        icon: WECHAT_PERSONAL_VIEW_ICON_FOR_SDK,
        hostType: context.hostType,
        slot,
        order: 40,
        refreshable: true,
        ...(requiresFeatureActivation
          ? {
              activation: {
                requiredFeatures: [WECHAT_PERSONAL_FEATURE]
              }
            }
          : {}),
        ...(isAgentFixedWorkbench
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Personal WeChat', '个人微信'),
                  order: 40,
                  icon: WECHAT_PERSONAL_VIEW_ICON_FOR_SDK
                }
              }
            }
          : {}),
        source: {
          provider: WECHAT_PERSONAL_VIEW_PROVIDER_KEY,
          plugin: WECHAT_PERSONAL_PLUGIN_NAME
        },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: WECHAT_PERSONAL_REMOTE_ENTRY_KEY
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
            supportsParameters: true,
            defaultPageSize: 30
          },
          cache: {
            enabled: false
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
            key: 'register_callback',
            label: text('Register Callback', '注册回调'),
            icon: 'ri-link',
            actionType: 'invoke'
          },
          {
            key: 'restart_conversation',
            label: text('Restart Conversation', '重置会话'),
            icon: 'ri-restart-line',
            actionType: 'invoke'
          },
          {
            key: 'send_text',
            label: text('Send Text', '发送文本'),
            icon: 'ri-send-plane-line',
            actionType: 'invoke'
          },
          {
            key: 'resend_message',
            label: text('Resend AI Reply', '重发 AI 回复'),
            icon: 'ri-repeat-line',
            actionType: 'invoke'
          },
          {
            key: 'set_account_enabled',
            label: text('Toggle Account', '启停账号'),
            icon: 'ri-toggle-line',
            actionType: 'invoke'
          }
        ]
      }
    ]
  }

  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== WECHAT_PERSONAL_VIEW_KEY || component.entry !== WECHAT_PERSONAL_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported remote component entry.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }

    const appScript = await readFile(
      join(moduleDir, '..', 'remote-components', WECHAT_PERSONAL_REMOTE_ENTRY_KEY, 'app.js'),
      'utf8'
    )
    const react = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')

    return {
      html: renderRemoteReactIframeHtml({
        title: 'Personal WeChat Workbench',
        lang: 'zh-Hans',
        reactUmd: react,
        reactDomUmd: reactDom,
        appScript
      }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    if (viewKey !== WECHAT_PERSONAL_VIEW_KEY) {
      return {}
    }

    const parameters = normalizeViewParameters(query.parameters)
    const integrationId = await this.resolveIntegrationId(context, parameters)
    const table = getTableKey(parameters)
    const tableQuery = getTableQuery(query, parameters)
    if (!integrationId) {
      if (context.hostType === 'agent') {
        if (table) {
          return {
            scope: 'organization',
            integrationId: null,
            tableKey: table,
            table: await this.conversationService.getOrganizationWorkbenchTableData(table, tableQuery)
          } as XpertViewDataResult
        }
        return this.conversationService.getOrganizationWorkbenchData({
          search: query.search,
          page: query.page,
          pageSize: query.pageSize
        }) as Promise<XpertViewDataResult>
      }
      return {
        missingIntegration: true,
        message: text('Select a personal WeChat integration to view runtime data.', '请选择个人微信集成后查看运行数据。')
      } as XpertViewDataResult
    }

    if (table) {
      return {
        scope: 'integration',
        integrationId,
        tableKey: table,
        table: await this.conversationService.getWorkbenchTableData(integrationId, table, tableQuery)
      } as XpertViewDataResult
    }

    return this.conversationService.getWorkbenchData(integrationId, {
      search: query.search,
      page: query.page,
      pageSize: query.pageSize
    }) as Promise<XpertViewDataResult>
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== WECHAT_PERSONAL_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }

    try {
      if (actionKey === 'refresh') {
        return success('Personal WeChat view refreshed', '个人微信视图已刷新')
      }

      const integrationId = await this.resolveIntegrationId(context, request.parameters, request.input)
      if (!integrationId) {
        return failure('Missing integration id', '缺少个人微信集成标识')
      }

      if (actionKey === 'restart_conversation') {
        const targetId = getStringInput(request.input, 'bindingId') || getStringInput(request.input, 'id') || request.targetId
        if (!targetId) {
          return failure('Missing conversation target', '缺少可重置的会话目标')
        }
        await this.conversationService.restartConversationBinding(integrationId, String(targetId))
        return success('Conversation reset', '会话已重置')
      }

      if (actionKey === 'register_callback') {
        const integration = await this.wechatChannel.readIntegrationById(integrationId)
        if (!integration) {
          return failure('Integration not found', '未找到个人微信集成')
        }
        const uuid = requireStringInput(request.input, 'uuid', 'Account uuid is required.')
        const callbackConfig = this.conversationService.buildCallbackConfig(
          integration.id,
          integration.options?.callbackSecret
        )
        const result = await this.wechatChannel.registerCallback({
          integrationId,
          uuid,
          callbackUrl: getStringInput(request.input, 'callbackUrl') || callbackConfig.webhookUrl,
          enabled: getBooleanInput(request.input, 'enabled', true)
        })
        if (!result.success) {
          return failure(result.error || 'Register callback failed', result.error || '注册回调失败')
        }
        return success('Callback registered', '回调已注册')
      }

      if (actionKey === 'send_text') {
        const result = await this.wechatChannel.sendTextByIntegrationId(integrationId, {
          uuid: requireStringInput(request.input, 'uuid', 'Account uuid is required.'),
          contactId: requireStringInput(request.input, 'contactId', 'Contact id is required.'),
          content: requireStringInput(request.input, 'content', 'Text content is required.'),
          atUsers: getStringArrayInput(request.input, 'atUsers')
        })
        if (!result.success) {
          return failure(result.error || 'Send text failed', result.error || '发送文本失败')
        }
        return success('Text sent', '文本已发送')
      }

      if (actionKey === 'resend_message') {
        const result = await this.conversationService.resendOutboundMessage(integrationId, request.targetId)
        if (!result.success) {
          return failure(result.error || 'Resend failed', result.error || '重发失败')
        }
        return success('AI reply resent', 'AI 回复已重发')
      }

      if (actionKey === 'set_account_enabled') {
        await this.conversationService.setAccountEnabled(
          integrationId,
          requireStringInput(request.input, 'uuid', 'Account uuid is required.'),
          getBooleanInput(request.input, 'enabled', true)
        )
        return success('Account setting updated', '账号接入设置已更新')
      }

      return failure('Unsupported action', '不支持的操作')
    } catch (error) {
      const message = getErrorMessage(error)
      return {
        success: false,
        message: text(message, message)
      }
    }
  }

  private async resolveIntegrationId(
    context: XpertResolvedViewHostContext,
    parameters?: Record<string, unknown> | null,
    input?: XpertViewActionRequest['input']
  ): Promise<string | null> {
    const explicitIntegrationId = getIntegrationId(context, parameters, input)
    if (explicitIntegrationId) {
      return explicitIntegrationId
    }

    if (context.hostType !== 'agent') {
      return null
    }

    const xpertId = getAgentXpertId(context)
    if (!xpertId) {
      return null
    }

    return this.conversationService.getBoundIntegrationIdForXpert(xpertId)
  }
}

async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
}

function isSupportedSlot(context: XpertResolvedViewHostContext, slot: string) {
  if (context.hostType === 'integration') {
    return slot === INTEGRATION_DETAIL_MAIN_TABS_SLOT
  }
  if (context.hostType === 'agent') {
    return slot === AGENT_WORKBENCH_FIXED_SLOT || slot === AGENT_WORKBENCH_MAIN_SLOT
  }
  return false
}

function normalizeViewParameters(parameters: unknown): Record<string, unknown> {
  if (!parameters) {
    return {}
  }
  if (typeof parameters === 'string') {
    return parseJsonObject(parameters)
  }
  if (typeof parameters === 'object' && !Array.isArray(parameters)) {
    return parameters as Record<string, unknown>
  }
  return {}
}

function getTableKey(parameters?: Record<string, unknown> | null): WechatPersonalWorkbenchTableKey | null {
  const value = getStringProperty(parameters, 'table')
  return value === 'accounts' || value === 'conversations' || value === 'messages' || value === 'logs' ? value : null
}

function getTableQuery(
  query: XpertViewQuery,
  parameters: Record<string, unknown> = normalizeViewParameters(query.parameters)
): WechatPersonalWorkbenchTableQuery {
  const rawFilters = (parameters as Record<string, unknown>).filters
  const filtersFromJson = parseJsonObject(getStringProperty(parameters, 'filtersJson'))
  return {
    search: query.search,
    page: query.page,
    pageSize: query.pageSize,
    filters:
      rawFilters && typeof rawFilters === 'object' && !Array.isArray(rawFilters)
        ? (rawFilters as Record<string, unknown>)
        : filtersFromJson
  }
}

function parseJsonObject(value: string): Record<string, unknown> {
  if (!value) {
    return {}
  }
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function getIntegrationId(
  context: XpertResolvedViewHostContext,
  parameters?: Record<string, unknown> | null,
  input?: XpertViewActionRequest['input']
): string | null {
  if (context.hostType === 'integration') {
    return context.hostId || null
  }
  return (
    getStringProperty(parameters, 'integrationId') ||
    getStringInput(input, 'integrationId') ||
    getStringProperty(context.hostSnapshot, 'integrationId') ||
    null
  )
}

function getStringProperty(record: unknown, key: string): string {
  if (!record || typeof record !== 'object') {
    return ''
  }
  const rawValue = (record as Record<string, unknown>)[key]
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue
  if (typeof value === 'string') {
    return value.trim()
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return ''
}

function getAgentXpertId(context: XpertResolvedViewHostContext): string {
  if (context.hostType !== 'agent') {
    return ''
  }
  return getStringProperty(context, 'hostId') || getStringProperty(context.hostSnapshot, 'id')
}

function getStringInput(input: XpertViewActionRequest['input'] | undefined, key: string): string {
  return getStringProperty(input, key)
}

function requireStringInput(input: XpertViewActionRequest['input'] | undefined, key: string, error: string): string {
  const value = getStringInput(input, key)
  if (!value) {
    throw new Error(error)
  }
  return value
}

function getBooleanInput(input: XpertViewActionRequest['input'] | undefined, key: string, defaultValue: boolean): boolean {
  if (!input || typeof input !== 'object') {
    return defaultValue
  }
  const value = (input as Record<string, unknown>)[key]
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    return ['true', '1', 'yes'].includes(value.trim().toLowerCase())
  }
  return defaultValue
}

function getStringArrayInput(input: XpertViewActionRequest['input'] | undefined, key: string): string[] {
  if (!input || typeof input !== 'object') {
    return []
  }
  const value = (input as Record<string, unknown>)[key]
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
  }
  if (typeof value === 'string') {
    return value
      .split(/[,\n，]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

function success(en_US: string, zh_Hans: string): XpertViewActionResult {
  return {
    success: true,
    message: text(en_US, zh_Hans),
    refresh: true
  }
}

function failure(en_US: string, zh_Hans: string): XpertViewActionResult {
  return {
    success: false,
    message: text(en_US, zh_Hans)
  }
}
