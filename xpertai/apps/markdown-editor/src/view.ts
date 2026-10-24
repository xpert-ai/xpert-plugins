import { BadRequestException, ForbiddenException, ConflictException, Inject, Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { z } from 'zod/v3'
import { ContentReferencesRuntimeCapability, ContentDocumentsRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  ViewExtensionProvider, renderRemoteReactIframeHtml, type RuntimeCapabilityRegistry,
  type XpertViewFileActionFile, type IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import type { XpertResolvedViewHostContext, XpertExtensionViewManifest, XpertViewActionRequest,
  XpertViewQuery, XpertRemoteComponentViewSchema, XpertViewFileAccessRequest } from '@xpert-ai/contracts'
import { parseReferenceFileKey, referenceTarget } from './references.js'
import { MODEL_KEY, SCHEMA_VERSION } from './schema.js'

const resource = z.object({ resourceId: z.string().uuid() }).strict()
const scopeSchema = z.object({ actor: z.object({ tenantId: z.string().uuid(), organizationId: z.string().uuid(),
  userId: z.string().uuid() }), projectId: z.string().uuid(), assistantId: z.string().uuid() })
const label = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
const VIEW = 'markdown.editor'
const actions = ['reference.list', 'reference.upload', 'document.hierarchy', 'document.createChild', 'document.list', 'document.session', 'document.read', 'document.update', 'document.history', 'document.preview', 'document.checkpoint']

@Injectable()
@ViewExtensionProvider('markdown.views')
export class MarkdownEditorView implements IXpertViewExtensionProvider {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  api() { return this.runtime.require(ContentDocumentsRuntimeCapability) }
  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent' && context.capabilities?.features?.includes('spaces') === true
  }
  scope(context: XpertResolvedViewHostContext) {
    if (!this.supports(context)) throw new BadRequestException('markdown.view_unavailable')
    if (!context.runtimeScope?.projectId) throw new BadRequestException('markdown.project_required')
    return scopeSchema.parse({ actor: context, projectId: context.runtimeScope?.projectId, assistantId: context.hostId })
  }
  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || slot !== 'agent.workbench.main') return []
    return [{ key: VIEW, title: label('Markdown document', 'Markdown 文档'), hostType: 'agent', slot,
      source: { provider: 'markdown.views', plugin: '@xpert-ai/plugin-markdown-editor' }, refreshable: false,
      activation: { requiredFeatures: ['spaces'] },
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1,
        component: { isolation: 'iframe', entry: 'markdown-editor' }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', cache: { enabled: false }, querySchema: { supportsSelection: true, supportsParameters: true } },
      fileAccess: { purposes: ['download', 'preview'] },
      actions: actions.map((key) => ({ key, label: label(key, key), actionType: 'invoke', ...(key === 'reference.upload' ? { transport: 'file' as const } : {}) })),
      // Resolve only supplies a target; navigation keeps this editor in its current Workbench.
      clientCommands: ['assistant.context.set', 'assistant.content.review', 'assistant.composer.append_references', 'workbench.content.status', 'workbench.navigation.open', 'workbench.content.resolve', 'workbench.content.link', 'workbench.content.copyLink', 'workbench.content.close']
        .map((key) => ({ key, required: key === 'workbench.content.status', label: label(key, key) }))
    }]
  }
  async getRemoteComponentEntry(context: XpertResolvedViewHostContext, viewKey: string, component: XpertRemoteComponentViewSchema['component']) {
    if (viewKey !== VIEW || component.entry !== 'markdown-editor') throw new Error('markdown.view_missing')
    // The editor shell also renders before a Project is selected. Only document operations
    // require a Project; the host still authorizes this published Assistant and its features.
    if (!this.supports(context)) throw new BadRequestException('markdown.view_unavailable')
    const [appScript, appCss] = await Promise.all(['app.js', 'app.css'].map((name) => readFile(new URL(`./remote/${name}`, import.meta.url), 'utf8')))
    return { html: renderRemoteReactIframeHtml({ title: 'Markdown', reactUmd: '', reactDomUmd: '', appScript, appCss }), contentType: 'text/html; charset=utf-8' as const }
  }
  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery) {
    if (viewKey !== VIEW) throw new Error('markdown.view_missing')
    if (!this.supports(context)) throw new BadRequestException('markdown.view_unavailable')
    if (!context.runtimeScope?.projectId) return { items: [], meta: { requiresProject: true, requiresDocument: true } }
    if (!query.selectionId) return { items: [], meta: { requiresDocument: true } }
    const state = await this.api().get({ ...this.scope(context), resourceId: z.string().uuid().parse(query.selectionId) })
    if (state.document.modelKey !== MODEL_KEY) throw new Error('markdown.model_mismatch')
    return { items: [], meta: state }
  }
  async executeViewAction(context: XpertResolvedViewHostContext, viewKey: string, key: string, request: XpertViewActionRequest) {
    if (viewKey !== VIEW) throw new Error('markdown.view_missing')
    try {
      if (key === 'document.list') return { success: true, refresh: false, data: await this.api().list({ ...this.scope(context), modelKey: MODEL_KEY }) }
      const input = resource.passthrough().parse(request.input), base = { ...this.scope(context), resourceId: input.resourceId }
      const state = await this.api().get(base)
      if (state.document.modelKey !== MODEL_KEY) throw new Error('markdown.model_mismatch')
      let data: object
      switch (key) {
        case 'reference.list': {
          const query = resource.extend({ kind: referenceTarget.shape.kind, query: z.string().trim().max(200).default(''), cursor: z.string().uuid().optional(), pageSize: z.number().int().min(1).max(50).default(25) }).parse(request.input)
          data = await this.runtime.require(ContentReferencesRuntimeCapability).list({ ...base, ...query }); break
        }
        case 'document.hierarchy': data = await this.api().hierarchy(base); break
        case 'document.createChild': {
          const child = resource.extend({ title: z.string().trim().min(1).max(180), requestId: z.string().uuid() }).parse(request.input)
          data = await this.api().createChild({ ...base, title: child.title, requestId: child.requestId }); break
        }
        case 'document.read': data = state; break
        // The CLIENT must declare its schema. Inferring the new version on behalf of an old
        // iframe would let that iframe open nodes it cannot render after a plugin restart.
        case 'document.session': {
          const session = resource.extend({ schemaVersion: z.literal(SCHEMA_VERSION) }).parse(request.input)
          data = await this.api().session({ ...base, schemaVersion: session.schemaVersion }); break
        }
        case 'document.update': {
          const patch = resource.extend({ epoch: z.number().int().positive(), schemaVersion: z.literal(SCHEMA_VERSION),
            updateBase64: z.string().min(1).max(2800000).regex(/^[A-Za-z0-9+/]*={0,2}$/u) }).parse(request.input)
          data = await this.api().update({ ...base, ...patch }); break
        }
        case 'document.history': data = await this.api().history(base); break
        case 'document.preview': data = await this.api().preview({ ...base, revisionId: resource.extend({ revisionId: z.string().uuid() }).parse(request.input).revisionId }); break
        case 'document.checkpoint': data = await this.api().checkpoint({ ...base, label: resource.extend({ label: z.string().trim().min(1).max(200) }).parse(request.input).label }); break
        default: throw new Error('markdown.action_unknown')
      }
      return { success: true, refresh: false, data }
    } catch (error) { if (error instanceof z.ZodError) throw new BadRequestException('markdown.invalid_input'); throw error }
  }
  async executeViewFileAction(context: XpertResolvedViewHostContext, viewKey: string, key: string, request: XpertViewActionRequest, file: XpertViewFileActionFile) {
    if (viewKey !== VIEW || key !== 'reference.upload') throw new Error('markdown.action_unknown')
    const input = resource.extend({ kind: z.enum(['image', 'file']) }).parse(request.input)
    const base = { ...this.scope(context), resourceId: input.resourceId }, state = await this.api().get(base)
    if (state.document.modelKey !== MODEL_KEY) throw new BadRequestException('markdown.model_mismatch')
    if (!state.canWrite) throw new ForbiddenException('markdown.read_only')
    if (state.externalChange) throw new ConflictException('markdown.file_conflict')
    const data = await this.runtime.require(ContentReferencesRuntimeCapability).upload({ ...base, kind: input.kind,
      fileName: file.originalname ?? 'file', mimeType: file.mimetype ?? 'application/octet-stream', buffer: file.buffer })
    return { success: true, refresh: false, data }
  }
  async resolveViewFile(context: XpertResolvedViewHostContext, viewKey: string, request: XpertViewFileAccessRequest) {
    if (viewKey !== VIEW) throw new Error('markdown.view_missing')
    if (request.fileKey.startsWith('reference:')) {
      const input = parseReferenceFileKey(request.fileKey)
      if (request.purpose === 'preview' && input.target.kind !== 'image') throw new Error('markdown.preview_unsupported')
      return this.runtime.require(ContentReferencesRuntimeCapability).resolve({ ...this.scope(context), ...input })
    }
    const scope = this.scope(context), state = await this.api().get({ ...scope, resourceId: z.string().uuid().parse(request.fileKey) })
    if (state.externalChange || state.document.status !== 'ready') throw new Error('markdown.file_conflict')
    return { reference: { ...scope.actor, catalog: 'projects' as const, source: 'platform.workspace.files' as const,
      projectId: scope.projectId, scopeId: scope.projectId, filePath: state.document.path, workspacePath: state.document.path },
      fileName: state.document.path.split('/').pop() ?? 'document.md', mimeType: 'text/markdown' }
  }
}
