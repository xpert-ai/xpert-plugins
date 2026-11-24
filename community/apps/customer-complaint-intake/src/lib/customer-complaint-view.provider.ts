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
  XpertViewDataResult,
  XpertViewQuery,
  XpertViewScalar
} from '@xpert-ai/contracts'
import {
  IXpertViewExtensionProvider,
  ViewExtensionProvider,
  renderRemoteReactIframeHtml
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  COMPLAINT_FEATURE,
  COMPLAINT_MIDDLEWARE_TOOL_NAMES,
  COMPLAINT_PLUGIN_NAME,
  COMPLAINT_PROVIDER_KEY,
  COMPLAINT_REMOTE_ENTRY_KEY,
  COMPLAINT_WORKBENCH_VIEW_KEY
} from './constants'
import { CustomerComplaintService } from './customer-complaint.service'
import { isComplaintCategory, isComplaintUrgency } from './rules'
import type { ComplaintFieldEdits, ComplaintScope } from './types'

const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

@Injectable()
@ViewExtensionProvider(COMPLAINT_PROVIDER_KEY)
export class CustomerComplaintViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: CustomerComplaintService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT) return []
    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT
    return [
      {
        key: COMPLAINT_WORKBENCH_VIEW_KEY,
        title: text('Complaint Intake', '投诉受理台'),
        description: text(
          'Paste a customer complaint, review the AI draft, and confirm or return it.',
          '粘贴客户原话，复核 AI 草稿，再确认受理或退回补充。'
        ),
        icon: { type: 'font', value: 'ri-customer-service-2-line', color: '#b45309' },
        hostType: 'agent',
        slot,
        order: 30,
        refreshable: true,
        activation: { requiredFeatures: [COMPLAINT_FEATURE] },
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Complaint Intake', '投诉受理'),
                  order: 30,
                  icon: { type: 'font', value: 'ri-customer-service-2-line', color: '#b45309' }
                }
              }
            }
          : {}),
        source: { provider: COMPLAINT_PROVIDER_KEY, plugin: COMPLAINT_PLUGIN_NAME },
        view: remoteView(),
        dataSource: { mode: 'platform', querySchema: { supportsPagination: true, supportsSearch: true, defaultPageSize: 20 }, cache: { enabled: false } },
        hostEvents: {
          subscriptions: [
            {
              key: 'customer-complaint-tool-completed',
              event: 'assistant.tool.completed',
              filter: { sources: ['chatkit'], toolNames: [...COMPLAINT_MIDDLEWARE_TOOL_NAMES] },
              action: { type: 'forward', debounceMs: 800 }
            }
          ]
        },
        clientCommands: [{ key: 'assistant.chat.send_message', label: text('Send to Assistant', '发送给助手') }],
        actions: [
          { key: 'prepare_chat_message', label: text('Draft with Assistant', '交给助手生成草稿'), placement: 'toolbar', actionType: 'invoke' },
          { key: 'update_case', label: text('Save edits', '保存修改'), placement: 'toolbar', actionType: 'invoke' },
          { key: 'confirm_intake', label: text('Confirm intake', '确认受理'), placement: 'toolbar', actionType: 'invoke' },
          { key: 'return_for_supplement', label: text('Return', '退回补充'), placement: 'toolbar', actionType: 'invoke' },
          { key: 'simulate_model_failure', label: text('Simulate model failure', '模拟模型失败'), placement: 'toolbar', actionType: 'invoke' }
        ]
      }
    ]
  }

  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== COMPLAINT_WORKBENCH_VIEW_KEY || component.entry !== COMPLAINT_REMOTE_ENTRY_KEY) {
      return { html: '<p>Unsupported complaint intake view.</p>', contentType: 'text/html; charset=utf-8' }
    }
    const appScript = await readFile(join(__dirname, 'remote-components', COMPLAINT_REMOTE_ENTRY_KEY, 'app.js'), 'utf8')
    const reactUmd = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDomUmd = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    return {
      html: renderRemoteReactIframeHtml({ title: '投诉受理台', lang: 'zh-Hans', reactUmd, reactDomUmd, appScript }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery): Promise<XpertViewDataResult> {
    if (viewKey !== COMPLAINT_WORKBENCH_VIEW_KEY) return {}
    return this.service.getViewData(scopeFromContext(context), {
      caseId: readScalar(query.parameters, 'caseId'),
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
      if (viewKey !== COMPLAINT_WORKBENCH_VIEW_KEY) return failure('Unsupported view', '不支持的视图')
      const scope = scopeFromContext(context)
      const caseId = request.targetId ?? readInput(request.input, 'caseId')
      if (actionKey === 'prepare_chat_message') {
        const rawText = readInput(request.input, 'rawText')
        if (!rawText) return failure('Customer text is required', '请先粘贴客户原话')
        if (rawText.trim().length < 8) return failure('Text is too short', '客户原话过短，请补充具体问题、订单号和联系方式')
        const draft = await this.service.ensureRawCase(scope, rawText, caseId)
        return {
          success: true,
          message: text('Assistant message prepared', '已交给助手生成草稿'),
          refresh: true,
          data: {
            caseId: draft.id,
            commandKey: 'assistant.chat.send_message',
            payload: { text: buildAssistantMessage(draft.id, rawText) }
          }
        }
      }
      if (actionKey === 'simulate_model_failure') {
        const failed = await this.service.simulateModelFailure(scope, caseId, readInput(request.input, 'rawText'))
        return { success: true, message: text('Failure recorded', '已记录模型失败'), refresh: true, data: { caseId: failed.id } }
      }
      if (!caseId) return failure('Case is required', '请先选择或创建一条受理单')
      if (actionKey === 'update_case') {
        await this.service.updateFields(scope, caseId, readEdits(request.input))
      } else if (actionKey === 'confirm_intake') {
        await this.service.confirmIntake(scope, caseId, readEdits(request.input))
      } else if (actionKey === 'return_for_supplement') {
        await this.service.returnForSupplement(scope, caseId, readInput(request.input, 'reason'))
      } else {
        return failure('Unsupported action', '不支持的操作')
      }
      return { success: true, message: text('Saved', '已保存'), refresh: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : '操作失败'
      return failure(message, message)
    }
  }
}

function remoteView(): XpertRemoteComponentViewSchema {
  return {
    type: 'remote_component',
    runtime: 'react',
    protocolVersion: 1,
    component: { isolation: 'iframe', entry: COMPLAINT_REMOTE_ENTRY_KEY },
    dataSource: { mode: 'platform' }
  }
}

function scopeFromContext(context: XpertResolvedViewHostContext): ComplaintScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.hostId
  }
}

