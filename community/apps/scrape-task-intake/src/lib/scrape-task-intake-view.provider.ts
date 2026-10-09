import { Injectable } from '@nestjs/common'
import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import type {
  I18nObject,
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataSource,
  XpertViewDataResult,
  XpertViewQuery,
  XpertViewScalar
} from '@xpert-ai/contracts'
import {
  IXpertViewExtensionProvider,
  renderRemoteReactIframeHtml,
  ViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  SCRAPE_TASK_INTAKE_FEATURE,
  SCRAPE_TASK_INTAKE_MIDDLEWARE_TOOL_NAMES,
  SCRAPE_TASK_INTAKE_PLUGIN_NAME,
  SCRAPE_TASK_INTAKE_PROVIDER_KEY,
  SCRAPE_TASK_INTAKE_REMOTE_ENTRY_KEY,
  SCRAPE_TASK_INTAKE_REPORT_VIEW_KEY,
  SCRAPE_TASK_INTAKE_REVIEW_VIEW_KEY,
  SCRAPE_TASK_INTAKE_WORKBENCH_VIEW_KEY
} from './constants'
import { ScrapeTaskIntakeService } from './scrape-task-intake.service'
import type {
  ScrapeTaskCrawlFrequency,
  ScrapeTaskDeliveryFormat,
  ScrapeTaskPagesScope,
  ScrapeTaskPriority,
  ScrapeTaskScope,
  ScrapeTaskStatus
} from './types'

const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

