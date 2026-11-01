import { SpaceArtifactLibrary } from './artifact-library.js'
import { SpaceCatalog, catalogQuery, catalogCreate, catalogRename, catalogDuplicate, catalogLifecycle, catalogMove } from './catalog.js'
import { SpaceImports, sourceSelection, importSelection } from './imports.js'
import { BadRequestException, Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { z } from 'zod/v3'
import type { XpertExtensionViewManifest, XpertResolvedViewHostContext, XpertViewQuery,
  XpertViewActionRequest, XpertRemoteComponentViewSchema, XpertViewFileAccessRequest } from '@xpert-ai/contracts'
import { ViewExtensionProvider, renderRemoteReactIframeHtml, type IXpertViewExtensionProvider, type XpertViewFileActionFile } from '@xpert-ai/plugin-sdk'
import { actorSchema, denied, id, PLUGIN, VIEW } from './domain.js'
import { createItemSchema, editItemSchema, SpacesService } from './spaces.js'
import { SpacePages } from './pages.js'
import { SpaceAi } from './ai.js'
import { SpaceEditors } from './editors.js'
import { SpaceFiles } from './files.js'
import { SpaceKnowledge } from './knowledge.js'
import { SpaceContent } from './content.js'
import { SpaceAccess } from './access.js'

const selection = z.object({ itemId: id }).strict()
const label = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
const actions = ['artifact.reference.open', 'artifact.reference.version', 'artifact.reference.share', 'artifact.reference.revoke', 'catalog.duplicate', 'catalog.backup', 'catalog.preferences', 'catalog.preference.set', 'catalog.move', 'catalog.types', 'catalog.list', 'catalog.create', 'catalog.rename', 'catalog.lifecycle', 'source.list', 'source.search', 'source.preview', 'source.import', 'document.open', 'knowledge.enable',
  'knowledge.status', 'knowledge.refresh', 'knowledge.search', 'item.create', 'item.edit', 'page.read', 'search',
  'file.list', 'page.export', 'artifact.list', 'artifact.collect', 'artifact.open', 'editor.list', 'editor.create']

@Injectable()
@ViewExtensionProvider('spaces.views')
export class SpacesView implements IXpertViewExtensionProvider {
  constructor(private readonly artifactLibrary: SpaceArtifactLibrary, private readonly catalog: SpaceCatalog, private readonly imports: SpaceImports, private readonly content: SpaceContent, private readonly spaces: SpacesService, private readonly pages: SpacePages, private readonly ai: SpaceAi, private readonly files: SpaceFiles, private readonly editors: SpaceEditors, private readonly knowledge: SpaceKnowledge, private readonly access: SpaceAccess) {}
  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent' && context.capabilities?.features?.includes('spaces') === true
  }
  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || !['agent.workbench.main', 'agent.workbench.fixed'].includes(slot)) return []
    return [{ key: VIEW, title: label('Spaces', '协作空间'), hostType: context.hostType, slot,
      source: { provider: 'spaces.views', plugin: PLUGIN }, refreshable: true,
      activation: { requiredFeatures: ['spaces'] },
      workbench: { ...{ projectType: { applicationKey: 'platform', projectTypeKey: 'space' } },
        ...(slot === 'agent.workbench.fixed' ? { fixed: true, menu: { enabled: true, label: label('Spaces', '协作空间'), order: 35 } } : {}) },
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1,
        component: { isolation: 'iframe', entry: 'spaces' }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', cache: { enabled: false }, querySchema: { supportsSelection: true, supportsParameters: true } },
      fileAccess: { purposes: ['download'] },
      actions: [...actions.map((key) => ({ key, label: label(key, key), actionType: 'invoke' as const })),
        { key: 'editor.import', label: label('Import document', '导入文档'), actionType: 'invoke', transport: 'file' },
        { key: 'file.upload', label: label('Upload file', '上传文件'), actionType: 'invoke', transport: 'file' }],
      // Declare both phases: platform resource resolution, then container-local navigation.
      clientCommands: ['assistant.chat.send_message', 'assistant.context.set', 'workbench.content.resolve', 'workbench.navigation.open', 'workbench.browser.open', 'workbench.clipboard.write'].map((key) => ({ key, required: key === 'workbench.content.resolve', label: label(key, key) }))
    }]
  }
  async getRemoteComponentEntry(context: XpertResolvedViewHostContext, viewKey: string, component: XpertRemoteComponentViewSchema['component']) {
    if (viewKey !== VIEW || component.entry !== 'spaces') throw new Error('spaces.view_missing')
    const actor = await this.actor(context, false)
    if (actor.projectId) await this.spaces.workspace(actor)
    const [appScript, appCss] = await Promise.all(['app.js', 'app.css'].map((name) => readFile(new URL(`./remote/${name}`, import.meta.url), 'utf8')))
    return { html: renderRemoteReactIframeHtml({ title: 'Spaces', reactUmd: '', reactDomUmd: '', appScript, appCss }), contentType: 'text/html; charset=utf-8' as const }
  }
  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery) {
    if (viewKey !== VIEW) throw new Error('spaces.view_missing')
    const actor = await this.actor(context, false)
    if (!actor.projectId) return { items: [], meta: { requiresProject: true } }
    const space = await this.spaces.workspace(actor)
    const resourceId = !query.selectionId || query.selectionId === 'root' ? space.id : id.parse(query.selectionId)
    return { items: [], meta: { ...await this.spaces.tree(actor, resourceId, query.parameters?.trash === true),
      project: { id: space.projectId, title: space.title },
      assistant: { id: context.hostId, title: space.title, dataScope: 'project' } } }
  }
  async executeViewAction(context: XpertResolvedViewHostContext, viewKey: string, action: string, request: XpertViewActionRequest) {
    try { return await this.runAction(context, viewKey, action, request) }
    catch (error) { if (error instanceof z.ZodError) throw new BadRequestException('spaces.invalid_input'); throw error }
  }
  /** Check once per View request, before accessing resources or serving the empty state.
   * Resource services still enforce their own Project and operation ACLs. */
  private async actor(context: XpertResolvedViewHostContext, requireProject = true) {
    if (!this.supports(context)) throw denied()
    const actor = actorSchema.extend({ assistantId: id }).parse({ ...context, assistantId: context.hostId, projectId: context.runtimeScope?.projectId ?? undefined })
    if (requireProject && !actor.projectId) throw denied()
    await this.access.assistant(actor)
    return actor
  }
  private async runAction(context: XpertResolvedViewHostContext, viewKey: string, action: string, request: XpertViewActionRequest) {
    if (viewKey !== VIEW) throw new Error('spaces.view_missing')
    if (!actions.includes(action)) throw new Error('spaces.action_unknown')
    const actor = await this.actor(context), input = request.input
    await this.spaces.workspace(actor)
    let result: object
    switch (action) {
      case 'source.list': result = await this.imports.sources(actor); break
      case 'source.search': result = await this.imports.search(actor, z.object({ bindingId: id, query: z.string().trim().max(200).default(''), cursor: z.string().max(2000).optional(), pageSize: z.number().int().min(1).max(50).default(25) }).strict().parse(input)); break
      case 'source.preview': result = await this.imports.preview(actor, sourceSelection.parse(input)); break
      case 'source.import': result = await this.imports.apply(actor, importSelection.parse(input)); break
      case 'document.open': result = await this.content.open(actor, selection.parse(input).itemId); break
      case 'knowledge.enable': case 'knowledge.status': case 'knowledge.refresh': {
        const p = z.object({ spaceId: id }).strict().parse(input)
        result = action === 'knowledge.enable' ? await this.knowledge.enable(actor, p.spaceId)
          : action === 'knowledge.refresh' ? await this.knowledge.refresh(actor, p.spaceId) : await this.knowledge.status(actor, p.spaceId)
        break
      }
      case 'knowledge.search': {
        const p = z.object({ spaceId: id, query: z.string().trim().min(1).max(4000) }).strict().parse(input)
        result = await this.knowledge.search(actor, p.spaceId, p.query); break
      }
      case 'catalog.backup': result = await this.catalog.backup(actor, z.object({ contentId: id }).strict().parse(input).contentId); break
      case 'catalog.preferences': result = await this.catalog.preferences(actor, z.object({ contentId: id }).strict().parse(input).contentId); break
      case 'catalog.preference.set': result = await this.catalog.setPreference(actor, z.object({ contentId: id, scope: z.enum(['resource', 'project', 'organization']), editorKey: z.string().min(1).max(200).nullable(), expectedRevision: z.number().int().nonnegative() }).strict().parse(input)); break
      case 'catalog.move': result = await this.catalog.move(actor, catalogMove.parse(input)); break
      case 'catalog.types': result = await this.catalog.types(actor); break
      case 'catalog.list': result = await this.catalog.list(actor, catalogQuery.parse(input)); break
      case 'catalog.lifecycle': result = await this.catalog.lifecycle(actor, catalogLifecycle.parse(input)); break
      case 'catalog.duplicate': result = await this.catalog.duplicate(actor, catalogDuplicate.parse(input)); break
      case 'catalog.rename': result = await this.catalog.rename(actor, catalogRename.parse(input)); break
      case 'catalog.create': result = await this.catalog.create(actor, catalogCreate.parse(input)); break
      case 'editor.list': result = await this.editors.list(actor); break
      case 'editor.create': {
        const p = z.object({ spaceId: id, parentId: id.nullable().default(null), title: z.string().trim().min(1).max(200), editorKey: z.string().max(100) }).strict().parse(input)
        result = await this.editors.create(actor, p.spaceId, p.parentId, p.title, p.editorKey); break
      }
      case 'item.create': result = await this.spaces.createItem(actor, createItemSchema.extend({ kind: z.enum(['folder', 'page']), artifactId: z.never().optional(), artifactVersionId: z.never().optional() }).parse(input)); break
      case 'item.edit': result = await this.spaces.editItem(actor, editItemSchema.parse(input)); break
      case 'page.read': result = await this.pages.read(actor, selection.parse(input).itemId); break
      case 'page.export': result = await this.files.exportPage(actor, selection.parse(input).itemId); break
      case 'file.list': result = await this.files.list(actor, selection.parse(input).itemId); break
      case 'artifact.reference.open': result = await this.artifactLibrary.open(actor, z.object({ referenceId: id }).strict().parse(input).referenceId); break
      case 'artifact.reference.revoke': result = await this.artifactLibrary.revoke(actor, z.object({ referenceId: id }).strict().parse(input).referenceId); break
      case 'artifact.reference.version': result = await this.artifactLibrary.selectVersion(actor, z.object({ referenceId: id, versionId: id, expectedRevision: z.number().int().positive() }).strict().parse(input)); break
      case 'artifact.reference.share': result = await this.artifactLibrary.share(actor, z.object({ referenceId: id, accessMode: z.enum(['organization_all', 'public_link']), days: z.number().int().min(1).max(30), acknowledgePublic: z.boolean().optional() }).strict().parse(input)); break
      case 'artifact.open': result = await this.files.openArtifact(actor, selection.parse(input).itemId); break
      case 'artifact.list': result = await this.files.available(actor, z.object({ page: z.number().int().min(1).default(1) }).strict().parse(input).page); break
      case 'artifact.collect': {
        const p = z.object({ spaceId: id, parentId: id.nullable().default(null), artifactId: id, versionId: id, mode: z.enum(['reference', 'copy']), acknowledgeCopy: z.boolean().optional() }).strict().parse(input)
        if (p.mode === 'copy' && p.acknowledgeCopy !== true) throw new BadRequestException('spaces.artifact_copy_confirmation_required')
        result = p.mode === 'reference' ? await this.artifactLibrary.add(actor, p) : await this.files.collect(actor, p.spaceId, p.parentId, p.artifactId, p.versionId); break
      }
      case 'search': {
        const p = z.object({ resourceId: id, query: z.string().trim().min(1).max(4000) }).strict().parse(input)
        result = await this.ai.search(actor, p.resourceId, p.query); break
      }
      default: throw new Error('spaces.action_unknown')
    }
    return { success: true, refresh: false, data: result }
  }
  async executeViewFileAction(context: XpertResolvedViewHostContext, viewKey: string, actionKey: string, request: XpertViewActionRequest, file: XpertViewFileActionFile) {
    if (viewKey !== VIEW || !['file.upload', 'editor.import'].includes(actionKey)) throw new Error('spaces.action_unknown')
    const actor = await this.actor(context)
    if (actionKey === 'editor.import') {
      const p = z.object({ spaceId: id, parentId: id.nullable().default(null), editorKey: z.string().max(100) }).strict().parse(request.input)
      return { success: true, data: await this.editors.create(actor, p.spaceId, p.parentId, file.originalname ?? 'Document', p.editorKey, file.buffer) }
    }
    const input = z.object({ spaceId: id, parentId: id.nullable().default(null) }).strict().parse(request.input)
    return { success: true, refresh: false, data: await this.files.upload(actor, input.spaceId,
      input.parentId, file.originalname ?? 'file', file.mimetype ?? 'application/octet-stream', file.buffer) }
  }
  async resolveViewFile(context: XpertResolvedViewHostContext, viewKey: string, request: XpertViewFileAccessRequest) {
    if (viewKey !== VIEW) throw new Error('spaces.view_missing')
    const actor = await this.actor(context)
    if (request.fileKey.startsWith('item:')) return this.files.current(actor, id.parse(request.fileKey.slice(5)))
    if (request.fileKey.startsWith('artifact:')) {
      const { version } = await this.files.openArtifact(actor, id.parse(request.fileKey.slice('artifact:'.length)))
      if (!version.workspaceFileRef) throw new BadRequestException('spaces.artifact_file_unavailable')
      return { reference: version.workspaceFileRef, fileName: version.fileName ?? 'artifact',
        mimeType: version.mimeType ?? 'application/octet-stream', size: version.size ?? undefined }
    }
    const version = await this.files.get(actor, id.parse(request.fileKey))
    return { reference: version.reference, fileName: version.reference.originalName ?? 'file',
      mimeType: version.reference.mimeType ?? 'application/octet-stream', size: version.reference.size ?? undefined }
  }
}
