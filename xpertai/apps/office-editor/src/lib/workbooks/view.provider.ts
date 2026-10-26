import { BadRequestException, Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { z } from 'zod/v3'
import { ViewExtensionProvider, renderRemoteReactIframeHtml, type IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { AGENT_WORKBENCH_SLOT } from '@xpert-ai/contracts'
import type { XpertResolvedViewHostContext, XpertExtensionViewManifest, XpertViewQuery, XpertViewActionRequest, XpertRemoteComponentViewSchema } from '@xpert-ai/contracts'
import { OfficeWorkbookService, workbookScope } from './service.js'
import { WORKBOOK_VIEW, WORKBOOK_VIEW_PROVIDER, WORKBOOK_ENTRY, WORKBOOK_PROVIDER } from './model.js'

const label = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
const id = z.object({ documentId: z.string().uuid() }).strict()
@Injectable()
@ViewExtensionProvider(WORKBOOK_VIEW_PROVIDER)
export class OfficeWorkbookView implements IXpertViewExtensionProvider {
  constructor(private readonly service: OfficeWorkbookService) {}
  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' }
  private scope(context: XpertResolvedViewHostContext) {
    if (!this.supports(context)) throw new BadRequestException('office.project_required')
    return workbookScope({ ...context, projectId: context.runtimeScope?.projectId, assistantId: context.hostId })
  }
  private view(key: string) { if (key !== WORKBOOK_VIEW) throw new BadRequestException('office.view_unavailable') }
  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || slot !== AGENT_WORKBENCH_SLOT) return []
    return [{ key: WORKBOOK_VIEW, title: label('Workbook', '工作簿'), hostType: 'agent', slot, refreshable: false,
      activation: { projectResource: true }, workbench: { fixed: true, openMode: 'on-demand' },
      source: { provider: WORKBOOK_VIEW_PROVIDER, plugin: '@xpert-ai/plugin-office-editor' },
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1,
        component: { isolation: 'iframe', entry: WORKBOOK_ENTRY }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', cache: { enabled: false }, querySchema: { supportsSelection: true, supportsParameters: true } },
      clientCommands: [{ key: 'workbench.content.status', required: true, label: label('Editor status', '编辑状态') }],
      actions: [{ key: 'workbook.read', label: label('Read workbook', '读取工作簿'), actionType: 'invoke', requiredHostAccess: 'read' },
        { key: 'workbook.save', label: label('Save workbook', '保存工作簿'), actionType: 'invoke', requiredHostAccess: 'edit' }] }]
  }
  async getRemoteComponentEntry(context: XpertResolvedViewHostContext, key: string, component: XpertRemoteComponentViewSchema['component']) {
    this.view(key); this.scope(context)
    if (component.entry !== WORKBOOK_ENTRY) throw new BadRequestException('office.view_unavailable')
    const [appScript, appCss] = await Promise.all(['app.js', 'app.css'].map(name => readFile(new URL(`../remote-components/${WORKBOOK_ENTRY}/${name}`, import.meta.url), 'utf8')))
    return { html: renderRemoteReactIframeHtml({ title: 'Office Workbook', reactUmd: '', reactDomUmd: '', appScript, appCss }), contentType: 'text/html; charset=utf-8' as const }
  }
  async getViewData(context: XpertResolvedViewHostContext, key: string, query: XpertViewQuery) {
    this.view(key); const scope = this.scope(context)
    if (!query.selectionId) return { items: [], meta: { requiresDocument: true } }
    if (query.parameters?.contentProvider && query.parameters.contentProvider !== WORKBOOK_PROVIDER) throw new BadRequestException('office.editor_mismatch')
    return { items: [], meta: await this.service.read(scope, z.string().uuid().parse(query.selectionId)) }
  }
  async executeViewAction(context: XpertResolvedViewHostContext, key: string, action: string, request: XpertViewActionRequest) {
    this.view(key); const scope = this.scope(context)
    if (action === 'workbook.read') return { success: true, data: await this.service.read(scope, id.parse(request.input).documentId) }
    if (action === 'workbook.save') {
      const input = id.extend({ expectedRevision: z.string().regex(/^\d+$/), requestId: z.string().uuid(), snapshot: z.unknown() }).parse(request.input)
      return { success: true, data: await this.service.save(scope, input.documentId, input.expectedRevision, input.snapshot, input.requestId) }
    }
    throw new BadRequestException('office.action_unknown')
  }
}
