export const CUT_ASSISTANT_CONTEXT_KEY = 'cut'

export type CutAssistantContextState = {
  projectId: string
  title: string
  status: string
  revision: number
  currentVersionNumber: number
  selectedClipId: string | null
  dirty: boolean
}

export type CutAssistantContextSetPayload = {
  key: typeof CUT_ASSISTANT_CONTEXT_KEY
  env: {
    cutProjectId: string
    cutRevision: string
    cutSelectedClipId: string
    cutDirty: 'true' | 'false'
  }
  context: {
    currentProject: {
      id: string
      title: string
      status: string
      revision: number
      currentVersionNumber: number
      selectedClipId: string | null
      dirty: boolean
    }
  }
}

export type CutAssistantContextClearPayload = {
  key: typeof CUT_ASSISTANT_CONTEXT_KEY
  clear: true
}

export function createCutAssistantContextSetPayload(
  input: CutAssistantContextState
): CutAssistantContextSetPayload {
  return {
    key: CUT_ASSISTANT_CONTEXT_KEY,
    env: {
      cutProjectId: input.projectId,
      cutRevision: String(input.revision),
      cutSelectedClipId: input.selectedClipId ?? '',
      cutDirty: input.dirty ? 'true' : 'false'
    },
    context: {
      currentProject: {
        id: input.projectId,
        title: input.title,
        status: input.status,
        revision: input.revision,
        currentVersionNumber: input.currentVersionNumber,
        selectedClipId: input.selectedClipId,
        dirty: input.dirty
      }
    }
  }
}

export function createCutAssistantContextClearPayload(): CutAssistantContextClearPayload {
  return { key: CUT_ASSISTANT_CONTEXT_KEY, clear: true }
}

export function assertCutAssistantContextSetSucceeded(value: unknown): void {
  if (isRecord(value) && value['success'] === true) return

  const message = isRecord(value) && typeof value['message'] === 'string'
    ? value['message'].trim()
    : ''
  throw new Error(message || 'The host rejected the Cut Assistant context update.')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
