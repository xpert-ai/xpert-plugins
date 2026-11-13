/**
 * 工作台视图提供者：告诉平台“助手工作台里有一个缺料分析视图”，并处理视图的数据读取和按钮动作。
 *
 * - getViewManifests：声明视图（挂在哪个插槽、需要什么能力、允许哪些按钮动作/客户端命令/事件订阅）
 * - getViewData：iframe 里的界面通过平台 bridge 要数据时调用
 * - executeViewAction：界面按钮（新建、AI 分析、采纳、确认……）调用
 * - getRemoteComponentEntry：返回 iframe 的 HTML（内嵌构建好的 app.js / app.css）
 * Python 类比：一个 FastAPI router，平台把前端的请求转发到这些方法上。
 */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Injectable } from '@nestjs/common'
import { ASSISTANT_CHAT_SEND_MESSAGE_COMMAND } from '@xpert-ai/contracts'
import type {
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery
} from '@xpert-ai/contracts'
import { ViewExtensionProvider, renderRemoteReactIframeHtml } from '@xpert-ai/plugin-sdk'
import type { IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { EXPEDITE_FEATURE, PLUGIN_ICON, PLUGIN_NAME, REMOTE_ENTRY, VIEW_KEY, VIEW_PROVIDER_KEY, artifactKey } from './constants.js'
import { ExpediteError } from './errors.js'
import { ExpediteService } from './expedite.service.js'
import type { MessageLocale } from './expedite.service.js'
import { requestIdInputSchema } from './schemas.js'
import { EXPEDITE_MUTATION_TOOL_NAMES } from './tool-schemas.js'
import { REQUEST_STATUSES } from './types.js'
import type { ExpediteScope } from './types.js'

const FIXED_SLOT = 'agent.workbench.fixed'
const MAIN_SLOT = 'agent.workbench.main'

/** 视图允许的全部按钮动作；界面只能调用这里声明过的 key */
export const VIEW_ACTION_KEYS = [
  'seed_demo_requests',
  'create_request',
  'delete_draft',
  'start_analysis',
  'set_finding_decision',
  'confirm_request',
  'reject_analysis'
] as const
export type ViewActionKey = (typeof VIEW_ACTION_KEYS)[number]

const ACTION_LABELS: Record<ViewActionKey, { en_US: string; zh_Hans: string }> = {
  seed_demo_requests: { en_US: 'Load demo requests', zh_Hans: '载入演示请求' },
  create_request: { en_US: 'New request', zh_Hans: '新建请求' },
  delete_draft: { en_US: 'Delete draft', zh_Hans: '删除草稿' },
  start_analysis: { en_US: 'AI analysis', zh_Hans: 'AI 分析' },
  set_finding_decision: { en_US: 'Decide finding', zh_Hans: '采纳或驳回' },
  confirm_request: { en_US: 'Confirm conclusion', zh_Hans: '确认结论' },
  reject_analysis: { en_US: 'Reject analysis', zh_Hans: '驳回本次分析' }
}

const TITLE = { en_US: 'Expedite shortage analysis', zh_Hans: '提前交货缺料分析' }

const moduleDir = dirname(fileURLToPath(import.meta.url))
const requireHere = createRequire(import.meta.url)

@Injectable()
@ViewExtensionProvider(VIEW_PROVIDER_KEY)
export class ExpediteViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: ExpediteService) {}

  /** 只挂在助手（agent）工作台上 */
  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (context.hostType !== 'agent' || ![FIXED_SLOT, MAIN_SLOT].includes(slot)) return []
    return [
      {
        key: VIEW_KEY,
        title: TITLE,
        description: {
          en_US: 'Expedite requests, AI shortage findings and planner confirmation.',
          zh_Hans: '提前交货请求、AI 缺料结论与计划员确认。'
        },
        icon: PLUGIN_ICON,
        hostType: 'agent',
        slot,
        order: 10,
        refreshable: true,
        // 只有连接了本插件中间件（带这个 feature）的助手才会显示这个视图
        activation: { requiredFeatures: [EXPEDITE_FEATURE] },
        ...(slot === FIXED_SLOT ? { workbench: { fixed: true, menu: { enabled: true, label: TITLE, order: 10, icon: PLUGIN_ICON } } } : {}),
        source: { provider: VIEW_PROVIDER_KEY, plugin: PLUGIN_NAME },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: { isolation: 'iframe', entry: REMOTE_ENTRY },
          dataSource: { mode: 'platform' }
        },
        dataSource: {
          mode: 'platform',
          querySchema: { supportsPagination: true, supportsSelection: true, supportsSearch: true, supportsParameters: true, defaultPageSize: 20 },
          cache: { enabled: false }
        },
        // 最小权限：界面只需要“往对话里发一条消息”这一个客户端命令
        clientCommands: [
          {
            key: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
            label: { en_US: 'Send analysis request to chat', zh_Hans: '把分析指令发送到对话' }
          }
        ],
        // 写工具完成后，平台把事件转发给 iframe，界面据此刷新
        hostEvents: {
          subscriptions: [
            {
              key: artifactKey('tool_completed'),
              event: 'assistant.tool.completed',
              filter: { sources: ['chatkit'], toolNames: [...EXPEDITE_MUTATION_TOOL_NAMES] },
              action: { type: 'forward', debounceMs: 800 }
            }
          ]
        },
        actions: VIEW_ACTION_KEYS.map((key) => ({ key, label: ACTION_LABELS[key], actionType: 'invoke' as const }))
      }
    ]
  }

  /** 列表 + （选中时）详情；selectionId 是请求 ID */
  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery): Promise<XpertViewDataResult> {
    this.assertView(viewKey)
    const scope = viewScope(context)
    const status = z.enum(REQUEST_STATUSES).optional().safeParse(query.parameters?.['status'])
    const list = await this.service.listRequests(scope, {
      page: query.page ?? 1,
      pageSize: Math.min(query.pageSize ?? 20, 50),
      search: query.search?.trim() || undefined,
      status: status.success ? status.data : undefined
    })
    const selection = z.string().uuid().safeParse(query.selectionId)
    let detail = null
    if (selection.success) {
      try {
        detail = await this.service.getRequestDetail(scope, selection.data)
      } catch (error) {
        // 选中的请求已被删除或不属于当前组织：返回空详情，而不是让整个视图报错
        if (!(error instanceof ExpediteError && error.code === 'NOT_FOUND')) throw error
      }
    }
    // items/total 给平台的通用表格能力用；界面实际读取 item 里的列表（含分页信息）和详情
    return { items: list.items, total: list.total, item: { list, detail } }
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    this.assertView(viewKey)
    try {
      // 身份只取自宿主上下文；界面传来的 input 里不允许出现租户/用户字段（schema 是 strict 的）
      const scope = viewScope(context)
      const data = await this.dispatch(scope, actionKey, request.input, messageLocale(context.locale))
      return { success: true, data, refresh: true }
    } catch (error) {
      if (error instanceof ExpediteError) {
        return { success: false, data: { code: error.code, details: error.details }, refresh: true }
      }
      if (error instanceof z.ZodError) {
        return {
          success: false,
          data: { code: 'VALIDATION_FAILED', details: { fields: Object.fromEntries(error.issues.map((issue) => [String(issue.path[0] ?? 'input'), issue.code])) } }
        }
      }
      throw error
    }
  }

  async getRemoteComponentEntry(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    this.assertView(viewKey)
    if (component.entry !== REMOTE_ENTRY || component.isolation !== 'iframe') throw new Error('unsupported_component')
    const readPackageFile = (name: string, file: string) =>
      readFile(join(dirname(requireHere.resolve(`${name}/package.json`)), file), 'utf8')
    const [appScript, appCss, reactUmd, reactDomUmd] = await Promise.all([
      readFile(join(moduleDir, 'remote-components', REMOTE_ENTRY, 'app.js'), 'utf8'),
      readFile(join(moduleDir, 'remote-components', REMOTE_ENTRY, 'app.css'), 'utf8'),
      readPackageFile('react', 'umd/react.production.min.js'),
      readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    ])
    return {
      contentType: 'text/html; charset=utf-8',
      html: renderRemoteReactIframeHtml({
        title: TITLE.en_US,
        lang: messageLocale(context.locale),
        appScript,
        appCss,
        reactUmd,
        reactDomUmd
      })
    }
  }

  /** 按动作 key 分派到 Service；未声明的 key 一律拒绝 */
  private async dispatch(scope: ExpediteScope, actionKey: string, input: unknown, locale: MessageLocale) {
    switch (actionKey as ViewActionKey) {
      case 'seed_demo_requests':
        return this.service.seedDemoRequests(scope)
      case 'create_request':
        return this.service.createRequest(scope, input)
      case 'delete_draft':
        return this.service.deleteDraft(scope, requestIdInputSchema.parse(input).requestId)
      case 'start_analysis': {
        const started = await this.service.startAnalysis(scope, requestIdInputSchema.parse(input).requestId, locale)
        // 返回界面要执行的客户端命令：由 iframe 通过 bridge 把指令发进对话。
        // newThread：每次分析开一个新会话。宿主源码注释说明，往仍在运行或卡住的会话里发消息会被排队，
        // 重试场景下旧会话可能正是卡住的那个；clientMessageId 用任务 ID，便于把对话消息和任务对应起来。
        return {
          ...started,
          commandKey: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
          commandPayload: { text: started.message, newThread: true, clientMessageId: started.jobId }
        }
      }
      case 'set_finding_decision':
        return this.service.setFindingDecision(scope, input)
      case 'confirm_request':
        return this.service.confirmRequest(scope, input)
      case 'reject_analysis':
        return this.service.rejectAnalysis(scope, input)
      default:
        throw new ExpediteError('NOT_FOUND', { action: actionKey })
    }
  }

  private assertView(viewKey: string) {
    if (viewKey !== VIEW_KEY) throw new Error('unsupported_view')
  }
}

/** 视图侧的身份范围：必须是助手宿主且有登录用户 */
export function viewScope(context: XpertResolvedViewHostContext): ExpediteScope {
  if (context.hostType !== 'agent' || !context.tenantId || !context.userId) throw new Error('agent_user_required')
  return { tenantId: context.tenantId, organizationId: context.organizationId ?? null, userId: context.userId }
}

/** 宿主语言 → 分析指令语言（中文优先，其余用英文） */
export function messageLocale(locale: string | null | undefined): MessageLocale {
  return locale && /^zh/i.test(locale) ? 'zh-Hans' : 'en-US'
}
