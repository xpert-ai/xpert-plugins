import {
  stringifyAgentToolResult,
  summarizeDocumentMutationResult,
  summarizeDocumentSummaryResult,
  summarizeSearchResult
} from './canvas-agent-response.js'

describe('Canvas Agent response DTOs', () => {
  it('does not disclose snapshots, scene records, workspace paths, or image URLs', () => {
    const summary = summarizeDocumentSummaryResult({
      documentId: '643dacec-8f1a-4bcc-b759-e371efefb4c2',
      workingCopyRevision: 4,
      snapshotSummary: { recordCount: 900 },
      snapshot: { store: { secret: true } },
      scene: { shapes: Array.from({ length: 900 }, () => ({ id: 'shape:secret' })) },
      snapshotImagePath: 'files/canvas/private/current.png',
      snapshotImageUrl: 'https://internal.example/current.png'
    })
    const serialized = stringifyAgentToolResult(summary)

    expect(summary).not.toHaveProperty('snapshot')
    expect(summary).not.toHaveProperty('scene')
    expect(serialized).not.toContain('files/canvas')
    expect(serialized).not.toContain('internal.example')
  })

  it('projects mutation and search results into compact allowlisted receipts', () => {
    const mutation = summarizeDocumentMutationResult({
      document: {
        id: '643dacec-8f1a-4bcc-b759-e371efefb4c2',
        workingCopyRevision: 8,
        snapshotImagePath: 'files/canvas/private/current.png',
        autosaveSnapshot: { store: { private: true } }
      }
    }, 'Canvas updated.')
    const search = summarizeSearchResult({
      items: [{
        id: '643dacec-8f1a-4bcc-b759-e371efefb4c2',
        title: 'Canvas',
        snapshotImagePath: 'files/canvas/private/current.png',
        autosaveSnapshot: { store: { private: true } }
      }],
      total: 1
    })

    expect(mutation).toEqual(expect.objectContaining({
      documentId: '643dacec-8f1a-4bcc-b759-e371efefb4c2',
      workingCopyRevision: 8,
      hasSnapshotImage: true
    }))
    expect(mutation).not.toHaveProperty('snapshotImagePath')
    expect(search.items[0]).toEqual(expect.objectContaining({ hasSnapshotImage: true }))
    expect(search.items[0]).not.toHaveProperty('autosaveSnapshot')
  })
})
