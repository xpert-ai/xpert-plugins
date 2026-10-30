import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import type { XpertExtensionViewManifest, XpertResolvedViewHostContext, XpertViewActionRequest, XpertViewActionResult, XpertViewDataResult, XpertViewQuery, XpertRemoteComponentViewSchema, XpertRemoteComponentEntry } from '@xpert-ai/contracts'
import { ViewExtensionProvider, type IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { actionSchema, confirmSchema, FEATURE, intakeSchema, PROVIDER, TriageError, VIEW } from './domain.js'
import { TriageService } from './service.js'
import { viewScope } from './scope.js'

@Injectable()
@ViewExtensionProvider(PROVIDER)
export class TriageView implements IXpertViewExtensionProvider {
  constructor(private readonly service: TriageService) {}
  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' }
  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || !['agent.workbench.main', 'agent.workbench.fixed'].includes(slot)) return []
    return [{
      key: VIEW, title: { en_US: 'Support triage', zh_Hans: '工单分诊' }, hostType: 'agent', slot, order: 40,
      source: { provider: PROVIDER, plugin: '@community/apps-support-triage' },
      icon: { type: 'font', value: 'ri-customer-service-2-line' }, activation: { requiredFeatures: [FEATURE] },
      ...(slot === 'agent.workbench.fixed' ? { workbench: { fixed: true, menu: { enabled: true, label: { en_US: 'Support triage', zh_Hans: '工单分诊' }, order: 40 } } } : {}),
      view: { type: 'remote_component', runtime: 'esm', protocolVersion: 1,
        component: { isolation: 'iframe', entry: 'inbox' }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', querySchema: { supportsParameters: true }, cache: { enabled: false } },
      actions: ['create', 'analyze', 'confirm', 'simulate_failure'].map(name => ({ key: name,
        label: { en_US: name, zh_Hans: ({ create: '录入', analyze: 'AI 分诊', confirm: '确认保存', simulate_failure: '演示失败' })[name] ?? name }, actionType: 'invoke', placement: 'toolbar' })),
      hostEvents: { subscriptions: [{ key: 'support-triage-updates', event: 'assistant.tool.completed',
        filter: { sources: ['chatkit'], toolNames: ['support_ticket_create', 'support_ticket_analyze'] }, action: { type: 'forward', debounceMs: 400 } }] }
    }]
  }
  private scope(context: XpertResolvedViewHostContext, viewKey: string) {
    if (viewKey !== VIEW) throw new TriageError('not_found')
    return viewScope(context)
  }
  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery): Promise<XpertViewDataResult> {
    const scope = this.scope(context, viewKey)
    if (query.parameters?.id) return { item: await this.service.get(scope, z.string().uuid().parse(query.parameters.id)) }
    return { item: await this.service.list(scope, { page: Number(query.parameters?.page ?? 1) }) }
  }
  async executeViewAction(context: XpertResolvedViewHostContext, viewKey: string, action: string, request: XpertViewActionRequest): Promise<XpertViewActionResult> {
    const scope = this.scope(context, viewKey)
    try {
      switch (action) {
        case 'create': return { success: true, data: await this.service.create(scope, intakeSchema.parse(request.input)) }
        case 'analyze': return { success: true, data: await this.service.analyze(scope, actionSchema.parse(request.input)) }
        case 'confirm': return { success: true, data: await this.service.confirm(scope, confirmSchema.parse(request.input)) }
        case 'simulate_failure': return { success: true, data: await this.service.analyze(scope, actionSchema.parse(request.input), true) }
        default: throw new TriageError('not_found')
      }
    } catch (error) {
      if (error instanceof TriageError) return { success: false, data: { code: error.code } }
      if (error instanceof z.ZodError) return { success: false, data: { code: 'invalid_input' } }
      return { success: false, data: { code: 'service_unavailable' } }
    }
  }
  async getRemoteComponentEntry(context: XpertResolvedViewHostContext, viewKey: string, component: XpertRemoteComponentViewSchema['component']): Promise<XpertRemoteComponentEntry> {
    this.scope(context, viewKey)
    if (component.entry !== 'inbox' || component.isolation !== 'iframe') throw new TriageError('not_found')
    return { html: await readFile(new URL('./remote/inbox.html', import.meta.url), 'utf8'), contentType: 'text/html; charset=utf-8' }
  }
}
