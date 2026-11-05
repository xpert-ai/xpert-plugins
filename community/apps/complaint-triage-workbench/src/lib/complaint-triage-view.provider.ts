import { HttpException, Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  I18nObject,
  JsonSchemaObjectType,
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
  renderRemoteModuleIframeHtml,
  ViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { ComplaintAssistantTaskService } from './complaint-assistant-task.service.js'
import { ComplaintCaseService } from './complaint-case.service.js'
import {
  complaintCaseIdSchema,
  confirmComplaintCaseSchema,
  createComplaintCaseSchema,
  saveComplaintReviewSchema
} from './domain/complaint.schemas.js'
import type { ComplaintScope } from './domain/complaint.types.js'
import { safeComplaintErrorMessage } from './domain/complaint-errors.js'
import {
  AGENT_DETAIL_SIDEBAR_SLOT,
  AGENT_WORKBENCH_FIXED_SLOT,
  COMPLAINT_TRIAGE_FEATURE,
  COMPLAINT_TRIAGE_PLUGIN_NAME,
  COMPLAINT_TRIAGE_RUNTIME_PROBE_VIEW_KEY,
  COMPLAINT_TRIAGE_VIEW_PROVIDER_KEY,
  COMPLAINT_TRIAGE_WORKBENCH_REMOTE_ENTRY_KEY,
  COMPLAINT_TRIAGE_WORKBENCH_VIEW_KEY
} from './constants.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const statusInputSchema = z
  .object({
    taskId: z.string().min(1).optional(),
    executionId: z.string().min(1).optional(),
    conversationId: z.string().min(1).optional(),
    threadId: z.string().min(1).optional(),
    clientMessageId: z.string().min(1).optional(),
    xpertId: z.string().min(1).optional()
  })
  .refine((value) => Object.values(value).some(Boolean), 'At least one task identifier is required.')

const complaintResultJsonSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    category: { type: 'string' },
    urgency: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
    customerIntent: { type: 'string' },
    riskFlags: { type: 'array', items: { type: 'string' } },
    suggestedAction: { type: 'string' },
    replyDraft: { type: 'string' }
  },
  required: [
    'summary',
    'category',
    'urgency',
    'customerIntent',
    'riskFlags',
    'suggestedAction',
    'replyDraft'
  ],
  additionalProperties: false
} as const

const createCaseActionSchema = {
  type: 'object',
  properties: {
    customerName: { type: 'string' },
    customerReference: { type: 'string' },
    complaintContent: { type: 'string' }
  },
  required: ['customerName', 'complaintContent'],
  additionalProperties: false
} satisfies JsonSchemaObjectType

const caseActionSchema = {
  type: 'object',
  properties: { caseId: { type: 'string', format: 'uuid' } },
  required: ['caseId'],
  additionalProperties: false
} satisfies JsonSchemaObjectType

const reviewActionSchema = {
  type: 'object',
  properties: {
    caseId: { type: 'string', format: 'uuid' },
    result: complaintResultJsonSchema
  },
  required: ['caseId', 'result'],
  additionalProperties: false
} satisfies JsonSchemaObjectType

const statusActionInputSchema = {
  type: 'object',
  properties: {
    taskId: { type: 'string' },
    executionId: { type: 'string' },
    conversationId: { type: 'string' },
    threadId: { type: 'string' },
    clientMessageId: { type: 'string' },
    xpertId: { type: 'string' }
  }
} satisfies JsonSchemaObjectType

type ComplaintWorkbenchData = XpertViewDataResult & {
  tableKey: 'complaintCases'
  table: {
    key: 'complaintCases'
    items: Awaited<ReturnType<ComplaintCaseService['listCases']>>['items']
    total: number
    page: number
    pageSize: number
  }
  selectedCase: Awaited<ReturnType<ComplaintCaseService['getCase']>> | null
  empty: boolean
}

@Injectable()
@ViewExtensionProvider(COMPLAINT_TRIAGE_VIEW_PROVIDER_KEY)
export class ComplaintTriageViewProvider implements IXpertViewExtensionProvider {
  constructor(
    private readonly assistantTasks: ComplaintAssistantTaskService,
    private readonly cases: ComplaintCaseService
  ) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(
    context: XpertResolvedViewHostContext,
    slot: string
  ): XpertExtensionViewManifest[] {
    if (context.hostType !== 'agent') return []
    if (slot === AGENT_WORKBENCH_FIXED_SLOT) return [workbenchManifest(slot, true)]
    if (slot === AGENT_DETAIL_SIDEBAR_SLOT) {
      return [workbenchManifest(slot, false), runtimeProbeManifest(slot)]
    }
    return []
  }

