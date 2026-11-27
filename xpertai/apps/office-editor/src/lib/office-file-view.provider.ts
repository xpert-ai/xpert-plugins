import { AGENT_WORKBENCH_SLOT, WORKSPACE_FILES_FEATURE } from '@xpert-ai/contracts'
import { WORKBOOK_VIEW_ICON } from './workbooks/view-icon.js'
import { BadRequestException, Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { z } from 'zod/v3'
import { ViewExtensionProvider, renderRemoteReactIframeHtml, type ContentFileScope, type ContentEditorInput, type ContentFileEditorInput, type IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import type { XpertResolvedViewHostContext, XpertExtensionViewManifest, XpertViewQuery,
  XpertViewActionRequest, XpertRemoteComponentViewSchema, XpertViewFileAccessRequest } from '@xpert-ai/contracts'
import { OfficeFileService } from './office-file.service.js'
import { fileTargetSchema, fileChangesSchema, type FileTarget } from './spreadsheets/file-contract.js'

const VIEW = 'office.file'
const label = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
function targetInput(scope: ContentFileScope, target: FileTarget): ContentEditorInput | ContentFileEditorInput {
  if (target.kind === 'resource') {
    if (!scope.projectId) throw new BadRequestException('office.project_required')
    return { ...scope, projectId: scope.projectId, source: { providerKey: target.providerKey, resourceId: target.resourceId } }
  }
  return { ...scope, path: target.path, editorKey: target.editorKey }
}
function queryTarget(query: XpertViewQuery): FileTarget {
  return fileTargetSchema.parse(query.parameters?.contentProvider === 'platform.workspace.file'
    ? { kind: 'file', path: query.parameters.filePath, editorKey: query.parameters.contentEditor }
    : { kind: 'resource', resourceId: query.selectionId, providerKey: query.parameters?.contentProvider })
}
const scopeSchema = z.object({ actor: z.object({ tenantId: z.string().uuid(), organizationId: z.string().uuid(), userId: z.string().uuid() }),
  projectId: z.string().uuid().optional(), assistantId: z.string().uuid() })

/** File mode is separate from Office's native snapshots/CRDT; both are owned by Office. */
@Injectable()
@ViewExtensionProvider('office.files')
export class OfficeFileView implements IXpertViewExtensionProvider {
  constructor(private readonly files: OfficeFileService) {}
  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' }
  private scope(context: XpertResolvedViewHostContext) {
    if (!this.supports(context)) throw new BadRequestException('office.view_unavailable')
    // Client inputs may identify a resource, never its actor, Project or Assistant authority.
    const parsed = scopeSchema.parse({ actor: context, projectId: context.runtimeScope?.projectId ?? undefined, assistantId: context.hostId })
    return { actor: { tenantId: parsed.actor.tenantId, organizationId: parsed.actor.organizationId, userId: parsed.actor.userId }, projectId: parsed.projectId, assistantId: parsed.assistantId }
  }
  private view(key: string) { if (key !== VIEW) throw new BadRequestException('office.view_unavailable') }
  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || slot !== AGENT_WORKBENCH_SLOT) return []
    return [{ key: VIEW, title: label('Spreadsheet', '电子表格'), icon: WORKBOOK_VIEW_ICON, hostType: 'agent', slot,
      activation: { requiredFeatures: [WORKSPACE_FILES_FEATURE] }, workbench: { fixed: true, openMode: 'on-demand' },
      source: { provider: 'office.files', plugin: '@xpert-ai/plugin-office-editor' }, refreshable: false,
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1,
        component: { isolation: 'iframe', entry: 'office-file' }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', cache: { enabled: false }, querySchema: { supportsSelection: true, supportsParameters: true } },
      fileAccess: { purposes: ['download'] },
      actions: ['file.read', 'file.save'].map(key => ({ key, label: label(key, key), actionType: 'invoke' })),
      clientCommands: [{ key: 'workbench.content.status', required: true, label: label('Editor status', '编辑状态') }]
    }]
  }
  async getRemoteComponentEntry(context: XpertResolvedViewHostContext, key: string, component: XpertRemoteComponentViewSchema['component']) {
    this.view(key)
    if (!this.supports(context) || component.entry !== 'office-file') throw new BadRequestException('office.view_unavailable')
    const [appScript, appCss] = await Promise.all(['app.js', 'app.css'].map(name => readFile(new URL(`./remote-components/office-file/${name}`, import.meta.url), 'utf8')))
    return { html: renderRemoteReactIframeHtml({ title: 'Office', reactUmd: '', reactDomUmd: '', appScript, appCss }), contentType: 'text/html; charset=utf-8' as const }
  }
  async getViewData(context: XpertResolvedViewHostContext, key: string, query: XpertViewQuery) {
    this.view(key)
    const scope = this.scope(context)
    if (!query.selectionId) return { items: [], meta: { requiresDocument: true } }
    return { items: [], meta: await this.files.read(targetInput(scope, queryTarget(query))) }
  }
  async executeViewAction(context: XpertResolvedViewHostContext, key: string, action: string, request: XpertViewActionRequest) {
    this.view(key)
    const scope = this.scope(context)
    try {
      if (action === 'file.read') return { success: true, data: await this.files.read(targetInput(scope, fileTargetSchema.parse(request.input))) }
      if (action === 'file.save') {
        const { expectedRevision, changes, target } = z.object({ target: fileTargetSchema, expectedRevision: z.string().min(1).max(300), changes: fileChangesSchema }).strict().parse(request.input)
        return { success: true, data: await this.files.save(targetInput(scope, target), expectedRevision, changes) }
      }
      throw new BadRequestException('office.action_unknown')
    } catch (error) { if (error instanceof z.ZodError) throw new BadRequestException('office.invalid_input'); throw error }
  }
  async resolveViewFile(context: XpertResolvedViewHostContext, key: string, request: XpertViewFileAccessRequest) {
    this.view(key)
    // A structured reference avoids path-derived permissions and does not assume Spaces ownership.
    let value: unknown
    try { value = JSON.parse(request.fileKey) } catch { throw new BadRequestException('office.invalid_input') }
    return this.files.download(targetInput(this.scope(context), fileTargetSchema.parse(value)))
  }
}
