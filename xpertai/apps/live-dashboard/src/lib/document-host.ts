import { mountArtifactDocument, isArtifactDocumentResourceAllowed, type ArtifactDocumentHostOptions } from '@xpert-ai/plugin-sdk/artifact-document'
import { DASHBOARD_NETWORK_POLICY } from './document-network'
import { DASHBOARD_DOWNLOAD_POLICY } from './dashboard-download-policy'

/** The HTML never supplies or overrides its network permissions. */
export function mountDashboardDocument<T>(frame: HTMLIFrameElement, options: Omit<ArtifactDocumentHostOptions<T>, 'allowDownloads'>) {
  return mountArtifactDocument(frame, { ...options, ...DASHBOARD_DOWNLOAD_POLICY, dispatchesPerMinute: 60, networkPolicy: DASHBOARD_NETWORK_POLICY })
}

export function isDashboardResourceAllowed(resourceType: string, url: string): boolean {
  return isArtifactDocumentResourceAllowed(DASHBOARD_NETWORK_POLICY, resourceType, url)
}
