import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import type { ArtifactVersionContext } from '@xpert-ai/plugin-sdk'
import { PLUGIN_NAME } from './dashboard.service'
import { decodeDashboardPackage, MAX_DASHBOARD_PACKAGE_BYTES } from './document-package'

/** Shared fixed-version parsing for rendering and analytics; never resolves a draft or a newer source version. */
export function readDashboardArtifact(context: ArtifactVersionContext) {
    const { artifact, version, content } = context
    if (artifact.pluginName !== PLUGIN_NAME || artifact.resourceType !== 'live-dashboard' || artifact.id !== version.artifactId ||
        artifact.tenantId !== context.actor.tenantId || artifact.organizationId !== context.actor.organizationId)
      throw new ForbiddenException('DASHBOARD_ACCESS_DENIED')
    if (version.mimeType !== 'application/json' || content.length > MAX_DASHBOARD_PACKAGE_BYTES) throw new BadRequestException('DASHBOARD_VERSION_UNAVAILABLE')
    if (!version.sha256 || createHash('sha256').update(content).digest('hex') !== version.sha256) throw new BadRequestException('DASHBOARD_VERSION_CONTENT_CHANGED')
    const { manifest, dependencies } = decodeDashboardPackage(content)
    const prefix = artifact.projectId ? `project/${artifact.projectId}/` : artifact.xpertId ? `agent/${artifact.xpertId}/` : null
    if (!prefix || artifact.resourceId !== `${prefix}${manifest.id}`) throw new BadRequestException('DASHBOARD_IDENTITY_MISMATCH')
    return { artifactId: artifact.id, versionId: version.id, versionNumber: version.versionNumber,
      title: version.title ?? manifest.title, isDraft: false, manifest, dependencies }
}
