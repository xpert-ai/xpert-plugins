import { BadRequestException, ForbiddenException, Inject } from '@nestjs/common'
import { createHash } from 'node:crypto'
import type { ArtifactPresentationQuery } from '@xpert-ai/contracts'
import { ArtifactPresentationProvider, XPERT_RUNTIME_CAPABILITIES_TOKEN, type ArtifactPresentationContext,
  type IArtifactPresentationProvider, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { PLUGIN_NAME } from './dashboard.service'
import { decodeDashboardPackage, MAX_DASHBOARD_PACKAGE_BYTES } from './document-package'
import { dashboardRemoteEntry } from './remote-entry'
import { querySchema, queryBindingSchema } from './dashboard.schema'
import { queryDashboardPartial, queryDashboardBinding } from './dashboard-queries'
import { toDataAnalyticsPayload } from './renderer'

@ArtifactPresentationProvider({ pluginName: PLUGIN_NAME, resourceType: 'live-dashboard' })
export class DashboardPresentationProvider implements IArtifactPresentationProvider {
  readonly operations = ['query', 'query-binding'] as const
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  getEntry() { return dashboardRemoteEntry(true) }
  async read(context: ArtifactPresentationContext) {
    const saved = this.open(context)
    return { meta: { saved, dashboards: [{ artifactId: saved.artifactId, versionId: saved.versionId, title: saved.title }], sources: [], versions: [] } }
  }
  async query(context: ArtifactPresentationContext, request: ArtifactPresentationQuery) {
    const saved = this.open(context)
    const parsed = (request.operation === 'query-binding' ? queryBindingSchema : querySchema).safeParse(request.input)
    if (!parsed.success) throw new BadRequestException('DASHBOARD_INVALID_QUERY')
    const input = parsed.data
    if (input.artifactId !== saved.artifactId || input.versionId !== saved.versionId || input.draftRevision !== undefined)
      throw new ForbiddenException('DASHBOARD_SHARED_VERSION_REQUIRED')
    if (request.operation === 'query-binding' && 'bindingId' in input && typeof input.bindingId === 'string') return queryDashboardBinding(this.runtime, context.actor, saved.manifest, input.bindingId, input.controls)
    if (request.operation !== 'query') throw new ForbiddenException('DASHBOARD_ACTION_UNSUPPORTED')
    const { datasets, failures } = await queryDashboardPartial(this.runtime, context.actor, saved.manifest, input.controls)
    return { datasets, failures, ...(saved.manifest.presentation ? {} : { payload: toDataAnalyticsPayload(saved.manifest, datasets) }) }
  }
  private open(context: ArtifactPresentationContext) {
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
}
