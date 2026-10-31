import { ForbiddenException, Injectable } from '@nestjs/common'
import { ArtifactTypeProvider, type ArtifactTypeDefinition, type ArtifactTypeSource, type ArtifactTypeActor, type ContentOperation, type IArtifactTypeProvider } from '@xpert-ai/plugin-sdk'
import { decodeDashboardPackage, MAX_DASHBOARD_PACKAGE_BYTES } from './document-package'
import { DASHBOARD_SHARE_KEY } from './dashboard-sharing'

/** Platform ownership, Project ACLs and link audiences remain cumulative restrictions. */
@Injectable()
@ArtifactTypeProvider('live-dashboard')
export class DashboardArtifactType implements IArtifactTypeProvider {
  readonly definition: ArtifactTypeDefinition = {
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
  validateLegacyContent(source: ArtifactTypeSource, content: Buffer, mimeType: string) {
    this.validateContent(content, mimeType)
    const { manifest } = decodeDashboardPackage(content)
    const prefix = source.projectId ? `project/${source.projectId}/` : source.xpertId ? `agent/${source.xpertId}/` : null
    if (!prefix || source.resourceId !== `${prefix}${manifest.id}`) throw new ForbiddenException('DASHBOARD_IDENTITY_MISMATCH')
  }
}
