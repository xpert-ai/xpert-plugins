export const REMOTE_TOOL_REFRESH_RETRY_DELAYS_MS = [300, 800]

const SNAPSHOT_MUTATION_TOOL_NAMES = new Set(['canvas_insert_image', 'canvas_patch_records', 'canvas_save_snapshot'])

export interface RemoteSnapshotApplyResult {
  applied: boolean
  reason:
    | 'applied'
    | 'missing_editor_or_snapshot'
    | 'missing_current_snapshot'
    | 'no_diff'
    | 'merge_failed'
    | 'not_requested'
  currentRecordCount: number
  nextRecordCount: number
  putCount: number
  removeCount: number
  hasEditor?: boolean
  hasSnapshot?: boolean
}

export interface RemoteToolRefreshRetryInput {
  toolName: string
  targetDocumentId: string
  selectedDocumentId: string
  baselineSignature: string
  loadedSignature: string
  baselineRevision?: number | null
  loadedRevision?: number | null
  baselineChecksum?: string
  loadedChecksum?: string
  hasSnapshot: boolean
  applyResult: RemoteSnapshotApplyResult
}

export interface RemoteToolRefreshRetryDecision {
  retry: boolean
  reason:
    | 'snapshot_changed'
    | 'not_snapshot_mutation'
    | 'target_not_loaded'
    | 'applied'
    | 'stale_revision'
    | 'revision_changed'
    | 'stale_checksum'
    | 'checksum_changed'
    | 'stale_signature'
    | 'missing_snapshot'
}

export function shouldRetryRemoteToolRefresh(input: RemoteToolRefreshRetryInput): RemoteToolRefreshRetryDecision {
  if (!SNAPSHOT_MUTATION_TOOL_NAMES.has(input.toolName)) {
    return {
      retry: false,
      reason: 'not_snapshot_mutation'
    }
  }

  if (!input.targetDocumentId || input.selectedDocumentId !== input.targetDocumentId) {
    return {
      retry: false,
      reason: 'target_not_loaded'
    }
  }

  if (input.applyResult.applied) {
    return {
      retry: false,
      reason: 'applied'
    }
  }

  if (!input.hasSnapshot || !input.loadedSignature) {
    return {
      retry: true,
      reason: 'missing_snapshot'
    }
  }

  if (input.baselineRevision != null && input.loadedRevision != null) {
    if (input.loadedRevision <= input.baselineRevision) {
      return {
        retry: true,
        reason: 'stale_revision'
      }
    }
    return {
      retry: false,
      reason: 'revision_changed'
    }
  }

  if (input.baselineChecksum && input.loadedChecksum) {
    if (input.loadedChecksum === input.baselineChecksum) {
      return {
        retry: true,
        reason: 'stale_checksum'
      }
    }
    return {
      retry: false,
      reason: 'checksum_changed'
    }
  }

  if (input.loadedSignature === input.baselineSignature) {
    return {
      retry: true,
      reason: 'stale_signature'
    }
  }

  return {
    retry: false,
    reason: 'snapshot_changed'
  }
}
