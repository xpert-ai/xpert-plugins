import { synchronizeArtifactShareState } from './artifact-share.js'

describe('synchronizeArtifactShareState', () => {
  const base = () => ({
    documentId: 'document-1',
    dirty: true,
    autosaving: true,
    graphTextEdited: false,
    collaborationState: 'connected',
    afterSequence: 12,
    collaboration: { syncAndWaitForAck: jest.fn(async () => 13) },
    cancelAutosave: jest.fn(),
    persistWorkingCopy: jest.fn(async () => undefined),
    syncRequiredMessage: 'Reconnect before sharing.',
    syncTimeoutMessage: 'Sync timed out.'
  })

  it('flushes dirty Yjs state and waits for a server acknowledgement', async () => {
    const input = base()
    await synchronizeArtifactShareState(input)
    expect(input.cancelAutosave).toHaveBeenCalledTimes(1)
    expect(input.collaboration.syncAndWaitForAck).toHaveBeenCalledWith(12, 10_000)
  })

  it('blocks sharing while collaboration is disconnected', async () => {
    const input = { ...base(), collaborationState: 'disconnected' }
    await expect(synchronizeArtifactShareState(input)).rejects.toThrow('Reconnect before sharing.')
    expect(input.collaboration.syncAndWaitForAck).not.toHaveBeenCalled()
  })

  it('reports an acknowledgement timeout without publishing stale content', async () => {
    const input = base()
    input.collaboration.syncAndWaitForAck.mockRejectedValueOnce(new Error('transport timeout'))
    await expect(synchronizeArtifactShareState(input)).rejects.toThrow('Sync timed out.')
  })

  it('persists JSON graph edits before sharing', async () => {
    const input = { ...base(), graphTextEdited: true, collaborationState: 'disconnected' }
    await synchronizeArtifactShareState(input)
    expect(input.persistWorkingCopy).toHaveBeenCalledWith('document-1')
    expect(input.collaboration.syncAndWaitForAck).not.toHaveBeenCalled()
  })
})
