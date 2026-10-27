import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { z } from 'zod/v3'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { ArtifactsRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { DashboardService } from './dashboard.service'
import { DASHBOARD_SHARE_KEY, dashboardSharingIssues } from './dashboard-sharing'

export const shareInput = z.object({ artifactId: z.string().uuid(), versionMode: z.enum(['latest', 'version']), versionId: z.string().uuid().optional() }).strict()
  .refine(value => value.versionMode !== 'version' || !!value.versionId, 'A fixed share requires a published version')

@Injectable()
export class DashboardSharingService {
  constructor(private readonly dashboards: DashboardService, @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  async inspect(context: XpertResolvedViewHostContext, artifactId: string, versionId?: string) {
    const versions = await this.dashboards.history(context, artifactId)
    const selected = versionId ? versions.find(version => version.versionId === versionId) : versions.find(version => version.current)
    const link = await this.runtime.require(ArtifactsRuntimeCapability).getArtifactShare({ artifactId, shareKey: DASHBOARD_SHARE_KEY })
    const issues: Array<{ code: string; bindingId?: string }> = []
    if (!selected?.versionId) issues.push({ code: 'DASHBOARD_PUBLISH_BEFORE_SHARING' })
    else {
      const saved = await this.dashboards.open(context, artifactId, selected.versionId)
      const sources = await this.dashboards.sources(context)
      issues.push(...dashboardSharingIssues(saved.manifest, sources))
    }
    return { published: selected ?? null, issues, link: link ? { status: link.status, versionMode: link.versionMode,
      versionId: link.artifactVersionId, url: link.presentationUrl, expiresAt: link.expiresAt } : null }
  }
  async share(context: XpertResolvedViewHostContext, input: z.infer<typeof shareInput>) {
    await this.dashboards.authorizeProject(context, 'manage')
    const state = await this.inspect(context, input.artifactId, input.versionMode === 'version' ? input.versionId : undefined)
    if (state.issues.length || !state.published?.versionId) throw new BadRequestException({ code: 'DASHBOARD_SHARE_BLOCKED', issues: state.issues })
    const result = await this.runtime.require(ArtifactsRuntimeCapability).ensureArtifactShare({ artifactId: input.artifactId, shareKey: DASHBOARD_SHARE_KEY,
      versionMode: input.versionMode, ...(input.versionMode === 'version' ? { artifactVersionId: state.published.versionId } : {}),
      access: { mode: 'organization_all' }, presentation: { allowDownload: false, disposition: 'inline', safeHtmlProfile: 'strict' } })
    if (!result.link.presentationUrl) throw new BadRequestException('DASHBOARD_PRESENTATION_HOST_REQUIRED')
    return this.inspect(context, input.artifactId, input.versionMode === 'version' ? input.versionId : undefined)
  }
  async revoke(context: XpertResolvedViewHostContext, artifactId: string) {
    await this.dashboards.authorizeProject(context, 'manage')
    await this.dashboards.history(context, artifactId)
    await this.runtime.require(ArtifactsRuntimeCapability).revokeArtifactShare({ artifactId, shareKey: DASHBOARD_SHARE_KEY })
    return this.inspect(context, artifactId)
  }
}
