import { BadRequestException, Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { z } from 'zod/v3'
import { ViewExtensionProvider, renderRemoteReactIframeHtml, type IXpertViewExtensionProvider, type XpertViewFileActionFile } from '@xpert-ai/plugin-sdk'
import { AGENT_WORKBENCH_SLOT } from '@xpert-ai/contracts'
import type { XpertResolvedViewHostContext, XpertExtensionViewManifest, XpertViewQuery, XpertViewActionRequest, XpertRemoteComponentViewSchema } from '@xpert-ai/contracts'
import { OfficeWorkbookService, workbookScope } from './service.js'
import { WORKBOOK_VIEW, WORKBOOK_VIEW_PROVIDER, WORKBOOK_ENTRY, WORKBOOK_PROVIDER } from './model.js'

import { workbookSubmission } from './core.js'

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
      clientCommands: [{ key: 'workbench.content.status', required: true, label: label('Editor status', '编辑状态') },
        { key: 'workbench.content.draft', label: label('Local drafts', '本地草稿') },
        { key: 'assistant.context.set', label: label('Reference selection', '引用选区') }],
      actions: [{ key: 'workbook.changes', label: label('Changes since revision', '读取增量更改'), actionType: 'invoke', requiredHostAccess: 'read' },
        { key: 'workbook.session', label: label('Join collaboration', '加入协作'), actionType: 'invoke', requiredHostAccess: 'read' },
        { key: 'workbook.head', label: label('Current revision', '当前版本'), actionType: 'invoke', requiredHostAccess: 'read' },
        { key: 'workbook.read', label: label('Read workbook', '读取工作簿'), actionType: 'invoke', requiredHostAccess: 'read' },
        ...['workbook.submit', 'workbook.restore', 'workbook.undo'].map(key => ({ key, label: label('Update workbook', '更新工作簿'), actionType: 'invoke' as const, requiredHostAccess: 'edit' as const })),
        { key: 'workbook.history', label: label('Version history', '版本历史'), actionType: 'invoke', requiredHostAccess: 'read' },
        { key: 'workbook.preview', label: label('Preview version', '预览版本'), actionType: 'invoke', requiredHostAccess: 'read' },
        { key: 'workbook.export', label: label('Export saved version', '导出已保存版本'), actionType: 'invoke', requiredHostAccess: 'read' },
        { key: 'workbook.import', label: label('Import draft', '导入草稿'), actionType: 'invoke', transport: 'file', requiredHostAccess: 'edit' },
        { key: 'workbook.save', label: label('Save workbook', '保存工作簿'), actionType: 'invoke', requiredHostAccess: 'edit' }] }]
  }
  async authorizeLocalDraftResource(context: XpertResolvedViewHostContext, key: string, resourceId: string) {
    this.view(key)
    // Reuse workbook authorization, including Project/Assistant binding and archived-resource checks.
    const document = await this.service.require(this.scope(context), z.string().uuid().parse(resourceId))
    return document.id!
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
    if (action === 'workbook.export') {
      const input = id.extend({ expectedRevision: z.string().regex(/^\d+$/), format: z.enum(['xlsx', 'csv', 'native']), sheetId: z.string().optional() }).strict().parse(request.input)
      return { success: true, data: await this.service.exportFile(scope, input.documentId, input.expectedRevision, input.format, input.sheetId) }
    }
    if (action === 'workbook.changes') {
      const input = id.extend({ after: z.number().int().positive().max(2147483647) }).strict().parse(request.input)
      return { success: true, data: await this.service.changes(scope, input.documentId, input.after) }
    }
    if (action === 'workbook.session') return { success: true, data: await this.service.session(scope, id.parse(request.input).documentId) }
    if (action === 'workbook.head') return { success: true, data: await this.service.head(scope, id.parse(request.input).documentId) }
    if (action === 'workbook.read') return { success: true, data: await this.service.read(scope, id.parse(request.input).documentId) }
    if (action === 'workbook.submit') {
      const input = id.extend({ submission: workbookSubmission }).strict().parse(request.input)
      return { success: true, data: await this.service.submit(scope, input.documentId, input.submission) }
    }
    if (action === 'workbook.history') {
      const input = id.extend({ before: z.number().int().positive().max(2147483647).optional() }).strict().parse(request.input)
      return { success: true, data: await this.service.history(scope, input.documentId, input.before) }
    }
    if (action === 'workbook.undo') {
      const input = id.extend({ revision: z.number().int().min(2).max(2147483647), requestId: z.string().uuid() }).strict().parse(request.input)
      return { success: true, data: await this.service.undo(scope, input.documentId, input.revision, input.requestId) }
    }
    if (action === 'workbook.restore') {
      const input = id.extend({ revision: z.number().int().positive().safe(), expectedRevision: z.string().regex(/^\d+$/), requestId: z.string().uuid() }).strict().parse(request.input)
      return { success: true, data: await this.service.restore(scope, input.documentId, input.revision, input.expectedRevision, input.requestId) }
    }
    if (action === 'workbook.preview') {
      const input = id.extend({ revision: z.number().int().positive().max(2147483647) }).strict().parse(request.input)
      return { success: true, data: await this.service.previewRevision(scope, input.documentId, input.revision) }
    }
    if (action === 'workbook.save') {
      const input = id.extend({ expectedRevision: z.string().regex(/^\d+$/), requestId: z.string().uuid(), snapshot: z.unknown() }).parse(request.input)
      return { success: true, data: await this.service.save(scope, input.documentId, input.expectedRevision, input.snapshot, input.requestId) }
    }
    throw new BadRequestException('office.action_unknown')
  }
  async executeViewFileAction(context: XpertResolvedViewHostContext, key: string, action: string, request: XpertViewActionRequest, file: XpertViewFileActionFile) {
    this.view(key); const scope = this.scope(context)
    if (action !== 'workbook.import') throw new BadRequestException('office.action_unknown')
    const input = id.extend({ expectedRevision: z.string().regex(/^\d+$/) }).strict().parse(request.input)
    return { success: true, data: await this.service.importDraft(scope, input.documentId, input.expectedRevision, file.originalname ?? '', file.buffer) }
  }
}
