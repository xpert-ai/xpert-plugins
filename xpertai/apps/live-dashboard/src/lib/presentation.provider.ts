import { BadRequestException, ForbiddenException, Inject } from '@nestjs/common'
import type { ArtifactPresentationQuery } from '@xpert-ai/contracts'
import { ArtifactPresentationProvider, XPERT_RUNTIME_CAPABILITIES_TOKEN, type ArtifactPresentationContext,
  type IArtifactPresentationProvider, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { PLUGIN_NAME } from './dashboard.service'
import { readDashboardArtifact } from './dashboard-artifact'
import { dashboardRemoteEntry } from './remote-entry'
import { querySchema, queryBindingSchema } from './dashboard.schema'
import { queryDashboardPartial, queryDashboardBinding } from './dashboard-queries'
import { toDataAnalyticsPayload } from './renderer'
import { publicDashboardManifest } from './dashboard-sources'

@ArtifactPresentationProvider({ pluginName: PLUGIN_NAME, resourceType: 'live-dashboard' })
export class DashboardPresentationProvider implements IArtifactPresentationProvider {
  readonly operations = ['query', 'query-binding'] as const
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  getEntry() { return dashboardRemoteEntry(true) }
  async read(context: ArtifactPresentationContext) {
    const saved = this.open(context)
    return { meta: { saved: { ...saved, manifest: publicDashboardManifest(saved.manifest) }, dashboards: [{ artifactId: saved.artifactId, versionId: saved.versionId, title: saved.title }], sources: [], versions: [] } }
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
    if (context.usage && (context.usage.kind !== 'group-reference' || context.usage.ownerProjectId !== context.artifact.projectId ||
      context.usage.runtimeProjectId === context.artifact.projectId)) throw new ForbiddenException('DASHBOARD_ACCESS_DENIED')
    return readDashboardArtifact(context)
  }
}
