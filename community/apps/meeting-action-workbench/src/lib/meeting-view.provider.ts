import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type {
  I18nObject,
  IconDefinition,
  JsonSchemaObjectType,
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery,
  XpertViewScalar
} from '@xpert-ai/contracts'
import { IXpertViewExtensionProvider, renderRemoteReactIframeHtml, ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  MEETING_FEATURE,
  MEETING_ICON,
  MEETING_MUTATION_TOOL_NAMES,
  MEETING_PLUGIN_NAME,
  MEETING_PROVIDER_KEY,
  MEETING_REMOTE_ENTRY_KEY,
  MEETING_VIEW_KEY
} from './constants'
import { MeetingService } from './meeting.service'
import { MeetingDomainError, type MeetingScope, type MeetingStatus } from './types'

const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const VIEW_ICON = { type: 'svg', value: MEETING_ICON, alt: 'Meeting Action Workbench' } satisfies IconDefinition

const expectedRevisionSchema = z.number().int().positive()
const updateDecisionSchema = z.object({
  decisionId: z.string().uuid(),
  expectedRevision: expectedRevisionSchema,
  statement: z.string().trim().min(2).max(2_000),
  reviewStatus: z.enum(['pending', 'confirmed', 'edited', 'rejected'])
}).strict()
const updateActionSchema = z.object({
  actionItemId: z.string().uuid(),
  expectedRevision: expectedRevisionSchema,
  task: z.string().trim().min(2).max(2_000),
  owner: z.string().trim().max(160).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']),
  status: z.enum(['pending_confirmation', 'pending', 'in_progress', 'completed', 'cancelled']),
  reviewStatus: z.enum(['pending', 'confirmed', 'edited', 'rejected'])
}).strict()
const confirmSchema = z.object({ expectedRevision: expectedRevisionSchema }).strict()
const updateExecutionActionSchema = z.object({
  actionItemId: z.string().uuid(),
  expectedRevision: expectedRevisionSchema,
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled'])
}).strict()
const updateRiskSignalSchema = z.object({
  riskSignalId: z.string().uuid(),
  expectedRevision: expectedRevisionSchema,
  reviewStatus: z.enum(['accepted', 'dismissed', 'resolved'])
}).strict()

const updateDecisionInputSchema = {
  type: 'object',
  properties: {
    decisionId: { type: 'string', title: text('Decision', '决议') },
    expectedRevision: { type: 'number', title: text('Expected revision', '预期版本') },
    statement: { type: 'string', title: text('Statement', '决议内容') },
    reviewStatus: { type: 'string', title: text('Review status', '复核状态') }
  },
  required: ['decisionId', 'expectedRevision', 'statement', 'reviewStatus']
} satisfies JsonSchemaObjectType

const updateActionInputSchema = {
  type: 'object',
  properties: {
    actionItemId: { type: 'string', title: text('Action item', '行动项') },
    expectedRevision: { type: 'number', title: text('Expected revision', '预期版本') },
    task: { type: 'string', title: text('Task', '任务') },
    owner: { type: 'string', title: text('Owner', '负责人') },
    dueDate: { type: 'string', title: text('Due date', '截止日期') },
    priority: { type: 'string', title: text('Priority', '优先级') },
    status: { type: 'string', title: text('Status', '状态') },
    reviewStatus: { type: 'string', title: text('Review status', '复核状态') }
  },
  required: ['actionItemId', 'expectedRevision', 'task', 'priority', 'status', 'reviewStatus']
} satisfies JsonSchemaObjectType

const confirmInputSchema = {
  type: 'object',
  properties: { expectedRevision: { type: 'number', title: text('Expected revision', '预期版本') } },
  required: ['expectedRevision']
} satisfies JsonSchemaObjectType

const updateExecutionActionInputSchema = {
  type: 'object',
  properties: {
    actionItemId: { type: 'string', title: text('Action item', '行动项') },
    expectedRevision: { type: 'number', title: text('Expected revision', '预期版本') },
    status: { type: 'string', title: text('Execution status', '执行状态') }
  },
  required: ['actionItemId', 'expectedRevision', 'status']
} satisfies JsonSchemaObjectType

const updateRiskSignalInputSchema = {
  type: 'object',
  properties: {
    riskSignalId: { type: 'string', title: text('Risk signal', '风险信号') },
    expectedRevision: { type: 'number', title: text('Expected revision', '预期版本') },
    reviewStatus: { type: 'string', title: text('Review status', '处置状态') }
  },
  required: ['riskSignalId', 'expectedRevision', 'reviewStatus']
} satisfies JsonSchemaObjectType

