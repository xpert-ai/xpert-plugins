import { Injectable } from '@nestjs/common'
import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
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
import {
  IXpertViewExtensionProvider,
  renderRemoteReactIframeHtml,
  ViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  INSPECTION_FEATURE,
  INSPECTION_ICON,
  INSPECTION_PLUGIN_NAME,
  INSPECTION_PROVIDER_KEY,
  INSPECTION_REMOTE_ENTRY_KEY,
  INSPECTION_VIEW_KEY,
  PROJECT_DETAIL_SECTIONS_SLOT
} from './constants.js'
import { InspectionService } from './inspection.service.js'
import type { InspectionScope } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const TOOL_NAMES = [
  'inspection_analyze_fault',
  'inspection_search_history',
  'inspection_save_recommendation',
  'inspection_report_failure'
]

@Injectable()
@ViewExtensionProvider(INSPECTION_PROVIDER_KEY)
export class InspectionViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: InspectionService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'project' || context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!isSupportedSlot(context, slot)) {
      return []
    }

    const isAgentFixedWorkbench = context.hostType === 'agent' && slot === AGENT_WORKBENCH_FIXED_SLOT

    return [
      {
        key: INSPECTION_VIEW_KEY,
        title: text('Inspection & Fault Handling', '机房/基站巡检与故障处理'),
        description: text(
          'Create inspection cases from fault descriptions, let AI analyze severity and retrieve historical resolution plans, review and confirm resolutions, and retry failed analyses.',
          '提交巡检故障描述，AI 自动解析故障与紧急程度、检索历史处理方案并给出建议，人工确认处理方案，失败可重试。'
        ),
        icon: {
          type: 'font',
          value: 'ri-building-2-line'
        },
        hostType: context.hostType,
        slot,
        order: 30,
        refreshable: true,
        activation: {
          requiredFeatures: [INSPECTION_FEATURE]
        },
        ...(isAgentFixedWorkbench
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Inspection & Fault Handling', '巡检与故障处理'),
                  order: 30,
                  icon: {
                    type: 'svg',
                    value: INSPECTION_ICON,
                    alt: 'Inspection & Fault Handling'
                  }
                }
              }
            }
          : {}),
        source: {
          provider: INSPECTION_PROVIDER_KEY,
          plugin: INSPECTION_PLUGIN_NAME
        },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: INSPECTION_REMOTE_ENTRY_KEY
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
            defaultPageSize: 20
          },
          cache: {
            enabled: false
          }
        },
        hostEvents: {
          subscriptions: [
            {
              key: 'inspection-tool-completed',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: TOOL_NAMES
              },
              action: {
                type: 'refresh-and-forward',
                debounceMs: 1000
              }
            }
          ]
        },
        clientCommands: [
          {
            key: 'assistant.chat.send_message',
            label: text('Send to Assistant Chat', '发送到 Assistant 对话')
          }
        ],
        actions: [
          {
            key: 'refresh',
            label: text('Refresh', '刷新'),
            icon: 'ri-refresh-line',
            placement: 'toolbar',
            actionType: 'refresh'
          },
          {
            key: 'create_case',
            label: text('New Inspection Case', '新建巡检工单'),
            icon: 'ri-add-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'retry_analysis',
            label: text('Retry Analysis', '重试分析'),
            icon: 'ri-refresh-line',
            actionType: 'invoke'
          },
          {
            key: 'confirm_resolution',
            label: text('Confirm Resolution', '确认处理方案'),
            icon: 'ri-check-line',
            actionType: 'invoke'
          },
          {
            key: 'delete_case',
            label: text('Delete Case', '删除工单'),
            icon: 'ri-delete-bin-line',
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
    if (viewKey !== INSPECTION_VIEW_KEY || component.entry !== INSPECTION_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported remote component entry.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }

    const appScript = await readFile(
      join(__dirname, 'remote-components', INSPECTION_REMOTE_ENTRY_KEY, 'app.js'),
      'utf8'
    )
    const react = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')

    return {
      html: renderRemoteReactIframeHtml({
        title: 'Inspection & Fault Handling Assistant',
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
    if (viewKey !== INSPECTION_VIEW_KEY) {
      return {}
    }

    const scope = scopeFromContext(context)
    const caseId = getStringParameter(query.parameters, 'caseId') ?? query.selectionId

    const list = await this.service.getWorkbenchData(scope, {
      search: query.search,
      status: getStringParameter(query.parameters, 'status'),
      page: query.page,
      pageSize: query.pageSize
    })

    const detail = caseId ? await this.service.getCase(scope, caseId) : null
    const historyCount = (await this.service.listHistory(scope, 100)).length

    return {
      items: list.cases,
      total: list.total,
      item: detail ? toDetailView(detail) : null,
      summary: { historyCount }
    }
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== INSPECTION_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }

    try {
      const scope = scopeFromContext(context)

      if (actionKey === 'refresh') {
        return success('View refreshed', '巡检视图已刷新')
      }

      if (actionKey === 'create_case') {
        const result = await this.service.createCase(scope, {
          title: requireStringInput(request.input, 'title', '工单标题不能为空'),
          deviceType: getStringInput(request.input, 'deviceType'),
          faultDescription: requireStringInput(request.input, 'faultDescription', '故障描述不能为空'),
          severity: getStringInput(request.input, 'severity') as never,
          impact: getStringInput(request.input, 'impact')
        })
        return {
          ...success('Inspection case created', '巡检工单已创建'),
          data: result
        }
      }

      if (actionKey === 'retry_analysis') {
        const result = await this.service.retryCase(scope, requireCaseId(request))
        return {
          ...success('Analysis retried', '已重置工单，可重新分析'),
          data: result,
          refresh: true
        }
      }

      if (actionKey === 'confirm_resolution') {
        const result = await this.service.confirmResolution(scope, requireCaseId(request), {
          resolution: requireStringInput(request.input, 'resolution', '处理方案不能为空'),
          resolvedBy: getStringInput(request.input, 'resolvedBy'),
          close: getBooleanInput(request.input, 'close')
        })
        return {
          ...success('Resolution confirmed', '处理方案已确认并沉淀到历史方案库'),
          data: result
        }
      }

      if (actionKey === 'delete_case') {
        const result = await this.service.deleteCase(scope, requireCaseId(request))
        return {
          ...success('Case deleted', '工单已删除'),
          data: result
        }
      }

      return failure('Unsupported action', '不支持的操作')
    } catch (error) {
      const message = getActionErrorMessage(error, 'Action failed')
      return {
        success: false,
        message: text(message, message)
      }
    }
  }
}

function toDetailView(entity: Awaited<ReturnType<InspectionService['getCase']>>) {
  if (!entity) {
    return null
  }
  const { aiAnalysis, historyReferences, ...rest } = entity
  return {
    ...rest,
    createdAt: entity.createdAt ? entity.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: entity.updatedAt ? entity.updatedAt.toISOString() : new Date().toISOString(),
    resolvedAt: entity.resolvedAt ? entity.resolvedAt.toISOString() : null,
    historyReferences: historyReferences ?? []
  }
}

async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
}

function isSupportedSlot(context: XpertResolvedViewHostContext, slot: string) {
  if (context.hostType === 'project') {
    return slot === PROJECT_DETAIL_SECTIONS_SLOT
  }

  if (context.hostType === 'agent') {
    return slot === AGENT_WORKBENCH_FIXED_SLOT || slot === AGENT_WORKBENCH_MAIN_SLOT
  }

  return false
}

function scopeFromContext(context: XpertResolvedViewHostContext): InspectionScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? null,
    workspaceId: context.workspaceId ?? null,
    projectId: context.hostType === 'project' ? context.hostId : null,
    userId: context.userId
  }
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

function requireCaseId(request: XpertViewActionRequest) {
  return (
    getStringInput(request.input, 'caseId') ??
    getStringParameter(request.parameters, 'caseId') ??
    requireString(request.targetId, '巡检工单 ID 不能为空')
  )
}

function requireStringInput(input: XpertViewActionRequest['input'], key: string, message: string) {
  return requireString(getStringInput(input, key), message)
}

function requireString(value: string | undefined, message: string) {
  const normalized = value?.trim()
  if (!normalized) {
    throw new Error(message)
  }
  return normalized
}

function getStringInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getBooleanInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    return value === 'true' || value === '1' || value === 'yes'
  }
  return undefined
}

function getStringParameter(
  parameters: XpertViewQuery['parameters'] | XpertViewActionRequest['parameters'] | undefined,
  key: string
) {
  const value = parameters?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}
