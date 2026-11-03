import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { XpertExtensionViewManifest, XpertResolvedViewHostContext, XpertRemoteComponentViewSchema, XpertViewQuery, XpertViewActionRequest, XpertViewActionResult } from '@xpert-ai/contracts'
import { ViewExtensionProvider, renderRemoteReactIframeHtml, type IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { ZodError } from 'zod/v3'
import { confirmSchema, createSchema, IntakeError, saveSchema, type ErrorCode, type Scope } from '../shared/contracts'
import { feature, icon, packageMeta, providerKey, remoteEntry, viewKey } from './constants'
import { IntakeService } from './intake.service'

@Injectable()
@ViewExtensionProvider(providerKey)
export class IntakeViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: IntakeService) {}
  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' }
  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!['agent.workbench.main', 'agent.workbench.fixed'].includes(slot)) return []
    const viewIcon = { type: 'svg' as const, value: icon, alt: 'Defect intake' }
    return [{
      key: viewKey, title: { en_US: 'Defect intake', zh_Hans: '缺陷受理与澄清' },
      description: { en_US: 'Capture feedback, edit reports and recover saved work.', zh_Hans: '录入反馈、编辑报告并恢复已保存的内容。' },
      hostType: 'agent', slot, order: 20, icon: viewIcon, refreshable: true,
      activation: { requiredFeatures: [feature] },
      source: { provider: providerKey, plugin: packageMeta.name },
      ...(slot === 'agent.workbench.fixed' ? { workbench: { fixed: true, menu: { enabled: true, label: { en_US: 'Defect intake', zh_Hans: '缺陷受理' }, order: 20, icon: viewIcon } } } : {}),
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1, component: { isolation: 'iframe', entry: remoteEntry }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', querySchema: { supportsPagination: true, supportsSearch: true, supportsParameters: true, defaultPageSize: 25 }, cache: { enabled: false } },
      parameters: [{ key: 'recordId', type: 'string', label: { en_US: 'Record', zh_Hans: '记录' } }],
      actions: ['create', 'save', 'confirm'].map((key) => ({ key, label: { en_US: key, zh_Hans: { create: '新建反馈', save: '保存草稿', confirm: '确认报告' }[key] || key }, actionType: 'invoke' as const }))
    }]
  }
  async getRemoteComponentEntry(_context: XpertResolvedViewHostContext, key: string, component: XpertRemoteComponentViewSchema['component']) {
    if (key !== viewKey || component.entry !== remoteEntry) throw new IntakeError('not_found')
    const root = join(__dirname, '../remote')
    const [appScript, appCss] = await Promise.all([readFile(join(root, 'app.js'), 'utf8'), readFile(join(root, 'app.css'), 'utf8')])
    // React is bundled with the remote entry. No CDN or host filesystem dependency.
    return { html: renderRemoteReactIframeHtml({ title: 'Defect intake', appScript, appCss, reactUmd: '', reactDomUmd: '' }), contentType: 'text/html; charset=utf-8' as const }
  }
  getViewData(context: XpertResolvedViewHostContext, key: string, query: XpertViewQuery) {
    if (key !== viewKey) throw new IntakeError('not_found')
    const recordId = query.parameters?.recordId
    return this.service.list(scopeFromContext(context), { id: typeof recordId === 'string' ? recordId : undefined, search: query.search, page: query.page })
  }
  async executeViewAction(context: XpertResolvedViewHostContext, key: string, action: string, request: XpertViewActionRequest): Promise<XpertViewActionResult> {
    try {
      if (key !== viewKey) throw new IntakeError('not_found')
      const scope = scopeFromContext(context)
      const id = request.targetId || ''
      const data = action === 'create' ? await this.service.create(scope, createSchema.parse(request.input))
        : action === 'save' ? await this.service.save(scope, id, saveSchema.parse(request.input))
        : action === 'confirm' ? await this.service.confirm(scope, id, confirmSchema.parse(request.input).revision)
        : null
      if (!data) throw new IntakeError('unsupported_action')
      return { success: true, data, refresh: false }
    } catch (error) {
      const code: ErrorCode = error instanceof IntakeError ? error.code : error instanceof ZodError ? 'invalid_input' : 'storage_unavailable'
      // No SQL, stack trace, feedback text or cross-scope existence details leave this boundary.
      return { success: false, data: { code }, failure: { kind: 'business', code } }
    }
  }
}
export function scopeFromContext(context: XpertResolvedViewHostContext): Scope {
  if (!context.tenantId || !context.organizationId || !context.userId) throw new IntakeError('scope_required')
  return { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId }
}
