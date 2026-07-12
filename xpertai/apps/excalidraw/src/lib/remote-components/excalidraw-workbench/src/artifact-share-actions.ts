export type ArtifactShareIdentity = {
  shareUrl?: string
  accessMode?: string
  versionMode?: string
  revision?: number
} | null | undefined

export type ArtifactShareSelection = {
  accessMode: string
  versionMode: string
  revision?: number
}

export type ArtifactPublishSyncDecision = {
  allowed: boolean
  shouldSynchronize: boolean
  reason?: 'unsynchronized_changes'
}

export function isArtifactShareSelectionCurrent(
  share: ArtifactShareIdentity,
  selection: ArtifactShareSelection
) {
  return Boolean(
    share?.shareUrl &&
    share.accessMode === selection.accessMode &&
    share.versionMode === selection.versionMode &&
    share.revision === selection.revision
  )
}

export function decideArtifactPublishSync(input: {
  dirty: boolean
  hasCollaborationClient: boolean
  collaborationConnected: boolean
}): ArtifactPublishSyncDecision {
  const canSynchronize = input.hasCollaborationClient && input.collaborationConnected
  if (input.dirty && !canSynchronize) {
    return { allowed: false, shouldSynchronize: false, reason: 'unsynchronized_changes' }
  }
  return { allowed: true, shouldSynchronize: canSynchronize }
}

export async function copyArtifactShareText(
  value: string,
  options: {
    writeClipboard?: (value: string) => Promise<void>
    fallbackCopy: (value: string) => boolean
  }
) {
  if (options.writeClipboard) {
    try {
      await options.writeClipboard(value)
      return 'clipboard' as const
    } catch {
      // Sandboxed Workbench iframes may deny the Clipboard API.
    }
  }
  if (options.fallbackCopy(value)) return 'fallback' as const
  throw new Error('The share link could not be copied automatically.')
}
