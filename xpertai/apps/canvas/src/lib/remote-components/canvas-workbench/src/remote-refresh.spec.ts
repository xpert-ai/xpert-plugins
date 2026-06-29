import { type RemoteSnapshotApplyResult, shouldRetryRemoteToolRefresh } from './remote-refresh.js'

describe('remote canvas refresh retry', () => {
  it('retries stale snapshot reads after canvas image insertion', () => {
    expect(
      shouldRetryRemoteToolRefresh({
        toolName: 'canvas_insert_image',
        targetDocumentId: 'doc-1',
        selectedDocumentId: 'doc-1',
        baselineSignature: 'sig-old',
        loadedSignature: 'sig-old',
        hasSnapshot: true,
        applyResult: applyResult('no_diff')
      })
    ).toEqual({
      retry: true,
      reason: 'stale_signature'
    })
  })

  it('retries stale snapshot reads using working copy revision before signature fallback', () => {
    expect(
      shouldRetryRemoteToolRefresh({
        toolName: 'canvas_insert_image',
        targetDocumentId: 'doc-1',
        selectedDocumentId: 'doc-1',
        baselineSignature: 'sig-old',
        loadedSignature: 'sig-new',
        baselineRevision: 4,
        loadedRevision: 4,
        baselineChecksum: 'checksum-old',
        loadedChecksum: 'checksum-new',
        hasSnapshot: true,
        applyResult: applyResult('no_diff')
      })
    ).toEqual({
      retry: true,
      reason: 'stale_revision'
    })
  })

  it('stops retrying when a newer working copy revision was loaded', () => {
    expect(
      shouldRetryRemoteToolRefresh({
        toolName: 'canvas_insert_image',
        targetDocumentId: 'doc-1',
        selectedDocumentId: 'doc-1',
        baselineSignature: 'sig-old',
        loadedSignature: 'sig-old',
        baselineRevision: 4,
        loadedRevision: 5,
        hasSnapshot: true,
        applyResult: applyResult('no_diff')
      })
    ).toEqual({
      retry: false,
      reason: 'revision_changed'
    })
  })

  it('does not retry when the remote snapshot was applied', () => {
    expect(
      shouldRetryRemoteToolRefresh({
        toolName: 'canvas_insert_image',
        targetDocumentId: 'doc-1',
        selectedDocumentId: 'doc-1',
        baselineSignature: 'sig-old',
        loadedSignature: 'sig-new',
        hasSnapshot: true,
        applyResult: applyResult('applied')
      })
    ).toEqual({
      retry: false,
      reason: 'applied'
    })
  })

  it('does not retry non snapshot mutation tools', () => {
    expect(
      shouldRetryRemoteToolRefresh({
        toolName: 'canvas_update_document_status',
        targetDocumentId: 'doc-1',
        selectedDocumentId: 'doc-1',
        baselineSignature: 'sig-old',
        loadedSignature: 'sig-old',
        hasSnapshot: true,
        applyResult: applyResult('no_diff')
      })
    ).toEqual({
      retry: false,
      reason: 'not_snapshot_mutation'
    })
  })

  it('does not retry when the loaded snapshot signature changed even if no editor diff was needed', () => {
    expect(
      shouldRetryRemoteToolRefresh({
        toolName: 'canvas_patch_records',
        targetDocumentId: 'doc-1',
        selectedDocumentId: 'doc-1',
        baselineSignature: 'sig-old',
        loadedSignature: 'sig-new',
        hasSnapshot: true,
        applyResult: applyResult('no_diff')
      })
    ).toEqual({
      retry: false,
      reason: 'snapshot_changed'
    })
  })
})

function applyResult(reason: RemoteSnapshotApplyResult['reason']): RemoteSnapshotApplyResult {
  return {
    applied: reason === 'applied',
    reason,
    currentRecordCount: 1,
    nextRecordCount: 1,
    putCount: reason === 'applied' ? 1 : 0,
    removeCount: 0
  }
}
