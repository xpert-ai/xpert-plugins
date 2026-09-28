import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import type {
  XpertExtensionViewManifest, XpertResolvedViewHostContext, XpertViewActionRequest,
  XpertViewActionResult, XpertViewDataResult, XpertViewQuery, XpertRemoteComponentViewSchema,
  XpertRemoteComponentEntry
} from '@xpert-ai/contracts'
import { ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import type { IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { FEATURE, PLUGIN_NAME, PROVIDER_KEY, REMOTE_ENTRY, VIEW_KEY, MUTATION_TOOL_NAMES } from './constants.js'
import { TicketService } from './ticket.service.js'
import { scopeFromView } from './scope.js'
import { createTicketSchema, ticketRevisionSchema, confirmTicketSchema, abortAnalysisSchema, listQuerySchema, TriageError } from './domain/contracts.js'

@Injectable()
@ViewExtensionProvider(PROVIDER_KEY)
export class SupportTriageViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: TicketService) {}
  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || !['agent.workbench.main', 'agent.workbench.fixed'].includes(slot)) return []
    return [{
      key: VIEW_KEY, title: { en_US: 'Support Review', zh_Hans: '客服工单审核台' },
      description: { en_US: 'Triage, inspect source evidence and confirm replies.', zh_Hans: '工单分流、原文证据与回复审核。' },
      icon: { type: 'font', value: 'ri-customer-service-2-line' }, hostType: 'agent', slot,
      order: 30, refreshable: true, activation: { requiredFeatures: [FEATURE] },
      ...(slot === 'agent.workbench.fixed' ? { workbench: { fixed: true, menu: { enabled: true,
        label: { en_US: 'Support Review', zh_Hans: '客服审核台' }, order: 30 } } } : {}),
      source: { provider: PROVIDER_KEY, plugin: PLUGIN_NAME },
      view: { type: 'remote_component', runtime: 'esm', protocolVersion: 1,
        component: { isolation: 'iframe', entry: REMOTE_ENTRY }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', querySchema: { supportsPagination: true, supportsSearch: true,
        supportsParameters: true, defaultPageSize: 20 }, cache: { enabled: false } },
      actions: [
        { key: 'create_ticket', label: { en_US: 'Create ticket', zh_Hans: '新建工单' }, actionType: 'invoke', placement: 'toolbar' },
        { key: 'analyze_ticket', label: { en_US: 'Analyze ticket', zh_Hans: 'AI 分析' }, actionType: 'invoke', placement: 'row' },
        { key: 'confirm_ticket', label: { en_US: 'Confirm reviewed reply', zh_Hans: '确认审核结果' }, actionType: 'invoke', placement: 'row' },
        { key: 'abort_analysis', label: { en_US: 'End this attempt', zh_Hans: '结束本次分析' }, actionType: 'invoke', placement: 'row' }
      ],
      clientCommands: [{ key: 'assistant.chat.send_message', label: { en_US: 'Request analysis', zh_Hans: '请求 AI 分析' } }],
      hostEvents: { subscriptions: [{ key: 'support_triage.analysis-completed', event: 'assistant.tool.completed',
        filter: { sources: ['chatkit'], toolNames: [...MUTATION_TOOL_NAMES] }, action: { type: 'forward', debounceMs: 350 } }] }
    }]
  }

  private scope(context: XpertResolvedViewHostContext, viewKey: string) {
    if (viewKey !== VIEW_KEY) throw new TriageError('not_found')
    return scopeFromView(context)
  }
  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery): Promise<XpertViewDataResult> {
    const scope = this.scope(context, viewKey)
    const parameters = z.object({ ticketId: z.string().uuid().optional(), status: listQuerySchema.shape.status }).strict().parse(query.parameters ?? {})
    if (parameters.ticketId) return { item: await this.service.get(scope, parameters.ticketId) }
    const result = await this.service.list(scope, listQuerySchema.parse({ page: query.page, pageSize: query.pageSize,
      search: query.search, status: parameters.status }))
    return { ...result, meta: { page: result.page, pageSize: result.pageSize } }
  }
  async executeViewAction(context: XpertResolvedViewHostContext, viewKey: string, actionKey: string, request: XpertViewActionRequest): Promise<XpertViewActionResult> {
    try {
      const scope = this.scope(context, viewKey)
      switch (actionKey) {
        case 'create_ticket': return { success: true, refresh: true, data: await this.service.create(scope, createTicketSchema.parse(request.input)) }
        case 'analyze_ticket': return { success: true, refresh: true, data: await this.service.analyze(scope, ticketRevisionSchema.parse(request.input)) }
        case 'confirm_ticket': return { success: true, refresh: true, data: await this.service.confirm(scope, confirmTicketSchema.parse(request.input)) }
        case 'abort_analysis': return { success: true, refresh: true, data: await this.service.abortAnalysis(scope, abortAnalysisSchema.parse(request.input)) }
        default: throw new TriageError('not_found')
      }
    } catch (error) {
      if (error instanceof TriageError) return { success: false, data: { code: error.code } }
      if (error instanceof z.ZodError) return { success: false, data: { code: 'invalid_input' } }
      return { success: false, data: { code: 'operation_failed' }, message: { en_US: 'Operation failed. Refresh and retry.', zh_Hans: '操作失败，请刷新后重试。' } }
    }
  }
  async getRemoteComponentEntry(context: XpertResolvedViewHostContext, viewKey: string, component: XpertRemoteComponentViewSchema['component']): Promise<XpertRemoteComponentEntry> {
    this.scope(context, viewKey)
    if (component.entry !== REMOTE_ENTRY || component.isolation !== 'iframe') throw new TriageError('not_found')
    return { html: await readFile(new URL('./remote/index.html', import.meta.url), 'utf8'), contentType: 'text/html; charset=utf-8' }
  }
}
