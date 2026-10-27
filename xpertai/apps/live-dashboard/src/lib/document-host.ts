import { mountArtifactDocument, isArtifactDocumentResourceAllowed, type ArtifactDocumentHostOptions } from '@xpert-ai/plugin-sdk/artifact-document'
import { DASHBOARD_NETWORK_POLICY } from './document-network'

/** The HTML never supplies or overrides its network permissions. */
export function mountDashboardDocument<T>(frame: HTMLIFrameElement, options: ArtifactDocumentHostOptions<T>) {
  return mountArtifactDocument(frame, { ...options, networkPolicy: DASHBOARD_NETWORK_POLICY })
}

export function isDashboardResourceAllowed(resourceType: string, url: string): boolean {
  return isArtifactDocumentResourceAllowed(DASHBOARD_NETWORK_POLICY, resourceType, url)
}
