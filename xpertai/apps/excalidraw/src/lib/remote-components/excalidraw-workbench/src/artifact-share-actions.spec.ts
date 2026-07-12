import {
  copyArtifactShareText,
  decideArtifactPublishSync,
  isArtifactShareSelectionCurrent
} from './artifact-share-actions.js'

describe('Artifact share Workbench actions', () => {
  it('copies with the Clipboard API without invoking the fallback', async () => {
    const writeClipboard = jest.fn(async () => undefined)
    const fallbackCopy = jest.fn(() => true)

    await expect(copyArtifactShareText('https://example.test/share', { writeClipboard, fallbackCopy }))
      .resolves.toBe('clipboard')
    expect(writeClipboard).toHaveBeenCalledWith('https://example.test/share')
    expect(fallbackCopy).not.toHaveBeenCalled()
  })

  it('falls back after Clipboard API denial and reports total failure', async () => {
    const writeClipboard = jest.fn(async () => { throw new Error('denied') })
    const fallbackCopy = jest.fn(() => true)

    await expect(copyArtifactShareText('https://example.test/share', { writeClipboard, fallbackCopy }))
      .resolves.toBe('fallback')
    expect(fallbackCopy).toHaveBeenCalledWith('https://example.test/share')

    await expect(copyArtifactShareText('https://example.test/share', {
      writeClipboard,
      fallbackCopy: () => false
    })).rejects.toThrow(/could not be copied/i)
  })

  it('requires synchronization only for dirty connected collaboration state', () => {
    expect(decideArtifactPublishSync({ dirty: true, hasCollaborationClient: false, collaborationConnected: false }))
      .toEqual({ allowed: false, shouldSynchronize: false, reason: 'unsynchronized_changes' })
    expect(decideArtifactPublishSync({ dirty: false, hasCollaborationClient: false, collaborationConnected: false }))
      .toEqual({ allowed: true, shouldSynchronize: false })
    expect(decideArtifactPublishSync({ dirty: true, hasCollaborationClient: true, collaborationConnected: true }))
      .toEqual({ allowed: true, shouldSynchronize: true })
  })

  it('treats only the same published revision and policy as directly copyable', () => {
    const share = { shareUrl: 'https://example.test/share', accessMode: 'public_link', versionMode: 'latest', revision: 4 }
    expect(isArtifactShareSelectionCurrent(share, { accessMode: 'public_link', versionMode: 'latest', revision: 4 })).toBe(true)
    expect(isArtifactShareSelectionCurrent(share, { accessMode: 'public_link', versionMode: 'latest', revision: 5 })).toBe(false)
    expect(isArtifactShareSelectionCurrent(share, { accessMode: 'organization_all', versionMode: 'latest', revision: 4 })).toBe(false)
  })
})
