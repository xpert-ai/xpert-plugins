import { BadRequestException, Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { ViewExtensionProvider, renderRemoteReactIframeHtml,
  type IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import type { XpertResolvedViewHostContext, XpertExtensionViewManifest, XpertViewQuery,
  XpertViewActionRequest, XpertRemoteComponentViewSchema, XpertViewFileAccessRequest } from '@xpert-ai/contracts'
import { AGENT_WORKBENCH_SLOT, LEGACY_AGENT_WORKBENCH_SLOTS } from '@xpert-ai/contracts'
import { PDF_EDITOR, PDF_ENTRY, PDF_PLUGIN, PDF_VIEW, PDF_VIEW_PROVIDER } from './constants.js'
import { PdfFiles, type PdfFileInput } from './files.js'
import { PDF_ICON } from './icon.js'

const label = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
const resource = z.object({ resourceId: z.string().uuid(), providerKey: z.string().min(1).max(200).refine(value => value !== 'platform.workspace.file') }).strict()
const workspace = z.object({ resourceId: z.string().regex(/^[a-f0-9]{64}$/), providerKey: z.literal('platform.workspace.file'), filePath: z.string().min(1).max(2000) }).strict()
const reference = z.union([workspace, resource])
const scopeSchema = z.object({ actor: z.object({ tenantId: z.string().uuid(), organizationId: z.string().uuid(), userId: z.string().uuid() }),
  projectId: z.string().uuid(), assistantId: z.string().uuid().optional() })
function checked<T, D extends z.ZodTypeDef, I>(schema: z.ZodType<T, D, I>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new BadRequestException('pdf.invalid_input')
  return result.data
}

@Injectable()
@ViewExtensionProvider(PDF_VIEW_PROVIDER)
export class PdfView implements IXpertViewExtensionProvider {
  constructor(private readonly files: PdfFiles) {}
  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' || context.hostType === 'project' }
  private scope(context: XpertResolvedViewHostContext) {
    if (!this.supports(context)) throw new BadRequestException('pdf.view_unavailable')
    return checked(scopeSchema, { actor: context, projectId: context.runtimeScope?.projectId, assistantId: context.hostType === 'agent' ? context.hostId : undefined })
  }
  private input(context: XpertResolvedViewHostContext, value: unknown): PdfFileInput {
    const source = checked(reference, value), scope = this.scope(context)
    return 'filePath' in source ? { ...scope, path: source.filePath, editorKey: PDF_EDITOR } : { ...scope, source }
  }
  private view(key: string) { if (key !== PDF_VIEW) throw new BadRequestException('pdf.view_unavailable') }
  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    const slots: readonly string[] = context.hostType === 'agent' ? [AGENT_WORKBENCH_SLOT, ...LEGACY_AGENT_WORKBENCH_SLOTS] : ['project.files.editor']
    if (!this.supports(context) || !slots.includes(slot)) return []
    return [{ key: PDF_VIEW, title: label('PDF preview', 'PDF 预览'), icon: PDF_ICON, hostType: context.hostType,
      slot: context.hostType === 'agent' ? AGENT_WORKBENCH_SLOT : slot,
      source: { provider: PDF_VIEW_PROVIDER, plugin: PDF_PLUGIN }, refreshable: false,
      activation: { projectResource: true }, workbench: { openMode: 'on-demand' },
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1,
        component: { isolation: 'iframe', entry: PDF_ENTRY }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', cache: { enabled: false }, querySchema: { supportsSelection: true, supportsParameters: true } },
      fileAccess: { purposes: ['download', 'preview'] },
      actions: [
        { key: 'file.read', label: label('Open document', '打开文档'), actionType: 'invoke' },
        { key: 'viewer.asset', label: label('Viewer asset', '预览资源'), actionType: 'invoke' }
      ],
      clientCommands: []
    }]
  }
  async getRemoteComponentEntry(context: XpertResolvedViewHostContext, key: string, component: XpertRemoteComponentViewSchema['component']) {
    this.view(key)
    if (!this.supports(context) || component.entry !== PDF_ENTRY) throw new BadRequestException('pdf.view_unavailable')
    const [appScript, appCss] = await Promise.all(['app.js', 'app.css'].map(name => readFile(new URL(`./remote-components/${PDF_ENTRY}/${name}`, import.meta.url), 'utf8')))
    return { html: renderRemoteReactIframeHtml({ title: 'PDF', reactUmd: '', reactDomUmd: '', appScript, appCss }), contentType: 'text/html; charset=utf-8' as const }
  }
  getViewData(context: XpertResolvedViewHostContext, key: string, _query: XpertViewQuery) {
    this.view(key); this.scope(context)
    return { items: [], meta: { requiresDocument: true } }
  }
  async executeViewAction(context: XpertResolvedViewHostContext, key: string, action: string, request: XpertViewActionRequest) {
    this.view(key)
    if (action === 'viewer.asset') {
      this.scope(context)
      const { name } = checked(z.object({ name: z.string().regex(/^(?:cmaps|standard_fonts|wasm)\/[A-Za-z0-9_.-]+$/).max(160) }).strict(), request.input)
      const asset = await readFile(new URL(`./pdf-assets/${name}`, import.meta.url))
      return { success: true, data: { contentBase64: asset.toString('base64') } }
    }
    const input = this.input(context, request.input)
    if (action !== 'file.read') throw new BadRequestException('pdf.action_unknown')
    return { success: true, data: await this.files.read(input) }
  }
  async resolveViewFile(context: XpertResolvedViewHostContext, key: string, request: XpertViewFileAccessRequest) {
    this.view(key)
    let value: unknown
    try { value = JSON.parse(request.fileKey) } catch { throw new BadRequestException('pdf.invalid_reference') }
    return this.files.download(this.input(context, value))
  }
}
