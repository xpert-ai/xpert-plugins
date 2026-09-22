import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertExtensionViewManifest, XpertRemoteComponentEntry, XpertRemoteComponentViewSchema, XpertResolvedViewHostContext, XpertViewActionRequest, XpertViewActionResult, XpertViewDataResult, XpertViewQuery } from '@xpert-ai/contracts'
import { ViewExtensionProvider, type IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { BusinessError, ENTRY, FEATURE, PLUGIN_NAME, PROVIDER, VIEW, type Scope } from './domain.js'
import { DemandService } from './service.js'

export const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
export const actionKeys = ['create', 'edit', 'evaluate', 'confirm'] as const
export function scopeFromView(context: XpertResolvedViewHostContext): Scope {
  return { tenantId: context.tenantId, organizationId: context.organizationId ?? '', userId: context.userId ?? '' }
}
export async function remoteHtml() {
  const [js, css] = await Promise.all([
    readFile(fileURLToPath(new URL('./ui/app.js', import.meta.url)), 'utf8'),
    readFile(fileURLToPath(new URL('./ui/app.css', import.meta.url)), 'utf8')
  ])
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Customer Demand</title><style>${css}</style></head><body><div id="root"></div><script>${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
}

@Injectable()
@ViewExtensionProvider(PROVIDER)
export class DemandView implements IXpertViewExtensionProvider {
  constructor(private readonly service: DemandService) {}
  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' }
  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || slot !== 'agent.workbench.fixed') return []
    return [{
      key: VIEW, title: text('Customer demand', '客户需求评估'),
      description: text('Assess customer requests with Jev and confirm the next step.', '用 Jev 评估需求，由销售确认跟进计划。'),
      icon: { type: 'font', value: 'ri-user-search-line' }, hostType: 'agent', slot, refreshable: true, order: 20,
      activation: { requiredFeatures: [FEATURE] },
      source: { provider: PROVIDER, plugin: PLUGIN_NAME },
      workbench: { fixed: true, menu: { enabled: true, label: text('Customer demand', '客户需求'), order: 20 } },
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1,
        component: { isolation: 'iframe', entry: ENTRY }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', querySchema: { supportsPagination: true, supportsSearch: true, supportsParameters: true, defaultPageSize: 12 }, cache: { enabled: false } },
      hostEvents: { subscriptions: [{ key: 'assessment-completed', event: 'assistant.tool.completed',
        filter: { sources: ['chatkit'], toolNames: ['customer_demand_evaluate'] }, action: { type: 'refresh-and-forward', debounceMs: 300 } }] },
      actions: actionKeys.map(key => ({ key, label: text(key, { create: '新建需求', edit: '修改原文', evaluate: 'Jev 评估', confirm: '保存跟进决定' }[key]), actionType: 'invoke' }))
    }]
  }
  async getRemoteComponentEntry(_context: XpertResolvedViewHostContext, viewKey: string,
    component: XpertRemoteComponentViewSchema['component']): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== VIEW || component.entry !== ENTRY) throw new BusinessError('not_found')
    return { html: await remoteHtml(), contentType: 'text/html; charset=utf-8' }
  }
  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery): Promise<XpertViewDataResult> {
    if (viewKey !== VIEW) throw new BusinessError('not_found')
    const result = await this.service.list(scopeFromView(context), { page: query.page, pageSize: query.pageSize,
      search: query.search, selectionId: query.selectionId,
      status: typeof query.parameters?.status === 'string' ? query.parameters.status : undefined })
    return { items: result.records, item: result.selected ?? undefined, total: result.total, meta: { page: result.page, pageSize: result.pageSize } }
  }
  async executeViewAction(context: XpertResolvedViewHostContext, viewKey: string, actionKey: string,
    request: XpertViewActionRequest): Promise<XpertViewActionResult> {
    try {
      if (viewKey !== VIEW) throw new BusinessError('not_found')
      const scope = scopeFromView(context)
      const input = request.input ?? {}
      const id = request.targetId ?? ''
      const data = actionKey === 'create' ? await this.service.create(scope, input)
        : actionKey === 'edit' ? await this.service.edit(scope, id, input)
        : actionKey === 'evaluate' ? await this.service.evaluate(scope, id)
        : actionKey === 'confirm' ? await this.service.confirm(scope, id, input) : null
      if (!data) throw new BusinessError('invalid_action')
      return { success: true, data, refresh: true }
    } catch (error) {
      const errorCode = error instanceof BusinessError ? error.code : error instanceof z.ZodError ? 'invalid_input' : 'operation_failed'
      return { success: false, data: { errorCode }, message: text('Operation failed. Please review the input and retry.', '操作未完成，请检查输入或刷新后重试。') }
    }
  }
}