@Injectable()
@ViewExtensionProvider(SCRAPE_TASK_INTAKE_PROVIDER_KEY)
export class ScrapeTaskIntakeViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: ScrapeTaskIntakeService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT) {
      return []
    }
    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT
    // Both slots declare `requireFeatureActivation`, so a manifest without
    // requiredFeatures is filtered out by the platform (isManifestActiveForContext).
    const base = {
      activation: {
        requiredFeatures: [SCRAPE_TASK_INTAKE_FEATURE]
      },
      ...(fixed
        ? {
            workbench: {
              fixed: true
            }
          }
        : {})
    }

    return [
      {
        key: SCRAPE_TASK_INTAKE_WORKBENCH_VIEW_KEY,
        title: text('Scrape Task Intake', '采集需求受理'),
        description: text(
          'Submit natural-language scraping requests, review AI-generated task specs, confirm and track collection status.',
          '提交自然语言采集需求、审核 AI 生成的任务书、确认受理并跟踪采集状态。'
        ),
        icon: {
          type: 'font',
          value: 'ri-search-eye-line',
          color: '#0f766e'
        },
        hostType: 'agent',
        slot,
        order: 20,
        refreshable: true,
        ...base,
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Scrape Task Intake', '采集需求受理'),
                  order: 20,
                  icon: {
                    type: 'font',
                    value: 'ri-search-eye-line',
                    color: '#0f766e'
                  }
                }
              }
            }
          : {}),
        source: {
          provider: SCRAPE_TASK_INTAKE_PROVIDER_KEY,
          plugin: SCRAPE_TASK_INTAKE_PLUGIN_NAME
        },
        view: remoteView(),
        dataSource: platformDataSource(),
        hostEvents: toolCompletedHostEvents(),
        clientCommands: [
          {
            key: 'assistant.chat.send_message',
            label: text('Send to Assistant Chat', '发送到 Assistant 对话')
          }
        ],
        actions: [
          { key: 'refresh', label: text('Refresh', '刷新'), icon: 'ri-refresh-line', placement: 'toolbar', actionType: 'refresh' },
          {
            key: 'prepare_report_chat_message',
            label: text('Prepare Report Message', '发送到 Assistant'),
            icon: 'ri-send-plane-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          { key: 'update_task', label: text('Save', '保存'), icon: 'ri-save-line', placement: 'toolbar', actionType: 'invoke' },
          {
            key: 'mark_needs_supplement',
            label: text('Needs Supplement', '补充完善'),
            icon: 'ri-edit-2-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'prepare_supplement_draft',
            label: text('Prepare Supplement Draft', '生成补充草稿'),
            icon: 'ri-magic-line',
            actionType: 'invoke'
          },
          {
            key: 'save_supplement',
            label: text('Save Supplement', '保存补充'),
            icon: 'ri-check-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'confirm_task',
            label: text('Confirm Task', '确认受理'),
            icon: 'ri-play-circle-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'start_processing',
            label: text('Start Collection', '开始采集'),
            icon: 'ri-scan-2-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'complete_task',
            label: text('Mark Completed', '标记完成'),
            icon: 'ri-checkbox-circle-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'reject_and_close',
            label: text('Reject and Close', '驳回关闭'),
            icon: 'ri-close-circle-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'get_mock_catalog',
            label: text('Get Catalog', '获取候选模板'),
            icon: 'ri-list-settings-line',
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
    if (component.entry !== SCRAPE_TASK_INTAKE_REMOTE_ENTRY_KEY || !isScrapeTaskIntakeViewKey(viewKey)) {
      return {
        html: '<!doctype html><html><body>Unsupported scrape task intake component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    const appPath = join(__dirname, 'remote-components', SCRAPE_TASK_INTAKE_REMOTE_ENTRY_KEY, 'app.js')
    const appScript = await readFile(appPath, 'utf8')
    const reactUmd = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDomUmd = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    return {
      html: renderRemoteReactIframeHtml({
        title: 'Scrape Task Intake',
        lang: 'zh-Hans',
        reactUmd,
        reactDomUmd,
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
    if (!isScrapeTaskIntakeViewKey(viewKey)) {
      return {}
    }
    return this.service.getViewData(scopeFromContext(context), {
      taskId: getStringParameter(query.parameters, 'taskId'),
      status: getStringParameter(query.parameters, 'status') as ScrapeTaskStatus | undefined,
      priority: getStringParameter(query.parameters, 'priority') as ScrapeTaskPriority | undefined,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize
    })
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    try {
      if (!isScrapeTaskIntakeViewKey(viewKey)) {
        return failure('Unsupported action', '不支持的操作')
      }
      const scope = scopeFromContext(context)
      if (actionKey === 'prepare_report_chat_message') {
        const originalContent = getStringInput(request.input, 'originalContent')
        if (!originalContent) {
          return failure('Request content is required', '采集需求内容不能为空')
        }
        const payload = {
          text: buildAssistantMessage(request.input)
        }
        return {
          success: true,
          message: text('Report message prepared', '采集需求消息已准备'),
          refresh: false,
          data: {
            commandKey: 'assistant.chat.send_message',
            payload
          }
        }
      }
      if (actionKey === 'get_mock_catalog') {
        return {
          success: true,
          data: this.service.getCatalog(),
          refresh: false
        }
      }
      const taskId = request.targetId ?? getStringInput(request.input, 'taskId')
      if (!taskId && actionKey !== 'refresh') {
        return failure('Task is required', '缺少任务')
      }

      if (actionKey === 'refresh') {
        return success('Scrape task intake view refreshed', '采集需求视图已刷新')
      }
      if (actionKey === 'update_task') {
        await this.service.updateTask(scope, taskId as string, normalizeUpdateInput(request.input))
      } else if (actionKey === 'mark_needs_supplement') {
        await this.service.markNeedsSupplement(scope, taskId as string, {
          reason: getStringInput(request.input, 'reason'),
          remark: getStringInput(request.input, 'remark')
        })
      } else if (actionKey === 'prepare_supplement_draft') {
        await this.service.prepareSupplementDraft(scope, taskId as string, normalizeSupplementDraftInput(request.input))
      } else if (actionKey === 'save_supplement') {
        await this.service.saveSupplement(scope, taskId as string, normalizeUpdateInput(request.input))
      } else if (actionKey === 'confirm_task') {
        await this.service.confirmTask(scope, taskId as string, normalizeUpdateInput(request.input))
      } else if (actionKey === 'start_processing') {
        await this.service.startProcessing(scope, taskId as string)
      } else if (actionKey === 'complete_task') {
        await this.service.completeTask(scope, taskId as string, {
          completedSummary: getStringInput(request.input, 'completedSummary')
        })
      } else if (actionKey === 'reject_and_close') {
        await this.service.rejectAndClose(scope, taskId as string, {
          reason: getStringInput(request.input, 'reason')
        })
      } else {
        return failure('Unsupported action', '不支持的操作')
      }

      return success('Operation completed', '操作已完成')
    } catch (error) {
      const message = getActionErrorMessage(error, 'Action failed')
      return {
        success: false,
        message: text(message, message)
      }
    }
  }
}

function remoteView(): XpertRemoteComponentViewSchema {
  return {
    type: 'remote_component' as const,
    runtime: 'react' as const,
    protocolVersion: 1 as const,
    component: {
      isolation: 'iframe' as const,
      entry: SCRAPE_TASK_INTAKE_REMOTE_ENTRY_KEY
    },
    dataSource: {
      mode: 'platform' as const
    }
  }
}

function platformDataSource(): XpertViewDataSource {
  return {
    mode: 'platform' as const,
    querySchema: {
      supportsPagination: true,
      supportsSearch: true,
      supportsSort: true,
      supportsFilter: true,
      supportsParameters: true,
      defaultPageSize: 20
    },
    cache: {
      enabled: false
    }
  }
}

function toolCompletedHostEvents() {
  return {
    subscriptions: [
      {
        key: 'scrape-task-intake-tool-completed',
        event: 'assistant.tool.completed',
        filter: {
          sources: ['chatkit'],
          toolNames: [...SCRAPE_TASK_INTAKE_MIDDLEWARE_TOOL_NAMES]
        },
        action: {
          type: 'forward' as const,
          debounceMs: 1000
        }
      }
    ]
  }
}

function isScrapeTaskIntakeViewKey(viewKey: string) {
  return (
    viewKey === SCRAPE_TASK_INTAKE_WORKBENCH_VIEW_KEY ||
    viewKey === SCRAPE_TASK_INTAKE_REPORT_VIEW_KEY ||
    viewKey === SCRAPE_TASK_INTAKE_REVIEW_VIEW_KEY
  )
}

function scopeFromContext(context: XpertResolvedViewHostContext): ScrapeTaskScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.hostId
  }
}

function getStringParameter(parameters: Record<string, XpertViewScalar | XpertViewScalar[]> | undefined, key: string) {
  const value = parameters?.[key]
  const normalized = Array.isArray(value) ? value[0] : value
  return typeof normalized === 'string' && normalized.trim() ? normalized.trim() : undefined
}

function getStringInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function buildAssistantMessage(input: Record<string, unknown> | null | undefined) {
  const originalContent = getStringInput(input, 'originalContent') ?? ''
  const requesterName = getStringInput(input, 'requesterName')
  const requesterDepartment = getStringInput(input, 'requesterDepartment')
  const requesterContact = getStringInput(input, 'requesterContact')
  return [
    '请根据以下自然语言采集需求创建采集任务书。',
    '你必须先调用 scrape_intake_get_catalog 获取站点类型字段模板与合规清单,再识别字段;不要只根据用户手填线索判断。',
    '根据自然语言中的目标站点、字段、频率与交付格式,匹配最合适的站点类型模板并补齐字段说明。',
    '如果能够确定目标站点与核心字段,请调用 scrape_intake_save_generated_task 保存一张待确认采集任务。',
    '目标站点或采集字段完全无法确定时,不要调用 scrape_intake_save_generated_task;请直接向用户说明缺少哪一项,并提示只需补充最小必要信息。',
    '缺少非关键字段时仍可保存任务,并把缺失项写入 completenessTips;这类任务会进入待补充,但不阻塞创建。',
    '反爬风险(antiBotNotes)与合规提示(complianceNotes)只描述需要工程师注意的事项,不要声称已经绕过任何防护。',
    '',
    `采集需求：${originalContent}`,
    requesterName ? `需求人：${requesterName}` : '',
    requesterDepartment ? `需求人部门：${requesterDepartment}` : '',
    requesterContact ? `联系方式：${requesterContact}` : '',
    '',
    '要求：一次需求只保存一张任务;重试同一需求会返回已有的待处理任务而不是重复建单;保存后请明确反馈生成的工单号、状态是待确认还是待补充,以及需要人工确认或补充的内容;不要绕过工具直接声称已保存。'
  ]
    .filter((line) => line !== '')
    .join('\n')
}

function normalizeUpdateInput(input: Record<string, unknown> | null | undefined) {
  return {
    title: getStringInput(input, 'title'),
    requesterName: getStringInput(input, 'requesterName'),
    requesterDepartment: getStringInput(input, 'requesterDepartment'),
    requesterContact: getStringInput(input, 'requesterContact'),
    targetUrl: getStringInput(input, 'targetUrl'),
    targetSite: getStringInput(input, 'targetSite'),
    pagesScope: getStringInput(input, 'pagesScope') as ScrapeTaskPagesScope | undefined,
    dataFields: getObjectArrayInput(input, 'dataFields'),
    crawlFrequency: getStringInput(input, 'crawlFrequency') as ScrapeTaskCrawlFrequency | undefined,
    deliveryFormat: getStringInput(input, 'deliveryFormat') as ScrapeTaskDeliveryFormat | undefined,
    estimatedVolume: getStringInput(input, 'estimatedVolume'),
    authRequired: getBooleanInput(input, 'authRequired'),
    priority: getStringInput(input, 'priority') as ScrapeTaskPriority | undefined,
    antiBotNotes: getStringInput(input, 'antiBotNotes'),
    complianceNotes: getStringInput(input, 'complianceNotes'),
    assigneeName: getStringInput(input, 'assigneeName'),
    remark: getStringInput(input, 'remark') ?? getStringInput(input, 'reason')
  }
}

function normalizeSupplementDraftInput(input: Record<string, unknown> | null | undefined) {
  return {
    ...normalizeUpdateInput(input),
    supplementContent: getStringInput(input, 'supplementContent') ?? getStringInput(input, 'reason') ?? getStringInput(input, 'remark'),
    confidence: typeof input?.['confidence'] === 'number' ? (input['confidence'] as number) : undefined,
    rationale: getStringInput(input, 'rationale')
  }
}

function getBooleanInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  if (typeof value === 'boolean') return value
  if (typeof value === 'string' && value.trim()) return value.trim() === 'true'
  return undefined
}

function getObjectArrayInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  if (!Array.isArray(value)) return undefined
  const items = value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      name: typeof item['name'] === 'string' ? item['name'].trim() : '',
      description: typeof item['description'] === 'string' ? item['description'].trim() : undefined,
      example: typeof item['example'] === 'string' ? item['example'].trim() : undefined,
      required: typeof item['required'] === 'boolean' ? item['required'] : undefined
    }))
    .filter((item) => item.name)
  return items.length ? items : undefined
}

async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
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

function getActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }
  return fallback
}
