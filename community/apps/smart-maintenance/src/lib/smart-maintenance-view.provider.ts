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
  XpertViewFileActionFile,
  renderRemoteReactIframeHtml,
  ViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  SMART_MAINTENANCE_FEATURE,
  SMART_MAINTENANCE_MIDDLEWARE_TOOL_NAMES,
  SMART_MAINTENANCE_PLUGIN_NAME,
  SMART_MAINTENANCE_PROVIDER_KEY,
  SMART_MAINTENANCE_REMOTE_ENTRY_KEY,
  SMART_MAINTENANCE_REPORT_VIEW_KEY,
  SMART_MAINTENANCE_REVIEW_VIEW_KEY,
  SMART_MAINTENANCE_WORKBENCH_VIEW_KEY
} from './constants'
import { SmartMaintenanceService } from './smart-maintenance.service'
import type {
  SmartMaintenanceProcessingResult,
  SmartMaintenanceScope,
  SmartMaintenanceServiceType,
  SmartMaintenanceUrgency,
  SmartMaintenanceWorkOrderStatus
} from './types'

const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

@Injectable()
@ViewExtensionProvider(SMART_MAINTENANCE_PROVIDER_KEY)
export class SmartMaintenanceViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: SmartMaintenanceService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT) {
      return []
    }
    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT
    const base = fixed
      ? {
          activation: {
            requiredFeatures: [SMART_MAINTENANCE_FEATURE]
          },
          workbench: {
            fixed: true
          }
        }
      : {}

    return [
      {
        key: SMART_MAINTENANCE_WORKBENCH_VIEW_KEY,
        title: text('Smart Maintenance Workbench', '智能维保工作台'),
        description: text(
          'Prepare candidate maintenance data, submit AI-assisted reports, review work orders and close the lightweight processing loop.',
          '准备候选维保数据、提交 AI 报修、审核工单并完成轻量处理闭环。'
        ),
        icon: {
          type: 'font',
          value: 'ri-customer-service-2-line',
          color: '#1769e0'
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
                  label: text('Smart Maintenance', '智能维保'),
                  order: 20,
                  icon: {
                    type: 'font',
                    value: 'ri-customer-service-2-line',
                    color: '#1769e0'
                  }
                }
              }
            }
          : {}),
        source: {
          provider: SMART_MAINTENANCE_PROVIDER_KEY,
          plugin: SMART_MAINTENANCE_PLUGIN_NAME
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
          {
            key: 'prepare_service_data_import',
            label: text('Prepare Service Data Import', '解析服务数据文件'),
            icon: 'ri-upload-cloud-line',
            placement: 'toolbar',
            actionType: 'invoke',
            transport: 'file'
          },
          { key: 'update_work_order', label: text('Save', '保存'), icon: 'ri-save-line', placement: 'toolbar', actionType: 'invoke' },
          {
            key: 'mark_needs_supplement',
            label: text('Needs Supplement', '补充完善'),
            icon: 'ri-edit-2-line',
            placement: 'toolbar',
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
            key: 'confirm_processing',
            label: text('Confirm Processing', '确认处理'),
            icon: 'ri-play-circle-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'mark_processed',
            label: text('Mark Processed', '标记已处理'),
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
            label: text('Get Catalog', '获取候选数据'),
            icon: 'ri-list-settings-line',
            actionType: 'invoke'
          },
          {
            key: 'prepare_supplement_draft',
            label: text('Prepare Supplement Draft', '生成补充草稿'),
            icon: 'ri-magic-line',
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
    if (
      component.entry !== SMART_MAINTENANCE_REMOTE_ENTRY_KEY ||
      !isSmartMaintenanceViewKey(viewKey)
    ) {
      return {
        html: '<!doctype html><html><body>Unsupported smart maintenance component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    const appPath = join(__dirname, 'remote-components', SMART_MAINTENANCE_REMOTE_ENTRY_KEY, 'app.js')
    const appScript = await readFile(appPath, 'utf8')
    const reactUmd = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDomUmd = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    return {
      html: renderRemoteReactIframeHtml({
        title: 'Smart Maintenance Workbench',
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
    if (!isSmartMaintenanceViewKey(viewKey)) {
      return {}
    }
    return this.service.getViewData(scopeFromContext(context), {
      viewMode: 'review',
      workOrderId: getStringParameter(query.parameters, 'workOrderId'),
      status: getStringParameter(query.parameters, 'status') as SmartMaintenanceWorkOrderStatus | undefined,
      deviceType: getStringParameter(query.parameters, 'deviceType'),
      urgency: getStringParameter(query.parameters, 'urgency'),
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
      if (!isSmartMaintenanceViewKey(viewKey)) {
        return failure('Unsupported action', '不支持的操作')
      }
      const scope = scopeFromContext(context)
      if (actionKey === 'prepare_report_chat_message') {
        const originalContent = getStringInput(request.input, 'originalContent')
        if (!originalContent) {
          return failure('Report content is required', '报修内容不能为空')
        }
        const payload = {
          text: buildAssistantMessage(request.input)
        }
        return {
          success: true,
          message: text('Report message prepared', '报修消息已准备'),
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
          data: await this.service.getMockCatalog(),
          refresh: false
        }
      }
      const workOrderId = request.targetId ?? getStringInput(request.input, 'workOrderId')
      if (!workOrderId && actionKey !== 'refresh') {
        return failure('Work order is required', '缺少工单')
      }

      if (actionKey === 'refresh') {
        return success('Smart maintenance view refreshed', '智能维保视图已刷新')
      }
      if (actionKey === 'update_work_order') {
        await this.service.updateWorkOrder(scope, workOrderId as string, request.input ?? {})
      } else if (actionKey === 'mark_needs_supplement') {
        await this.service.markNeedsSupplement(scope, workOrderId as string, {
          reason: getStringInput(request.input, 'reason'),
          remark: getStringInput(request.input, 'remark')
        })
      } else if (actionKey === 'prepare_supplement_draft') {
        await this.service.prepareSupplementDraft(scope, workOrderId as string, normalizeSupplementDraftInput(request.input))
      } else if (actionKey === 'save_supplement') {
        await this.service.saveSupplement(scope, workOrderId as string, request.input ?? {})
      } else if (actionKey === 'confirm_processing') {
        await this.service.confirmProcessing(scope, workOrderId as string, request.input ?? {})
      } else if (actionKey === 'mark_processed') {
        await this.service.markProcessed(scope, workOrderId as string, {
          processingResult: getStringInput(request.input, 'processingResult') as SmartMaintenanceProcessingResult | undefined,
          processingSummary: getStringInput(request.input, 'processingSummary')
        })
      } else if (actionKey === 'reject_and_close') {
        await this.service.rejectAndClose(scope, workOrderId as string, {
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

  async executeViewFileAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    _request: XpertViewActionRequest,
    file: XpertViewFileActionFile
  ): Promise<XpertViewActionResult> {
    try {
      if (!isSmartMaintenanceViewKey(viewKey)) {
        return failure('Unsupported action', '不支持的操作')
      }
      if (actionKey !== 'prepare_service_data_import') {
        return failure('Unsupported file action', '不支持的文件操作')
      }
      const draft = await this.service.prepareServiceDataImportDraft(scopeFromContext(context), {
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        buffer: file.buffer
      })
      return {
        success: true,
        message: text('Service data import task prepared', '服务数据导入任务已准备'),
        refresh: false,
        data: {
          commandKey: 'assistant.chat.send_message',
          payload: {
            text: buildServiceDataImportAssistantMessage(draft)
          },
          importDraftId: draft.importDraftId,
          summary: draft.summary,
          fileName: draft.fileName
        }
      }
    } catch (error) {
      const message = getActionErrorMessage(error, 'File action failed')
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
      entry: SMART_MAINTENANCE_REMOTE_ENTRY_KEY
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
        key: 'smart-maintenance-tool-completed',
        event: 'assistant.tool.completed',
        filter: {
          sources: ['chatkit'],
          toolNames: [...SMART_MAINTENANCE_MIDDLEWARE_TOOL_NAMES]
        },
        action: {
          type: 'forward' as const,
          debounceMs: 1000
        }
      }
    ]
  }
}

function isSmartMaintenanceViewKey(viewKey: string) {
  return (
    viewKey === SMART_MAINTENANCE_WORKBENCH_VIEW_KEY ||
    viewKey === SMART_MAINTENANCE_REPORT_VIEW_KEY ||
    viewKey === SMART_MAINTENANCE_REVIEW_VIEW_KEY
  )
}

function scopeFromContext(context: XpertResolvedViewHostContext): SmartMaintenanceScope {
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
  const customerName = getStringInput(input, 'customerName')
  const projectName = getStringInput(input, 'projectName')
  const siteName = getStringInput(input, 'siteName')
  const reporterName = getStringInput(input, 'reporterName')
  const reporterDepartment = getStringInput(input, 'reporterDepartment')
  const reporterContact = getStringInput(input, 'reporterContact')
  return [
    '请根据以下自然语言报修内容创建智能维保工单。',
    '你必须先调用 smart_maintenance_get_catalog 获取当前服务范围与候选数据，再识别字段；不要只根据用户手填线索判断。',
    '客户、项目、场所不是用户必填项；它们只是辅助线索，缺失时不能直接要求用户手动选择。',
    '根据自然语言中的客户、项目、场所、楼栋、房间、设备名称、设备编号、故障代码与候选数据自动匹配，优先选择最可信的服务范围、设备和故障类别。',
    '如果能够匹配到唯一或明显最优候选，请调用 smart_maintenance_save_generated_work_order 保存一张待确认智能维保工单。',
    '多个候选同等合理或当前服务范围完全未覆盖时，不要调用 smart_maintenance_save_generated_work_order；请直接向用户说明候选冲突或未覆盖的范围，并提示只需补充最小必要信息。',
    '缺少非关键字段时仍可保存工单，并把缺失项写入 completenessTips；这类工单会进入待补充，但不阻塞创建。',
    '只有在没有任何候选命中或多个候选同等匹配且无法判断时，才追问用户补充需要确认的信息；追问时请明确缺少哪一项，不要让用户重填整张表。',
    '',
    `报修内容：${originalContent}`,
    customerName ? `客户名称线索：${customerName}` : '',
    projectName ? `项目名称线索：${projectName}` : '',
    siteName ? `场所名称线索：${siteName}` : '',
    reporterName ? `报修人：${reporterName}` : '',
    reporterDepartment ? `报修人部门：${reporterDepartment}` : '',
    reporterContact ? `联系方式：${reporterContact}` : '',
    '',
    '要求：一次报修只保存一张工单；如包含多个设备或多个故障，请设置 hasMultipleIssues 和 multipleIssueTip；AI 诊断仅作为初步建议；保存后请明确反馈生成的工单号、状态是待确认还是待补充，以及需要人工确认或补充的内容；不要绕过工具直接声称已保存。'
  ]
    .filter((line) => line !== '')
    .join('\n')
}

function buildServiceDataImportAssistantMessage(draft: {
  importDraftId: string
  fileName: string
  importMode: string
  summary: unknown
}) {
  return [
    '请解析并导入以下智能维保服务候选数据。',
    '你必须调用 smart_maintenance_import_service_data 工具落库；不要只总结文件内容，也不要声称已导入但未调用工具。',
    '上传文件已经由插件解析为临时导入草稿；请直接调用工具并传入 importDraftId，不要把 serviceData JSON 重新输出到对话。',
    '',
    `importDraftId：${draft.importDraftId}`,
    `文件名：${draft.fileName}`,
    `导入模式：${draft.importMode}`,
    `摘要：${JSON.stringify(draft.summary)}`,
    '',
    `工具调用要求：调用 smart_maintenance_import_service_data，参数使用 {"importDraftId":"${draft.importDraftId}","fileName":"${draft.fileName}","importMode":"${draft.importMode}"}。`
  ].join('\n')
}

function normalizeReportInput(input: Record<string, unknown> | null | undefined) {
  return {
    customerName: getStringInput(input, 'customerName'),
    projectName: getStringInput(input, 'projectName'),
    siteName: getStringInput(input, 'siteName'),
    reporterName: getStringInput(input, 'reporterName'),
    reporterDepartment: getStringInput(input, 'reporterDepartment'),
    reporterContact: getStringInput(input, 'reporterContact'),
    title: getStringInput(input, 'title'),
    deviceType: getStringInput(input, 'deviceType'),
    deviceName: getStringInput(input, 'deviceName'),
    deviceNo: getStringInput(input, 'deviceNo'),
    faultCategory: getStringInput(input, 'faultCategory'),
    faultPhenomenon: getStringInput(input, 'faultPhenomenon'),
    faultCode: getStringInput(input, 'faultCode'),
    location: getStringInput(input, 'location'),
    impactScope: getStringInput(input, 'impactScope'),
    urgency: getStringInput(input, 'urgency') as SmartMaintenanceUrgency | undefined,
    serviceType: getStringInput(input, 'serviceType') as SmartMaintenanceServiceType | undefined,
    aiDiagnosis: getStringInput(input, 'aiDiagnosis'),
    suggestedAction: getStringInput(input, 'suggestedAction'),
    recommendedDepartment: getStringInput(input, 'recommendedDepartment'),
    recommendedRole: getStringInput(input, 'recommendedRole'),
    recommendedDispatchAdvice: getStringInput(input, 'recommendedDispatchAdvice'),
    suggestedParts: getStringArrayInput(input, 'suggestedParts'),
    completenessTips: getStringArrayInput(input, 'completenessTips')
  }
}

function normalizeSupplementDraftInput(input: Record<string, unknown> | null | undefined) {
  return {
    ...normalizeReportInput(input),
    supplementContent:
      getStringInput(input, 'supplementContent') ?? getStringInput(input, 'reason') ?? getStringInput(input, 'remark'),
    confirmedDepartment: getStringInput(input, 'confirmedDepartment'),
    confirmedRole: getStringInput(input, 'confirmedRole'),
    confirmedDispatchAdvice: getStringInput(input, 'confirmedDispatchAdvice'),
    confirmedParts: getStringArrayInput(input, 'confirmedParts'),
    processingRemark: getStringInput(input, 'processingRemark')
  }
}

function getStringArrayInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    return items.length ? items : undefined
  }
  if (typeof value === 'string' && value.trim()) {
    const items = value
      .split(/[,，、;；\n]+/)
      .map((item) => item.trim())
      .filter(Boolean)
    return items.length ? items : undefined
  }
  return undefined
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
