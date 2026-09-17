import { readFile } from 'node:fs/promises'
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
import { ViewExtensionProvider, renderRemoteModuleIframeHtml } from '@xpert-ai/plugin-sdk'
import type { IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { ACTION_KEYS, FEATURE, PLUGIN_NAME, PROVIDER_KEY, REMOTE_ENTRY, TOOL_NAMES, VIEW_KEY } from './constants.js'
import type { ActionKey } from './constants.js'
import {
  TICKET_STATUSES,
  TriageError,
  confirmTicketSchema,
  createTicketSchema,
  reportDispatchFailureSchema,
  requestAnalysisSchema
} from './domain/contracts.js'
import { scopeFromView } from './scope.js'
import { ComplaintTriageService } from './triage.service.js'

const SLOTS = ['agent.workbench.main', 'agent.workbench.fixed']
const TITLE = { en_US: 'Complaint Triage', zh_Hans: '客诉分诊台' }

const ACTION_LABELS: Record<ActionKey, { en_US: string; zh_Hans: string }> = {
  create_ticket: { en_US: 'New ticket', zh_Hans: '新建工单' },
  request_analysis: { en_US: 'Analyze with AI', zh_Hans: 'AI 分析' },
  report_dispatch_failure: { en_US: 'Report dispatch failure', zh_Hans: '上报发送失败' },
  confirm_ticket: { en_US: 'Confirm and save', zh_Hans: '确认并保存' }
}

const statusParameter = z.enum(TICKET_STATUSES).optional()

@Injectable()
@ViewExtensionProvider(PROVIDER_KEY)
export class ComplaintTriageViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: ComplaintTriageService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || !SLOTS.includes(slot)) return []
    return [
      {
        key: VIEW_KEY,
        title: TITLE,
        description: {
          en_US: 'Paste a complaint, let the Assistant triage it, then review and confirm.',
          zh_Hans: '粘贴客诉，由助手分诊，再由人工复核确认。'
        },
        icon: { type: 'font', value: 'ri-customer-service-2-line' },
        hostType: 'agent',
        slot,
        order: 20,
        refreshable: false,
        // Only Assistants that carry the triage middleware get the view.
        activation: { requiredFeatures: [FEATURE] },
        ...(slot === 'agent.workbench.fixed' ? { workbench: { fixed: true, menu: { enabled: true, label: TITLE, order: 20 } } } : {}),
        source: { provider: PROVIDER_KEY, plugin: PLUGIN_NAME },
        view: {
          type: 'remote_component',
          runtime: 'esm',
          protocolVersion: 1,
          component: { isolation: 'iframe', entry: REMOTE_ENTRY },
          dataSource: { mode: 'platform' }
        },
        dataSource: {
          mode: 'platform',
          querySchema: { supportsPagination: true, supportsSearch: true, supportsSelection: true, supportsParameters: true, defaultPageSize: 20 },
          cache: { enabled: false }
        },
        actions: ACTION_KEYS.map((key) => ({ key, label: ACTION_LABELS[key], actionType: 'invoke', placement: 'toolbar' })),
        // Least privilege: the iframe may only ask the host to send a chat message.
        clientCommands: [{ key: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, label: { en_US: 'Ask the Assistant to triage', zh_Hans: '请助手分诊' } }],
        hostEvents: {
          subscriptions: [
            {
              key: 'complaint-triage-tool-completed',
              event: 'assistant.tool.completed',
              filter: { sources: ['chatkit'], toolNames: [...TOOL_NAMES] },
              action: { type: 'forward', debounceMs: 300 }
            }
          ]
        }
      }
    ]
  }

  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery): Promise<XpertViewDataResult> {
    const scope = this.scope(context, viewKey)
    if (query.selectionId) return { item: await this.service.getTicket(scope, query.selectionId) }

    const status = statusParameter.safeParse(query.parameters?.status ?? undefined)
    const list = await this.service.listTickets(scope, {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      status: status.success ? status.data : undefined
    })
    return { items: list.items, total: list.total, summary: { counts: list.counts, page: list.page, pageSize: list.pageSize } }
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    const scope = this.scope(context, viewKey)
    try {
      switch (actionKey as ActionKey) {
        case 'create_ticket':
          return { success: true, data: await this.service.createTicket(scope, createTicketSchema.parse(request.input)) }
        case 'request_analysis':
          return { success: true, data: await this.service.requestAnalysis(scope, requestAnalysisSchema.parse(request.input).ticketId) }
        case 'report_dispatch_failure': {
          const input = reportDispatchFailureSchema.parse(request.input)
          return { success: true, data: await this.service.reportDispatchFailure(scope, input.ticketId, input.attemptNo, input.reason) }
        }
        case 'confirm_ticket':
          return { success: true, data: await this.service.confirmTicket(scope, confirmTicketSchema.parse(request.input)) }
        default:
          throw new TriageError('not_found', 'action')
      }
    } catch (error) {
      // Expected failures travel as codes the Workbench localizes; anything else is a real fault.
      if (error instanceof TriageError) return { success: false, data: { code: error.code } }
      if (error instanceof z.ZodError) {
        return { success: false, data: { code: 'invalid_input', fields: [...new Set(error.issues.map((issue) => issue.path.join('.')))] } }
      }
      throw error
    }
  }

  async getRemoteComponentEntry(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    this.scope(context, viewKey)
    if (component.entry !== REMOTE_ENTRY || component.isolation !== 'iframe') throw new TriageError('not_found', 'component')
    // The shell (theme tokens, xui-* controls, init bootstrap) is rendered by the host's SDK at
    // request time, so it always matches the host; only app.js/app.css are build artifacts.
    const [appScript, appCss] = await Promise.all([
      readFile(new URL('../remote/app.js', import.meta.url), 'utf8'),
      readFile(new URL('../remote/app.css', import.meta.url), 'utf8')
    ])
    return {
      html: renderRemoteModuleIframeHtml({ title: TITLE.en_US, lang: context.locale ?? 'en', appScript, appCss }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  private scope(context: XpertResolvedViewHostContext, viewKey: string) {
    if (viewKey !== VIEW_KEY) throw new TriageError('not_found', 'view')
    return scopeFromView(context)
  }
}
