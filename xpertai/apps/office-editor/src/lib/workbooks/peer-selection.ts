import type { ICollaborationPresence } from '@xpert-ai/plugin-sdk/collaboration-client'

/** Coordinates are safe to paint only against the same canonical input revision. */
export function peerCellsAtRevision(peer: ICollaborationPresence, revision: number) {
  const cells = peer.selection?.kind === 'cells' ? peer.selection.cells : null
  return cells && Number.isSafeInteger(revision) && revision > 0 && cells.baseRevision === revision ? cells : null
}
