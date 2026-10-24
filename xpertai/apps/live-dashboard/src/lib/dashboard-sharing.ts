import { sameAnalyticsResource } from './analytics-source'
import type { AnalyticsSourceSummary } from '@xpert-ai/contracts'
import type { DashboardManifest } from './dashboard.schema'

export const DASHBOARD_SHARE_KEY = 'team-readonly'

/** Apply the same provider policy when enabling a share and advancing a latest share. */
export function dashboardSharingIssues(manifest: DashboardManifest, sources: AnalyticsSourceSummary[]) {
  const issues: Array<{ code: string; bindingId: string }> = []
  for (const binding of manifest.bindings) {
    const provider = sources.find(source => sameAnalyticsResource(source.source, binding.source))?.providers.find(provider => provider.id === binding.providerId)
    if (!provider) issues.push({ code: 'DASHBOARD_SOURCE_UNAVAILABLE', bindingId: binding.id })
    else if (provider.sharing?.mode === 'owner_only') issues.push({ code: provider.sharing.reasonCode ?? 'DASHBOARD_PRIVATE_DEPENDENCY', bindingId: binding.id })
  }
  return issues
}
