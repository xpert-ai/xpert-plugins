import { BadRequestException, Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { ViewExtensionProvider, renderRemoteModuleIframeHtml,
  type IXpertViewExtensionProvider, type XpertViewFileActionFile } from '@xpert-ai/plugin-sdk'
import type { XpertResolvedViewHostContext, XpertExtensionViewManifest, XpertViewQuery,
  XpertViewActionRequest, XpertRemoteComponentViewSchema, XpertViewFileAccessRequest } from '@xpert-ai/contracts'
import { AGENT_WORKBENCH_SLOT, LEGACY_AGENT_WORKBENCH_SLOTS } from '@xpert-ai/contracts'
import { DOCX_EDITOR, DOCX_ENTRY, DOCX_PLUGIN, DOCX_VIEW, DOCX_VIEW_PROVIDER } from './constants.js'
import { DocxFiles, type DocxFileInput } from './files.js'
import { DocxAi } from './ai-service.js'
import { WORD_VIEW_ICON } from '../view-icon.js'
import { createSchema, inspectSchema, templateSchema } from './ai-schema.js'
const LIBRARY = 'docx_editor.templates'

const label = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
const resource = z.object({ resourceId: z.string().uuid(), providerKey: z.string().min(1).max(200).refine(value => value !== 'platform.workspace.file') }).strict()
const workspace = z.object({ resourceId: z.string().regex(/^[a-f0-9]{64}$/), providerKey: z.literal('platform.workspace.file'), filePath: z.string().min(1).max(2000) }).strict()
const reference = z.union([workspace, resource])
const scopeSchema = z.object({ actor: z.object({ tenantId: z.string().uuid(), organizationId: z.string().uuid(), userId: z.string().uuid() }),
  projectId: z.string().uuid(), assistantId: z.string().uuid().optional() })
function checked<T, D extends z.ZodTypeDef, I>(schema: z.ZodType<T, D, I>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new BadRequestException('docx.invalid_input')
  return result.data
}

@Injectable()
@ViewExtensionProvider(DOCX_VIEW_PROVIDER)
export class DocxFileView implements IXpertViewExtensionProvider {
  constructor(private readonly files: DocxFiles, private readonly ai: DocxAi) {}
  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' || context.hostType === 'project' }
  private scope(context: XpertResolvedViewHostContext) {
    if (!this.supports(context)) throw new BadRequestException('docx.view_unavailable')
    const scope = checked(scopeSchema, { actor: context, projectId: context.runtimeScope?.projectId, assistantId: context.hostType === 'agent' ? context.hostId : undefined })
    const actor = scope.actor
    if (!actor?.tenantId || !actor.organizationId || !actor.userId || !scope.projectId) throw new BadRequestException('docx.invalid_scope')
    return { actor: { tenantId: actor.tenantId, organizationId: actor.organizationId, userId: actor.userId }, projectId: scope.projectId, assistantId: scope.assistantId }
  }
  private input(context: XpertResolvedViewHostContext, value: unknown): DocxFileInput {
    const source = checked(reference, value), scope = this.scope(context)
    if (!source.providerKey || !source.resourceId) throw new BadRequestException('docx.invalid_reference')
    if ('filePath' in source && source.filePath) return { ...scope, path: source.filePath, editorKey: DOCX_EDITOR }
    return { ...scope, source: { providerKey: source.providerKey, resourceId: source.resourceId } }
  }
  private view(key: string) { if (key !== DOCX_VIEW && key !== LIBRARY) throw new BadRequestException('docx.view_unavailable') }
  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    const slots: readonly string[] = context.hostType === 'agent' ? [AGENT_WORKBENCH_SLOT, ...LEGACY_AGENT_WORKBENCH_SLOTS] : ['project.files.editor']
    if (!this.supports(context) || !slots.includes(slot)) return []
    const editor: XpertExtensionViewManifest = { key: DOCX_VIEW, title: label('Word document', 'Word 文档'), icon: WORD_VIEW_ICON, hostType: context.hostType,
      slot: context.hostType === 'agent' ? AGENT_WORKBENCH_SLOT : slot,
      source: { provider: DOCX_VIEW_PROVIDER, plugin: DOCX_PLUGIN }, refreshable: false,
      activation: { projectResource: true }, workbench: { openMode: 'on-demand' },
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1,
        component: { isolation: 'iframe', entry: DOCX_ENTRY }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', cache: { enabled: false }, querySchema: { supportsSelection: true, supportsParameters: true } },
      fileAccess: { purposes: ['download', 'preview'] },
      actions: [
        { key: 'templates.list', label: label('Word templates', 'Word 模板'), actionType: 'invoke' },
        { key: 'templates.create', label: label('Create document', '新建文档'), actionType: 'invoke' },
        { key: 'templates.inspect', label: label('Inspect template', '检查模板'), actionType: 'invoke' },
        { key: 'templates.fill', label: label('Fill template', '填充模板'), actionType: 'invoke' },
        { key: 'file.read', label: label('Open document', '打开文档'), actionType: 'invoke' },
        { key: 'file.session', label: label('Collaborate', '协作'), actionType: 'invoke' },
        { key: 'file.save', label: label('Save document', '保存文档'), actionType: 'invoke', transport: 'file' }
      ],
      clientCommands: [{ key: 'workbench.navigation.open', label: label('Open document', '打开文档') }, { key: 'workbench.content.status', required: true, label: label('Editor status', '编辑状态') }]
    }
    return [editor, ...(context.hostType === 'agent' ? [{ ...editor, key: LIBRARY, title: label('Word templates', 'Word 模板库'),
      workbench: { openMode: 'on-demand' as const, menu: { enabled: true } } }] : [])]
  }
  async getRemoteComponentEntry(context: XpertResolvedViewHostContext, key: string, component: XpertRemoteComponentViewSchema['component']) {
    this.view(key)
    if (!this.supports(context) || component.entry !== DOCX_ENTRY) throw new BadRequestException('docx.view_unavailable')
    const [appScript, appCss] = await Promise.all(['app.js', 'app.css'].map(name => readFile(new URL(`../remote-components/${DOCX_ENTRY}/${name}`, import.meta.url), 'utf8')))
    return { html: renderRemoteModuleIframeHtml({ title: 'Word', appScript, appCss }), contentType: 'text/html; charset=utf-8' as const }
  }
  getViewData(context: XpertResolvedViewHostContext, key: string, _query: XpertViewQuery) {
    this.view(key); this.scope(context)
    return { items: [], meta: { requiresDocument: key === DOCX_VIEW } }
  }
  async executeViewAction(context: XpertResolvedViewHostContext, key: string, action: string, request: XpertViewActionRequest) {
    this.view(key)
    if (action === 'templates.list') return { success: true, data: await this.ai.listTemplates(this.scope(context), true) }
    if (action === 'templates.create') return { success: true, data: await this.ai.create(this.scope(context), checked(createSchema, request.input), true) }
    if (action === 'templates.inspect') return { success: true, data: await this.ai.inspect(this.scope(context), checked(inspectSchema, request.input), true) }
    if (action === 'templates.fill') return { success: true, data: await this.ai.fillTemplate(this.scope(context), checked(templateSchema, request.input), true) }
    const input = this.input(context, request.input)
    if (action === 'file.session') return { success: true, data: await this.files.session(input) }
    if (action !== 'file.read') throw new BadRequestException('docx.action_unknown')
    return { success: true, data: await this.files.read(input) }
  }
  async executeViewFileAction(context: XpertResolvedViewHostContext, key: string, action: string, request: XpertViewActionRequest, file: XpertViewFileActionFile) {
    this.view(key)
    if (action !== 'file.save') throw new BadRequestException('docx.action_unknown')
    const { expectedRevision, ...source } = checked(z.object({ expectedRevision: z.string().min(1).max(300) }).passthrough(), request.input)
    return { success: true, refresh: false, data: await this.files.save(this.input(context, source), expectedRevision, file.buffer) }
  }
  async resolveViewFile(context: XpertResolvedViewHostContext, key: string, request: XpertViewFileAccessRequest) {
    this.view(key)
    let value: unknown
    try { value = JSON.parse(request.fileKey) } catch { throw new BadRequestException('docx.invalid_reference') }
    return this.files.download(this.input(context, value))
  }
}
