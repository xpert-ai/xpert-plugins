import { Logger } from '@nestjs/common'
import type { RunnableConfig } from '@langchain/core/runnables'
import type { ConversationResourceCard, XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { emitResourceCard } from '@xpert-ai/plugin-sdk'
import { dashboardNavigationTarget } from './dashboard-navigation'
import { dashboardIcon } from './dashboard-icon'

type DashboardCard = { artifactId: string; title: string } & (
  { state: 'draft'; revision: number } | { state: 'published'; versionNumber: number; versionId?: string }
)
const logger = new Logger('DashboardResourceCard')

/** Snapshot only. Opening a draft resolves current state; explicit historical reads pin a version. */
export function dashboardResourceCard(scope: XpertResolvedViewHostContext, saved: DashboardCard): ConversationResourceCard {
  return {
    resource: { namespace: 'live_dashboard', type: 'live-dashboard', id: saved.artifactId, artifactId: saved.artifactId },
    title: saved.title,
    description: saved.state === 'draft' ? `Dashboard · Draft r${saved.revision}` : `Dashboard · v${saved.versionNumber}`,
    icon: dashboardIcon,
    open: {
      ...dashboardNavigationTarget(scope), selectionId: saved.artifactId,
      ...(saved.state === 'published' && saved.versionId ? { parameters: { versionId: saved.versionId } } : {})
    }
  }
}

export async function emitDashboardCard(scope: XpertResolvedViewHostContext, saved: DashboardCard, config?: RunnableConfig) {
  try {
    await emitResourceCard(dashboardResourceCard(scope, saved), config)
    return { status: 'emitted' as const }
  } catch {
    logger.warn('Dashboard operation succeeded; resource card delivery failed')
    return { status: 'unavailable' as const }
  }
}