@Injectable()
@ViewExtensionProvider(MEETING_PROVIDER_KEY)
export class MeetingViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: MeetingService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT) return []
    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT
    return [{
      key: MEETING_VIEW_KEY,
      title: text('Meeting Action Workbench', '会议决议与行动项工作台'),
      description: text(
        'Extract meeting decisions, track execution, inspect Agent risks, and prepare follow-up briefs.',
        '提取会议决议、跟踪执行、复核 Agent 风险并准备跟进简报。'
      ),
      icon: VIEW_ICON,
      hostType: 'agent',
      slot,
      order: fixed ? 22 : 18,
      refreshable: true,
      activation: { requiredFeatures: [MEETING_FEATURE] },
      ...(fixed ? {
        workbench: {
          fixed: true,
          menu: { enabled: true, label: text('Meeting actions', '会议行动项'), order: 22, icon: VIEW_ICON }
        }
      } : {}),
      source: { provider: MEETING_PROVIDER_KEY, plugin: MEETING_PLUGIN_NAME },
      parameters: [
        { key: 'meetingId', label: text('Meeting', '会议'), type: 'string' },
        { key: 'status', label: text('Status', '状态'), type: 'string' },
        { key: 'executionStatus', label: text('Execution status', '执行状态'), type: 'string' },
        { key: 'executionOwner', label: text('Owner', '负责人'), type: 'string' },
        { key: 'executionPage', label: text('Execution page', '执行页码'), type: 'number' }
      ],
      view: {
        type: 'remote_component',
        runtime: 'react',
        protocolVersion: 1,
        component: { isolation: 'iframe', entry: MEETING_REMOTE_ENTRY_KEY },
        dataSource: { mode: 'platform' }
      },
      dataSource: {
        mode: 'platform',
        querySchema: {
          supportsPagination: true,
          supportsSearch: true,
          supportsSort: false,
          supportsSelection: true,
          supportsParameters: true,
          defaultPageSize: 20
        },
        cache: { enabled: false }
      },
      clientCommands: [
        { key: 'assistant.chat.send_message', label: text('Send chat message', '发送到 Assistant 对话') }
      ],
      hostEvents: {
        subscriptions: [{
          key: 'meeting-extraction-updated',
          event: 'assistant.tool.completed',
          filter: { sources: ['chatkit'], toolNames: [...MEETING_MUTATION_TOOL_NAMES] },
          action: { type: 'forward', debounceMs: 500 }
        }]
      },
      actions: [
        { key: 'refresh', label: text('Refresh', '刷新'), icon: 'ri-refresh-line', placement: 'toolbar', actionType: 'refresh' },
        {
          key: 'update_decision',
          label: text('Save decision', '保存决议'),
          icon: 'ri-save-3-line',
          placement: 'toolbar',
          actionType: 'invoke',
          inputSchema: updateDecisionInputSchema
        },
        {
          key: 'update_action_item',
          label: text('Save action item', '保存行动项'),
          icon: 'ri-save-3-line',
          placement: 'toolbar',
          actionType: 'invoke',
          inputSchema: updateActionInputSchema
        },
        {
          key: 'confirm_meeting',
          label: text('Confirm meeting result', '确认会议结果'),
          icon: 'ri-checkbox-circle-line',
          placement: 'toolbar',
          actionType: 'invoke',
          inputSchema: confirmInputSchema
        },
        {
          key: 'update_execution_action',
          label: text('Update execution status', '更新执行状态'),
          icon: 'ri-progress-3-line',
          placement: 'toolbar',
          actionType: 'invoke',
          inputSchema: updateExecutionActionInputSchema
        },
        {
          key: 'update_risk_signal_status',
          label: text('Review risk signal', '处置风险信号'),
          icon: 'ri-shield-check-line',
          placement: 'toolbar',
          actionType: 'invoke',
          inputSchema: updateRiskSignalInputSchema
        }
      ]
    }]
  }

  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== MEETING_VIEW_KEY || component.entry !== MEETING_REMOTE_ENTRY_KEY) {
      return { html: '<!doctype html><html><body>Unsupported meeting component.</body></html>', contentType: 'text/html; charset=utf-8' }
    }
    const componentDir = join(__dirname, 'remote-components', MEETING_REMOTE_ENTRY_KEY)
    const [appScript, appCss, reactUmd, reactDomUmd] = await Promise.all([
      readFile(join(componentDir, 'app.js'), 'utf8'),
      readFile(join(componentDir, 'app.css'), 'utf8'),
      readPackageFile('react', 'umd/react.production.min.js'),
      readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    ])
    return {
      html: renderRemoteReactIframeHtml({
        title: 'Meeting Action Workbench',
        lang: 'zh-Hans',
        reactUmd,
        reactDomUmd,
        appScript,
        appCss
      }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery): Promise<XpertViewDataResult> {
    if (viewKey !== MEETING_VIEW_KEY) return {}
    const status = getStringParameter(query.parameters, 'status')
    return this.service.getWorkbench(scopeFromContext(context), {
      meetingId: getStringParameter(query.parameters, 'meetingId'),
      status: isMeetingStatus(status) ? status : undefined,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize,
      executionPage: getNumberParameter(query.parameters, 'executionPage'),
      executionPageSize: 20,
      executionStatus: isActionStatus(getStringParameter(query.parameters, 'executionStatus'))
        ? getStringParameter(query.parameters, 'executionStatus') as 'pending' | 'in_progress' | 'completed' | 'cancelled'
        : undefined,
      executionOwner: getStringParameter(query.parameters, 'executionOwner')
    })
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    try {
      if (viewKey !== MEETING_VIEW_KEY) return failure('UNSUPPORTED_VIEW', 'Unsupported meeting view.', '不支持的会议视图。')
      if (actionKey === 'refresh') return success('Meeting view refreshed.', '会议视图已刷新。')
      const meetingId = request.targetId
      if (!meetingId) return failure('MEETING_ID_REQUIRED', 'Meeting id is required.', '缺少会议 ID。')
      const scope = scopeFromContext(context)
      if (actionKey === 'update_decision') {
        const parsed = updateDecisionSchema.safeParse(request.input)
        if (!parsed.success) return validationFailure(parsed.error.message)
        const data = await this.service.updateDecision(scope, meetingId, parsed.data)
        return { success: true, message: text('Decision saved.', '决议已保存。'), refresh: true, data }
      }
      if (actionKey === 'update_action_item') {
        const parsed = updateActionSchema.safeParse(request.input)
        if (!parsed.success) return validationFailure(parsed.error.message)
        const data = await this.service.updateActionItem(scope, meetingId, parsed.data)
        return { success: true, message: text('Action item saved.', '行动项已保存。'), refresh: true, data }
      }
      if (actionKey === 'confirm_meeting') {
        const parsed = confirmSchema.safeParse(request.input)
        if (!parsed.success) return validationFailure(parsed.error.message)
        const data = await this.service.confirmMeeting(scope, meetingId, parsed.data.expectedRevision)
        return { success: true, message: text('Meeting result confirmed.', '会议结果已确认。'), refresh: true, data }
      }
      if (actionKey === 'update_execution_action') {
        const parsed = updateExecutionActionSchema.safeParse(request.input)
        if (!parsed.success) return validationFailure(parsed.error.message)
        const data = await this.service.updateExecutionAction(scope, meetingId, parsed.data)
        return { success: true, message: text('Execution status updated.', '执行状态已更新。'), refresh: true, data }
      }
      if (actionKey === 'update_risk_signal_status') {
        const parsed = updateRiskSignalSchema.safeParse(request.input)
        if (!parsed.success) return validationFailure(parsed.error.message)
        const data = await this.service.updateRiskSignalStatus(scope, meetingId, parsed.data)
        return { success: true, message: text('Risk signal reviewed.', '风险信号已处置。'), refresh: true, data }
      }
      return failure('UNSUPPORTED_ACTION', 'Unsupported meeting action.', '不支持的会议操作。')
    } catch (error) {
      const code = error instanceof MeetingDomainError ? error.code : 'MEETING_ACTION_FAILED'
      const message = error instanceof Error ? error.message : 'Meeting action failed.'
      return failure(code, message, message)
    }
  }
}