  async getRemoteComponentEntry(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (
      viewKey !== COMPLAINT_TRIAGE_WORKBENCH_VIEW_KEY ||
      component.entry !== COMPLAINT_TRIAGE_WORKBENCH_REMOTE_ENTRY_KEY
    ) {
      return {
        html: '<!doctype html><html><body>Unsupported Complaint Triage component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    const componentDir = join(
      moduleDir,
      'remote-components',
      COMPLAINT_TRIAGE_WORKBENCH_REMOTE_ENTRY_KEY
    )
    const [appScript, appCss] = await Promise.all([
      readFile(join(componentDir, 'app.js'), 'utf8'),
      readFile(join(componentDir, 'app.css'), 'utf8')
    ])
    return {
      html: renderRemoteModuleIframeHtml({
        title: 'Complaint Triage Workbench',
        lang: normalizeHtmlLang(context.locale),
        appScript,
        appCss
      }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ): Promise<ComplaintWorkbenchData | XpertViewDataResult> {
    if (viewKey === COMPLAINT_TRIAGE_RUNTIME_PROBE_VIEW_KEY) {
      return {
        summary: {
          status: 'ready',
          xpertId: context.hostId,
          persistence: false,
          purpose: 'assistant_task_runtime_verification'
        }
      }
    }
    if (viewKey !== COMPLAINT_TRIAGE_WORKBENCH_VIEW_KEY) return {}
    const scope = scopeFromContext(context)
    const result = await this.cases.listCases(scope, {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search
    })
    const selectedCase = query.selectionId
      ? await this.cases.getCase(scope, query.selectionId)
      : (result.items[0] ?? null)
    return {
      tableKey: 'complaintCases',
      table: {
        key: 'complaintCases',
        items: result.items,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize
      },
      selectedCase,
      empty: result.total === 0
    }
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    try {
      if (viewKey === COMPLAINT_TRIAGE_RUNTIME_PROBE_VIEW_KEY) {
        return await this.executeProbeAction(context, actionKey, request)
      }
      if (viewKey !== COMPLAINT_TRIAGE_WORKBENCH_VIEW_KEY) {
        return failure('Unsupported Complaint Triage view.')
      }
      const scope = scopeFromContext(context)
      if (actionKey === 'create_case') {
        const input = createComplaintCaseSchema.parse(request.input)
        return success('Complaint case created.', await this.cases.createCase(scope, input), true)
      }
      if (actionKey === 'analyze_case') {
        const { caseId } = complaintCaseIdSchema.parse(request.input)
        return success(
          'Complaint analysis started.',
          await this.assistantTasks.startCaseAnalysis(scope, context.hostId, caseId),
          true
        )
      }
      if (actionKey === 'check_analysis') {
        const { caseId } = complaintCaseIdSchema.parse(request.input)
        return success(
          'Complaint analysis status resolved.',
          await this.assistantTasks.reconcileCaseAnalysis(scope, caseId),
          true
        )
      }
      if (actionKey === 'retry_case') {
        const { caseId } = complaintCaseIdSchema.parse(request.input)
        return success(
          'Complaint analysis retry started.',
          await this.assistantTasks.startCaseAnalysis(scope, context.hostId, caseId, true),
          true
        )
      }
      if (actionKey === 'save_review') {
        const input = saveComplaintReviewSchema.parse(request.input)
        return success(
          'Complaint review draft saved.',
          await this.cases.saveReview(scope, input.caseId, input.result),
          true
        )
      }
      if (actionKey === 'confirm_case') {
        const input = confirmComplaintCaseSchema.parse(request.input)
        return success(
          'Complaint case confirmed.',
          await this.cases.confirmCase(scope, input.caseId, input.result),
          true
        )
      }
      return failure(`Unsupported Complaint Triage action '${actionKey}'.`)
    } catch (error) {
      return actionFailure(error)
    }
  }

  private async executeProbeAction(
    context: XpertResolvedViewHostContext,
    actionKey: string,
    request: XpertViewActionRequest
  ) {
    if (actionKey === 'start_runtime_probe') {
      const result = await this.assistantTasks.startRuntimeProbe(context.hostId)
      return success('Assistant Task runtime probe started.', result)
    }
    if (actionKey === 'check_runtime_probe') {
      const reference = statusInputSchema.parse(request.input ?? {})
      const result = await this.assistantTasks.getRuntimeProbeStatus(reference)
      return success('Assistant Task runtime probe status resolved.', result ?? { status: 'unknown' })
    }
    return failure('Unsupported Complaint Triage probe action.')
  }
}

function workbenchManifest(slot: string, fixed: boolean): XpertExtensionViewManifest {
  return {
    key: COMPLAINT_TRIAGE_WORKBENCH_VIEW_KEY,
    title: text('Complaint Triage Workbench', '客诉分诊工作台'),
    description: text(
      'Create, analyze, review, and confirm persisted complaint cases.',
      '创建、分析、审核并确认持久化客诉工单。'
    ),
    hostType: 'agent',
    slot,
    order: 20,
    refreshable: true,
    ...(fixed
      ? {
          activation: { requiredFeatures: [COMPLAINT_TRIAGE_FEATURE] },
          workbench: {
            fixed: true,
            menu: {
              enabled: true,
              label: text('Complaint triage', '客诉分诊'),
              order: 20
            }
          }
        }
      : {}),
    source: {
      provider: COMPLAINT_TRIAGE_VIEW_PROVIDER_KEY,
      plugin: COMPLAINT_TRIAGE_PLUGIN_NAME
    },
    view: {
      type: 'remote_component',
      runtime: 'esm',
      protocolVersion: 1,
      component: {
        isolation: 'iframe',
        entry: COMPLAINT_TRIAGE_WORKBENCH_REMOTE_ENTRY_KEY
      },
      dataSource: { mode: 'platform' }
    },
    dataSource: {
      mode: 'platform',
      querySchema: {
        supportsPagination: true,
        supportsSearch: true,
        supportsSelection: true,
        defaultPageSize: 20
      },
      cache: { enabled: false }
    },
    actions: [
      action('create_case', 'Create complaint', '创建投诉', createCaseActionSchema, 'toolbar'),
      action('analyze_case', 'Analyze with AI', 'AI 分析', caseActionSchema),
      action('check_analysis', 'Check analysis', '查询分析', caseActionSchema),
      action('retry_case', 'Retry analysis', '重试分析', caseActionSchema),
      action('save_review', 'Save review', '保存审核', reviewActionSchema),
      action('confirm_case', 'Confirm complaint', '确认投诉', reviewActionSchema)
    ]
  }
}

function runtimeProbeManifest(slot: string): XpertExtensionViewManifest {
  return {
    key: COMPLAINT_TRIAGE_RUNTIME_PROBE_VIEW_KEY,
    title: text('Complaint Runtime Probe', '客诉运行时探针'),
    description: text(
      'Temporary platform probe for Assistant Task runtime verification.',
      '用于验证 Assistant Task 运行时的临时平台探针。'
    ),
    hostType: 'agent',
    slot,
    order: 90,
    refreshable: true,
    source: {
      provider: COMPLAINT_TRIAGE_VIEW_PROVIDER_KEY,
      plugin: COMPLAINT_TRIAGE_PLUGIN_NAME
    },
    view: { type: 'raw_json' },
    dataSource: { mode: 'platform', cache: { enabled: false } },
    actions: [
      action('start_runtime_probe', 'Start runtime probe', '启动运行时探针', undefined, 'toolbar'),
      action(
        'check_runtime_probe',
        'Check runtime probe',
        '查询运行时探针',
        statusActionInputSchema,
        'toolbar'
      )
    ]
  }
}

function action(
  key: string,
  en_US: string,
  zh_Hans: string,
  inputSchema?: JsonSchemaObjectType,
  placement?: 'toolbar' | 'row'
) {
  return {
    key,
    label: text(en_US, zh_Hans),
    actionType: 'invoke' as const,
    ...(placement ? { placement } : {}),
    ...(inputSchema ? { inputSchema } : {})
  }
}

function scopeFromContext(context: XpertResolvedViewHostContext): ComplaintScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? null,
    userId: context.userId ?? null
  }
}

function success(message: string, data: unknown, refresh = false): XpertViewActionResult {
  return { success: true, message: text(message, message), data, refresh }
}

function failure(message: string): XpertViewActionResult {
  return { success: false, message: text(message, message), refresh: false }
}

function actionFailure(error: unknown): XpertViewActionResult {
  if (error instanceof HttpException) {
    const response = error.getResponse()
    const message =
      typeof response === 'string'
        ? response
        : typeof response === 'object' && response && typeof Reflect.get(response, 'message') === 'string'
          ? Reflect.get(response, 'message')
          : error.message
    return failure(safeComplaintErrorMessage(message))
  }
  if (error instanceof z.ZodError) return failure(error.issues.map((issue) => issue.message).join('; '))
  return failure(safeComplaintErrorMessage(error instanceof Error ? error.message : 'Complaint operation failed.'))
}

function normalizeHtmlLang(locale?: string) {
  return locale?.toLowerCase().startsWith('zh') ? 'zh-Hans' : 'en'
}