function readScalar(parameters: Record<string, XpertViewScalar | XpertViewScalar[]> | undefined, key: string) {
  const value = parameters?.[key]
  const normalized = Array.isArray(value) ? value[0] : value
  return typeof normalized === 'string' && normalized.trim() ? normalized.trim() : undefined
}

function readInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readEdits(input: Record<string, unknown> | null | undefined): ComplaintFieldEdits {
  const category = readInput(input, 'category')
  const urgency = readInput(input, 'urgency')
  return {
    rawText: readInput(input, 'rawText'),
    category: isComplaintCategory(category) ? category : undefined,
    urgency: isComplaintUrgency(urgency) ? urgency : undefined,
    customerDemand: readInput(input, 'customerDemand'),
    suggestedReply: readInput(input, 'suggestedReply'),
    escalationReason: readInput(input, 'escalationReason'),
    orderNo: readInput(input, 'orderNo'),
    contact: readInput(input, 'contact'),
    escalationSuggested: typeof input?.escalationSuggested === 'boolean' ? input.escalationSuggested : undefined
  }
}

function buildAssistantMessage(caseId: string, rawText: string) {
  return [
    '请根据下面的客户原话生成一条投诉受理草稿。',
    `必须调用 complaint_save_intake_draft，并传入 caseId "${caseId}"，更新这一条记录，不要新建第二张。`,
    '只提取原文中明确出现的订单号、联系方式、诉求和问题类型。缺失项写入 missingFields，不要编造。',
    '建议回复不能承诺退款、赔偿到账或关闭投诉。',
    '如果原文提到多次投诉、监管、12315 或高额赔偿，把 escalationSuggested 设为 true。',
    '',
    `caseId：${caseId}`,
    `客户原话：${rawText}`
  ].join('\n')
}

function failure(en_US: string, zh_Hans: string): XpertViewActionResult {
  return { success: false, message: text(en_US, zh_Hans) }
}

async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
}