function scopeFromContext(context: XpertResolvedViewHostContext): MeetingScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.hostId
  }
}

function getStringParameter(parameters: Record<string, XpertViewScalar | XpertViewScalar[]> | undefined, key: string) {
  const value = parameters?.[key]
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' && first.trim() ? first.trim() : undefined
}

function isMeetingStatus(value?: string): value is MeetingStatus {
  return value === 'processing' || value === 'review_required' || value === 'confirmed' || value === 'failed'
}

function isActionStatus(value?: string): value is 'pending' | 'in_progress' | 'completed' | 'cancelled' {
  return value === 'pending' || value === 'in_progress' || value === 'completed' || value === 'cancelled'
}

function getNumberParameter(parameters: Record<string, XpertViewScalar | XpertViewScalar[]> | undefined, key: string) {
  const value = parameters?.[key]
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'number' && Number.isFinite(first) ? first : undefined
}

async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
}

function success(en_US: string, zh_Hans: string): XpertViewActionResult {
  return { success: true, message: text(en_US, zh_Hans), refresh: true }
}

function failure(errorCode: string, en_US: string, zh_Hans: string): XpertViewActionResult {
  return { success: false, message: text(en_US, zh_Hans), data: { errorCode } }
}

function validationFailure(detail: string) {
  return failure('VALIDATION_FAILED', `Invalid action input: ${detail}`, `操作输入无效：${detail}`)
}
