import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import type { ContentResourceSnapshot, ResourceContentEditorRegistration, XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { ContentResourceProvider, ContentEditorProvider, ArtifactsRuntimeCapability, ArtifactDraftsRuntimeCapability,
  ProjectAccessRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry,
  type ContentCatalogProvider, type ContentDocumentScope, type ContentSourceInput, type ContentResourceRequest, type IContentResourceProvider } from '@xpert-ai/plugin-sdk'
import { DashboardService, PLUGIN_NAME } from './dashboard.service'
import { dashboardSearchProjection } from './dashboard-search'

export const DASHBOARD_CONTENT_PROVIDER = 'live-dashboard.content'
const MODEL = { typeId: 'xpert.live-dashboard', modelId: 'live-dashboard.manifest', schemaVersion: '1', editProtocol: { id: 'artifact-draft.cas', version: '1' } }
const EDITOR = 'live-dashboard.editor'
const context = (scope: ContentDocumentScope): XpertResolvedViewHostContext => ({ ...scope.actor, hostType: 'project', hostId: scope.projectId, slots: [] })
@Injectable()
@ContentEditorProvider(EDITOR)
export class DashboardContentEditor {
  readonly descriptor: ResourceContentEditorRegistration = { kind: 'resource', protocolVersion: 2, key: EDITOR, title: 'Live Dashboard',
    view: { providerKey: 'live-dashboard', viewKey: 'live-dashboard', entry: 'live-dashboard' }, supports: [{ ...MODEL, access: ['view', 'edit'] }] }
}
@Injectable()
@ContentResourceProvider(DASHBOARD_CONTENT_PROVIDER)
export class DashboardContentProvider implements IContentResourceProvider {
  readonly title = 'Live Dashboard'
  constructor(private readonly service: DashboardService, @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  readonly catalog: ContentCatalogProvider = {
    types: [{ ...MODEL, title: { en_US: 'Live dashboards', zh_Hans: '实时看板' }, implementationKey: 'live-dashboard',
      implementationTitle: { en_US: 'Live Dashboard', zh_Hans: '实时看板' }, defaultEditorKey: EDITOR }],
    discover: async scope => {
      await this.service.authorizeProject(context(scope))
      const page = Number(scope.cursor ?? 1)
      if (!Number.isSafeInteger(page) || page < 1) throw new BadRequestException('DASHBOARD_INVALID_CURSOR')
      const result = await this.runtime.require(ArtifactsRuntimeCapability).listArtifacts({ pluginName: PLUGIN_NAME,
        resourceType: 'live-dashboard', resourceIdPrefix: `project/${scope.projectId}/`, page, pageSize: 100, status: 'all' })
      return { resourceIds: result.items.filter(item => !item.userId && item.projectId === scope.projectId && item.status !== 'deleted').map(item => item.id),
        ...(result.items.length === 100 ? { nextCursor: String(page + 1) } : {}) }
    },
    describe: input => this.describe(input),
    extract: async input => {
      const saved = await this.service.open(context(input), input.sourceResourceId, undefined, undefined, 'published')
      return dashboardSearchProjection(saved.manifest, saved.versionId ?? 'unpublished')
    },
    create: async input => {
      if (input.templateId) throw new BadRequestException('DASHBOARD_TEMPLATE_UNAVAILABLE')
      const ctx = context(input)
      await this.service.authorizeProject(ctx, 'write')
      const source = { pluginName: PLUGIN_NAME, resourceType: 'live-dashboard', resourceId: `project/${input.projectId}/${input.requestId}` }
      const existing = await this.runtime.require(ArtifactsRuntimeCapability).findArtifactBySource(source)
      if (existing && await this.runtime.require(ArtifactDraftsRuntimeCapability).get(existing.id)) return { providerKey: DASHBOARD_CONTENT_PROVIDER, resourceId: existing.id }
      try {
        const created = await this.service.save(ctx, { schema: 'xpert.live-dashboard', id: input.requestId, title: input.title,
          bindings: [], controls: [], charts: [], tables: [] }, null, 0)
        return { providerKey: DASHBOARD_CONTENT_PROVIDER, resourceId: created.artifactId }
      } catch (error) {
        // Another request with this create-only identity may have saved the first
        // draft. Reuse it; never retry a create by overwriting the current draft.
        if (!(error instanceof ConflictException)) throw error
        const winner = await this.runtime.require(ArtifactsRuntimeCapability).findArtifactBySource(source)
        if (!winner || !await this.runtime.require(ArtifactDraftsRuntimeCapability).get(winner.id)) throw error
        await this.service.open(ctx, winner.id)
        return { providerKey: DASHBOARD_CONTENT_PROVIDER, resourceId: winner.id }
      }
    },
    mutate: async input => {
      const ctx = context(input), drafts = this.runtime.require(ArtifactDraftsRuntimeCapability)
      if (input.change.action === 'trash' || input.change.action === 'restore') {
        await this.service.authorizeProject(ctx, 'manage')
        await drafts.setRecycled({ artifactId: input.sourceResourceId, expectedRevision: Number(input.expectedRevision), recycled: input.change.action === 'trash' })
      } else {
        const saved = await this.service.open(ctx, input.sourceResourceId)
        if (String(saved.draftRevision ?? 0) !== input.expectedRevision) throw new ConflictException('DASHBOARD_DRAFT_CONFLICT')
        if (input.change.action === 'duplicate') {
          await this.service.authorizeProject(ctx, 'write')
          const artifacts = this.runtime.require(ArtifactsRuntimeCapability)
          const source = { pluginName: PLUGIN_NAME, resourceType: 'live-dashboard', resourceId: `project/${input.projectId}/${input.change.requestId}` }
          const existing = await artifacts.findArtifactBySource(source)
          if (existing && await drafts.get(existing.id)) return { providerKey: DASHBOARD_CONTENT_PROVIDER, resourceId: existing.id }
          try {
            // Only the definition is copied. Data is queried again as the acting user;
            // published versions, share tokens and query results are never cloned.
            const copy = await this.service.save(ctx, { ...saved.manifest, id: input.change.requestId, title: input.change.title }, null, 0)
            return { providerKey: DASHBOARD_CONTENT_PROVIDER, resourceId: copy.artifactId }
          } catch (error) {
            if (!(error instanceof ConflictException)) throw error
            const winner = await artifacts.findArtifactBySource(source)
            if (!winner || !await drafts.get(winner.id)) throw error
            return { providerKey: DASHBOARD_CONTENT_PROVIDER, resourceId: winner.id }
          }
        }
        if (input.change.action !== 'rename') throw new BadRequestException('DASHBOARD_ACTION_UNAVAILABLE')
        await this.service.update(ctx, input.sourceResourceId, Number(input.expectedRevision), { title: input.change.title }, saved.baseVersionId ?? saved.versionId ?? null)
      }
      return { providerKey: DASHBOARD_CONTENT_PROVIDER, resourceId: input.sourceResourceId }
    }
  }

  async authorize(input: ContentResourceRequest) {
    const artifact = await this.runtime.require(ArtifactsRuntimeCapability).getArtifact(input.resourceId)
    if (!artifact.projectId || artifact.userId || artifact.pluginName !== PLUGIN_NAME || artifact.resourceType !== 'live-dashboard') throw new ForbiddenException('DASHBOARD_ACCESS_DENIED')
    const ctx = context({ actor: input.actor, projectId: artifact.projectId })
    await this.service.authorizeProject(ctx, input.operation === 'read' ? 'read' : input.operation === 'manage' ? 'manage' : 'write')
    const access = (await this.runtime.require(ProjectAccessRuntimeCapability).listReadable({ actor: input.actor, projectIds: [artifact.projectId] }))[0]
    if (!access) throw new ForbiddenException('DASHBOARD_ACCESS_DENIED')
    if (access.role === 'member' && !artifact.currentVersionId) throw new ForbiddenException('DASHBOARD_NOT_PUBLISHED')
    return { providerKey: DASHBOARD_CONTENT_PROVIDER, resourceId: input.resourceId, title: artifact.title ?? '', role: access.role,
      canWrite: !access.archived && ['owner', 'manager', 'editor'].includes(access.role), canManage: access.canManage }
  }
  private async describe(input: ContentSourceInput): Promise<ContentResourceSnapshot> {
    await this.service.authorizeProject(context(input))
    const access = (await this.runtime.require(ProjectAccessRuntimeCapability).listReadable({ actor: input.actor, projectIds: [input.projectId] }))[0]
    if (!access) throw new ForbiddenException('DASHBOARD_ACCESS_DENIED')
    const artifact = await this.runtime.require(ArtifactsRuntimeCapability).getArtifact(input.sourceResourceId)
    if (artifact.projectId !== input.projectId || artifact.status === 'deleted') throw new ForbiddenException('DASHBOARD_ACCESS_DENIED')
    const draft = access.role !== 'member' ? await this.runtime.require(ArtifactDraftsRuntimeCapability).get(input.sourceResourceId, { includeArchived: true }) : null
    if (access.role === 'member') {
      const saved = await this.service.open(context(input), input.sourceResourceId, undefined, undefined, 'published')
      return { ...MODEL, projectId: input.projectId, title: saved.manifest.title, revision: String(saved.versionNumber),
        updatedAt: new Date(saved.updatedAt ?? 0).toISOString(), deleted: false, defaultEditorKey: EDITOR, allowedActions: [],
        sourceSync: { status: 'synced', revision: String(saved.versionNumber) }, source: { kind: 'managed' } }
    }
    if (!draft) throw new BadRequestException('DASHBOARD_VERSION_UNAVAILABLE')
    const deleted = artifact.status === 'archived'
    const saved = !deleted ? await this.service.open(context(input), input.sourceResourceId) : null
    return { ...MODEL, projectId: input.projectId, title: draft.title ?? artifact.title ?? '', revision: String(draft.revision),
      updatedAt: new Date(draft.updatedAt ?? artifact.updatedAt ?? 0).toISOString(), deleted, defaultEditorKey: EDITOR,
      allowedActions: [...(!deleted && !access.archived ? ['rename' as const, 'duplicate' as const] : []), ...(access.canManage ? [deleted ? 'restore' as const : 'trash' as const] : [])],
      ...(saved ? { preview: { kind: 'outline' as const, revision: String(draft.revision), lines: [saved.manifest.title, ...saved.manifest.charts.map(chart => chart.title), ...saved.manifest.tables.map(table => table.title)].slice(0, 6).map(line => line.slice(0, 160)) } } : {}),
      sourceSync: { status: 'synced', revision: String(draft.revision) },
      source: draft.workspaceFileRef?.workspacePath ? { kind: 'file', path: draft.workspaceFileRef.workspacePath } : { kind: 'managed' } }
  }
}
