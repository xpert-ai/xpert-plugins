import { DashboardService } from './dashboard.service'
import type { ArtifactDraftRecord } from '@xpert-ai/plugin-sdk'
import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { ArtifactTypeProvider, ProjectAccessRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry, type ArtifactTypeDefinition, type ArtifactTypeSource, type ArtifactTypeActor, type ContentOperation, type IArtifactTypeProvider } from '@xpert-ai/plugin-sdk'
import { decodeDashboardPackage, MAX_DASHBOARD_PACKAGE_BYTES } from './document-package'
import { DASHBOARD_SHARE_KEY } from './dashboard-sharing'

/** Drafts require Project edit access; Project membership and link audiences remain cumulative. */
@Injectable()
@ArtifactTypeProvider('live-dashboard')
export class DashboardArtifactType implements IArtifactTypeProvider {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry, private readonly dashboards: DashboardService) {}
  readonly definition: ArtifactTypeDefinition = {
    versioning: { mode: 'draft-only' },
    title: { en_US: 'Live dashboard', zh_Hans: '实时看板' },
    kinds: ['file'], content: { mimeTypes: ['application/json'], maxBytes: MAX_DASHBOARD_PACKAGE_BYTES },
    collection: { allowCopy: false },
    sharing: { accessModes: ['organization_all'], versionModes: ['latest', 'version'],
      allowDownload: false, mutableLinks: true, descriptor: true, shareKey: DASHBOARD_SHARE_KEY },
    presentation: { mode: 'authenticated' }
  }
  async authorize(source: ArtifactTypeSource, actor: ArtifactTypeActor, _operation: ContentOperation) {
    if (!actor.userId || !actor.tenantId || source.tenantId !== actor.tenantId ||
      source.pluginName !== '@xpert-ai/plugin-live-dashboard' || source.resourceType !== 'live-dashboard')
      throw new ForbiddenException('DASHBOARD_ACCESS_DENIED')
  }
  validateContent(content: Buffer, mimeType: string) {
    if (mimeType !== 'application/json' || content.length > MAX_DASHBOARD_PACKAGE_BYTES)
      throw new ForbiddenException('DASHBOARD_VERSION_UNAVAILABLE')
    decodeDashboardPackage(content)
  }
  async authorizeDraft(source: ArtifactTypeSource, actor: ArtifactTypeActor, operation: ContentOperation) {
    await this.authorize(source, actor, operation)
    if (source.userId || !source.projectId) return
    const access = (await this.runtime.require(ProjectAccessRuntimeCapability).listReadable({
      actor: { tenantId: actor.tenantId!, userId: actor.userId!, organizationId: source.organizationId }, projectIds: [source.projectId]
    }))[0]
    if (!access || access.role === 'member') throw new ForbiddenException('DASHBOARD_DRAFT_ACCESS_DENIED')
  }
  async assertDraftPublication(source: ArtifactTypeSource, actor: ArtifactTypeActor, draft: ArtifactDraftRecord) {
    await this.authorizeDraft(source, actor, 'manage')
    if (!actor.tenantId || !actor.userId || !source.organizationId) throw new ForbiddenException('DASHBOARD_ACCESS_DENIED')
    const currentActor = { tenantId: actor.tenantId, userId: actor.userId, organizationId: source.organizationId }
    await this.dashboards.validatePublication({ ...currentActor, hostType: source.projectId ? 'project' : 'agent',
      hostId: source.projectId ?? source.xpertId!, slots: [] }, draft.artifactId, draft.revision, draft.baseVersionId)
  }
  validateLegacyContent(source: ArtifactTypeSource, content: Buffer, mimeType: string) {
    this.validateContent(content, mimeType)
    const { manifest } = decodeDashboardPackage(content)
    const prefix = source.projectId ? `project/${source.projectId}/` : source.xpertId ? `agent/${source.xpertId}/` : null
    if (!prefix || source.resourceId !== `${prefix}${manifest.id}`) throw new ForbiddenException('DASHBOARD_IDENTITY_MISMATCH')
  }
}
