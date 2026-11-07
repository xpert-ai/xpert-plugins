import { createHash } from 'node:crypto'
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { ArtifactContentRuntimeCapability, ArtifactDraftsRuntimeCapability, ArtifactsRuntimeCapability, WorkspaceFilesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type ArtifactRecord, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { analyticsSourceRefSchema } from '@xpert-ai/plugin-sdk/analytics'
import { DashboardService, PLUGIN_NAME, projectId } from './dashboard.service'
import { datasetDefinitionSchema, datasetSaveSchema, type DatasetRecord } from './dataset.schema'

export const DATASET_RESOURCE_TYPE = 'live-dashboard-dataset'
const MAX_BYTES = 200_000
const prefix = (context: XpertResolvedViewHostContext) => projectId(context) ? `project/${projectId(context)}/` : `agent/${context.hostId}/`

/**
 * Persist reusable queries, never result rows. Every read and mutation rechecks the host's current actor.
 * @beta Dataset service APIs and persisted definitions may change incompatibly during beta.
 */
@Injectable()
export class DashboardDatasetService {
  constructor(private readonly dashboards: DashboardService, @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  private async authorize(context: XpertResolvedViewHostContext, write = false) {
    await this.dashboards.authorizeProject(context, write ? 'write' : 'read')
    if (!(await this.dashboards.access(context)).canEdit) throw new ForbiddenException('DASHBOARD_DEFINITION_ACCESS_DENIED')
  }
  private owned(context: XpertResolvedViewHostContext, artifact: ArtifactRecord) {
    if (artifact.pluginName !== PLUGIN_NAME || artifact.resourceType !== DATASET_RESOURCE_TYPE || artifact.status !== 'active' ||
      !artifact.resourceId.startsWith(prefix(context)) || artifact.tenantId !== context.tenantId || artifact.organizationId !== context.organizationId ||
      (artifact.userId ? artifact.userId !== context.userId : !projectId(context) || artifact.projectId !== projectId(context))) throw new ForbiddenException('DASHBOARD_DATASET_DENIED')
  }
  async list(context: XpertResolvedViewHostContext, page = 1, pageSize = 30, search = '') {
    await this.authorize(context)
    const result = await this.runtime.require(ArtifactsRuntimeCapability).listArtifacts({ pluginName: PLUGIN_NAME, resourceType: DATASET_RESOURCE_TYPE,
      resourceIdPrefix: prefix(context), status: 'active', page, pageSize })
    const drafts = await this.runtime.require(ArtifactDraftsRuntimeCapability).list(result.items.map(item => item.id))
    const items = result.items.flatMap(artifact => {
      this.owned(context, artifact)
      const draft = drafts.find(item => item.artifactId === artifact.id)
      const metadata = datasetDefinitionSchema.pick({ name: true, description: true }).extend({ providerId: z.string(), source: analyticsSourceRefSchema,
        fields: z.number() }).safeParse(draft?.metadata)
      if (!draft || !metadata.success || !metadata.data.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) return []
      return [{ artifactId: artifact.id, revision: draft.revision, ...metadata.data, updatedAt: draft.updatedAt ? new Date(draft.updatedAt).toISOString() : undefined }]
    })
    return { items, page, hasMore: page * pageSize < result.total }
  }
  async open(context: XpertResolvedViewHostContext, artifactId: string): Promise<DatasetRecord> {
    await this.authorize(context)
    const artifact = await this.runtime.require(ArtifactsRuntimeCapability).getArtifact(artifactId)
    this.owned(context, artifact)
    const draft = await this.runtime.require(ArtifactDraftsRuntimeCapability).get(artifactId)
    if (!draft?.workspaceFileRef) throw new BadRequestException('DASHBOARD_DATASET_UNAVAILABLE')
    const { buffer } = await this.runtime.require(WorkspaceFilesRuntimeCapability).readBuffer(draft.workspaceFileRef)
    if (buffer.length > MAX_BYTES) throw new BadRequestException('DASHBOARD_DATASET_TOO_LARGE')
    const definition = datasetDefinitionSchema.parse(JSON.parse(buffer.toString('utf8')))
    if (artifact.resourceId !== prefix(context) + definition.id) throw new ForbiddenException('DASHBOARD_DATASET_DENIED')
    return { artifactId, revision: draft.revision, name: definition.name, description: definition.description,
      source: definition.binding.source, providerId: definition.binding.providerId, fields: definition.binding.output.fields.length,
      updatedAt: draft.updatedAt ? new Date(draft.updatedAt).toISOString() : undefined, definition }
  }
  async save(context: XpertResolvedViewHostContext, input: z.infer<typeof datasetSaveSchema>) {
    await this.authorize(context, true)
    const definition = datasetDefinitionSchema.parse(input.definition)
    const artifacts = this.runtime.require(ArtifactsRuntimeCapability)
    const source = { pluginName: PLUGIN_NAME, resourceType: DATASET_RESOURCE_TYPE, resourceId: prefix(context) + definition.id }
    const existing = await artifacts.findArtifactBySource(source)
    if (existing) this.owned(context, existing)
    if (input.artifactId && existing?.id !== input.artifactId || !existing && input.expectedRevision !== 0) throw new ConflictException('DASHBOARD_DATASET_CONFLICT')
    // Query before accepting a reusable definition: syntax, output projection and current source ACL must be valid.
    await this.dashboards.preview(context, { binding: definition.binding, controls: definition.controls })
    const buffer = Buffer.from(JSON.stringify(definition))
    if (buffer.length > MAX_BYTES) throw new BadRequestException('DASHBOARD_DATASET_TOO_LARGE')
    const artifact = existing ?? await artifacts.createArtifact({ source, type: { pluginName: PLUGIN_NAME, resourceType: DATASET_RESOURCE_TYPE }, kind: 'file', title: definition.name,
      scope: { tenantId: context.tenantId, organizationId: context.organizationId, userId: projectId(context) ? null : context.userId,
        ...(projectId(context) ? { projectId: projectId(context) } : { xpertId: context.hostId }) } })
    const reference = await this.runtime.require(ArtifactContentRuntimeCapability).write({ artifactId: artifact.id, buffer })
    await this.runtime.require(ArtifactDraftsRuntimeCapability).save({ artifactId: artifact.id, expectedRevision: input.expectedRevision, expectedCurrentVersionId: null,
      workspaceFileRef: reference, mimeType: 'application/json', fileName: 'dataset.json', title: definition.name, sha256: createHash('sha256').update(buffer).digest('hex'),
      metadata: { name: definition.name, description: definition.description, providerId: definition.binding.providerId, source: definition.binding.source, fields: definition.binding.output.fields.length } })
    return this.open(context, artifact.id)
  }
  async preview(context: XpertResolvedViewHostContext, artifactId: string) {
    const { definition } = await this.open(context, artifactId)
    return this.dashboards.preview(context, { binding: definition.binding, controls: definition.controls })
  }
  async remove(context: XpertResolvedViewHostContext, artifactId: string, expectedRevision: number) {
    await this.authorize(context, true)
    await this.open(context, artifactId)
    await this.runtime.require(ArtifactDraftsRuntimeCapability).setRecycled({ artifactId, expectedRevision, recycled: true })
    return { artifactId }
  }
}
