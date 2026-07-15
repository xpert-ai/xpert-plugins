export type ArtifactShareCollaboration = {
  syncAndWaitForAck(afterSequence: number, timeoutMs?: number): Promise<number>
}

export async function synchronizeArtifactShareState(input: {
  documentId?: string | null
  dirty: boolean
  autosaving: boolean
  graphTextEdited: boolean
  collaborationState: string
  afterSequence: number
  collaboration?: ArtifactShareCollaboration | null
  cancelAutosave(): void
  persistWorkingCopy(documentId: string): Promise<unknown>
  syncRequiredMessage: string
  syncTimeoutMessage: string
  timeoutMs?: number
}) {
  if (!input.documentId || (!input.dirty && !input.autosaving)) return
  input.cancelAutosave()
  if (input.graphTextEdited) {
    await input.persistWorkingCopy(input.documentId)
    return
  }
  if (!input.collaboration || input.collaborationState !== 'connected') {
    throw new Error(input.syncRequiredMessage)
  }
  try {
    await input.collaboration.syncAndWaitForAck(input.afterSequence, input.timeoutMs ?? 10_000)
  } catch {
    throw new Error(input.syncTimeoutMessage)
  }
}
