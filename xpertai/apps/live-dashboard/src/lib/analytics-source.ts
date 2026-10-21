import type { AnalyticsSourceRef } from '@xpert-ai/contracts'

/** Catalogs show the latest version; historical pinned queries still resolve through the host ACL. */
export function sameAnalyticsResource(left: AnalyticsSourceRef, right: AnalyticsSourceRef): boolean {
  if (left.kind === 'data-source') return right.kind === 'data-source' && left.dataSourceId === right.dataSourceId
  if (left.kind === 'definition') return right.kind === 'definition' && left.definitionId === right.definitionId
  return right.kind === 'artifact' && left.artifactId === right.artifactId
}
