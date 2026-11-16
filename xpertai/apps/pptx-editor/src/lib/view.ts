import { BadRequestException, Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { ViewExtensionProvider, renderRemoteReactIframeHtml,
  type IXpertViewExtensionProvider, type XpertViewFileActionFile } from '@xpert-ai/plugin-sdk'
import type { XpertResolvedViewHostContext, XpertExtensionViewManifest, XpertViewQuery,
  XpertViewActionRequest, XpertRemoteComponentViewSchema, XpertViewFileAccessRequest } from '@xpert-ai/contracts'
import { AGENT_WORKBENCH_SLOT, LEGACY_AGENT_WORKBENCH_SLOTS } from '@xpert-ai/contracts'
import { PPTX_ENTRY, PPTX_PLUGIN, PPTX_VIEW, PPTX_VIEW_PROVIDER } from './constants.js'
import { PptxFiles, type PptxFileInput } from './files.js'

const label = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
const resource = z.object({ resourceId: z.string().uuid(), providerKey: z.string().min(1).max(200).refine(value => value !== 'platform.workspace.file') }).strict()
const workspace = z.object({ resourceId: z.string().regex(/^[a-f0-9]{64}$/), providerKey: z.literal('platform.workspace.file'), filePath: z.string().min(1).max(2000) }).strict()
const reference = z.union([workspace, resource])
const revision = z.string().min(1).max(300)
const scopeSchema = z.object({ actor: z.object({ tenantId: z.string().uuid(), organizationId: z.string().uuid(), userId: z.string().uuid() }),
  projectId: z.string().uuid(), assistantId: z.string().uuid().optional() })
function checked<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new BadRequestException('pptx.invalid_input')
  return result.data
}

@Injectable()
@ViewExtensionProvider(PPTX_VIEW_PROVIDER)
export class PptxView implements IXpertViewExtensionProvider {
  constructor(private readonly files: PptxFiles) {}
  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' || context.hostType === 'project' }
  private scope(context: XpertResolvedViewHostContext) {
    if (!this.supports(context)) throw new BadRequestException('pptx.view_unavailable')
    return checked(scopeSchema, { actor: context, projectId: context.runtimeScope?.projectId, assistantId: context.hostType === 'agent' ? context.hostId : undefined })
  }
  private input(context: XpertResolvedViewHostContext, value: unknown): PptxFileInput {
    const source = checked(reference, value), scope = this.scope(context)
    return 'filePath' in source ? { ...scope, path: source.filePath, editorKey: 'pptx_editor.pptx' } : { ...scope, source }
  }
  private view(key: string) { if (key !== PPTX_VIEW) throw new BadRequestException('pptx.view_unavailable') }
  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    const expectedSlots: readonly string[] = context.hostType === 'agent'
      ? [AGENT_WORKBENCH_SLOT, ...LEGACY_AGENT_WORKBENCH_SLOTS] : ['project.files.editor']
    if (!this.supports(context) || !expectedSlots.includes(slot)) return []
    return [{ key: PPTX_VIEW, title: label('Presentation', '演示文稿'), hostType: context.hostType,
      slot: context.hostType === 'agent' ? AGENT_WORKBENCH_SLOT : slot,
      source: { provider: PPTX_VIEW_PROVIDER, plugin: PPTX_PLUGIN }, refreshable: false,
      activation: { projectResource: true },
      workbench: { openMode: 'on-demand' },
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1,
        component: { isolation: 'iframe', entry: PPTX_ENTRY }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', cache: { enabled: false }, querySchema: { supportsSelection: true, supportsParameters: true } },
      fileAccess: { purposes: ['download'] },
      actions: [{ key: 'file.read', label: label('Open presentation', '打开演示文稿'), actionType: 'invoke' },
        { key: 'file.session', label: label('Collaborate', '协作'), actionType: 'invoke' },
        { key: 'file.save', label: label('Save presentation', '保存演示文稿'), actionType: 'invoke', transport: 'file' }],
      clientCommands: [{ key: 'workbench.content.status', required: true, label: label('Editor status', '编辑状态') }]
    }]
  }
  async getRemoteComponentEntry(context: XpertResolvedViewHostContext, key: string, component: XpertRemoteComponentViewSchema['component']) {
    this.view(key)
    if (!this.supports(context) || component.entry !== PPTX_ENTRY) throw new BadRequestException('pptx.view_unavailable')
    const [appScript, appCss] = await Promise.all(['app.js', 'app.css'].map(name => readFile(new URL(`./remote-components/${PPTX_ENTRY}/${name}`, import.meta.url), 'utf8')))
    return { html: renderRemoteReactIframeHtml({ title: 'PPTX', reactUmd: '', reactDomUmd: '', appScript, appCss }), contentType: 'text/html; charset=utf-8' as const }
  }
  getViewData(context: XpertResolvedViewHostContext, key: string, _query: XpertViewQuery) {
    this.view(key); this.scope(context)
    return { items: [], meta: { requiresDocument: true } }
  }
  async executeViewAction(context: XpertResolvedViewHostContext, key: string, action: string, request: XpertViewActionRequest) {
    this.view(key)
    const input = this.input(context, request.input)
    if (action === 'file.session') return { success: true, data: await this.files.session(input) }
    if (action !== 'file.read') throw new BadRequestException('pptx.action_unknown')
    return { success: true, data: await this.files.read(input) }
  }
  async executeViewFileAction(context: XpertResolvedViewHostContext, key: string, action: string, request: XpertViewActionRequest, file: XpertViewFileActionFile) {
    this.view(key)
    if (action !== 'file.save') throw new BadRequestException('pptx.action_unknown')
    const { expectedRevision, ...source } = checked(z.object({ expectedRevision: revision }).passthrough(), request.input)
    return { success: true, refresh: false, data: await this.files.save(this.input(context, source), expectedRevision, file.buffer) }
  }
  async resolveViewFile(context: XpertResolvedViewHostContext, key: string, request: XpertViewFileAccessRequest) {
    this.view(key)
    let value: unknown
    try { value = JSON.parse(request.fileKey) } catch { throw new BadRequestException('pptx.invalid_reference') }
    return this.files.download(this.input(context, value))
  }
}
