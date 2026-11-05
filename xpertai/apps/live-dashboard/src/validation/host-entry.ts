export { installArtifactDocumentFramePolicy } from '@xpert-ai/plugin-sdk/artifact-document'
export { isDashboardResourceAllowed } from '../lib/document-host'
import { mountArtifactDocument as mount, type ArtifactDocumentHostOptions } from '@xpert-ai/plugin-sdk/artifact-document'
import { DASHBOARD_NETWORK_POLICY } from '../lib/document-network'

/** Sandbox-only immutable Dataset replay. No provider or host query API exists here.
 * Bound each source to 16 replays (initial, up to 12 button transitions, refresh).
 * Live rendering retains its independent 60/minute dispatch protection. */
export function mountArtifactDocument<T>(frame: HTMLIFrameElement, options: ArtifactDocumentHostOptions<T>) {
  const calls = new Map<string, number>()
  return mount(frame, { ...options, dispatchesPerMinute: Math.max(60, options.context.bindingIds.length * 16),
    networkPolicy: DASHBOARD_NETWORK_POLICY, query: async (input, signal) => {
      const count = (calls.get(input.bindingId) ?? 0) + 1
      calls.set(input.bindingId, count)
      if (count > 16) { options.onError?.('DOCUMENT_SNAPSHOT_REPLAY_LIMIT'); throw new Error('DOCUMENT_SNAPSHOT_REPLAY_LIMIT') }
      return options.query(input, signal)
    } })
}
