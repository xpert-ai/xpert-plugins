import { ForbiddenException, Inject } from '@nestjs/common'
import { ArtifactTypeProvider, ProjectAccessRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry, type ArtifactTypeDefinition, type ArtifactTypeSource, type ArtifactTypeActor, type ContentOperation, type IArtifactTypeProvider } from '@xpert-ai/plugin-sdk'
import { datasetDefinitionSchema } from './dataset.schema'
import { DATASET_RESOURCE_TYPE } from './dataset.service'
import { PLUGIN_NAME } from './dashboard.service'

@ArtifactTypeProvider(DATASET_RESOURCE_TYPE)
export class DashboardDatasetArtifactType implements IArtifactTypeProvider {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  readonly definition: ArtifactTypeDefinition = {
    versioning: { mode: 'draft-only' }, title: { en_US: 'Reusable dashboard dataset', zh_Hans: '看板数据集' }, kinds: ['file'],
    content: { mimeTypes: ['application/json'], maxBytes: 200_000 }, collection: { allowCopy: false }, presentation: { mode: 'file' }
  }
  async authorize(source: ArtifactTypeSource, actor: ArtifactTypeActor, _operation: ContentOperation) {
    if (!actor.tenantId || !actor.userId || source.tenantId !== actor.tenantId || source.pluginName !== PLUGIN_NAME || source.resourceType !== DATASET_RESOURCE_TYPE)
      throw new ForbiddenException('DASHBOARD_DATASET_DENIED')
    if (source.userId && source.userId !== actor.userId) throw new ForbiddenException('DASHBOARD_DATASET_DENIED')
    if (!source.userId) {
      if (!source.projectId) throw new ForbiddenException('DASHBOARD_DATASET_DENIED')
      await this.runtime.require(ProjectAccessRuntimeCapability).assertEdit({ projectId: source.projectId,
        actor: { tenantId: actor.tenantId, organizationId: source.organizationId, userId: actor.userId } })
    }
  }
  authorizeDraft(source: ArtifactTypeSource, actor: ArtifactTypeActor, operation: ContentOperation) { return this.authorize(source, actor, operation) }
  validateContent(buffer: Buffer, mimeType: string) {
    if (mimeType !== 'application/json' || buffer.length > 200_000) throw new ForbiddenException('DASHBOARD_DATASET_UNAVAILABLE')
    datasetDefinitionSchema.parse(JSON.parse(buffer.toString('utf8')))
  }
}
