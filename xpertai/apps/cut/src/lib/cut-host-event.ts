import { CUT_MIDDLEWARE_TOOL_NAMES } from './constants.js'

const toolNames = new Set<string>(CUT_MIDDLEWARE_TOOL_NAMES)

export type CutHostEventResult = {
  matches: boolean
  toolName?: string
  projectId?: string
  revision?: number
  changedClipIds?: string[]
  changedTrackIds?: string[]
  jobId?: string
  proposalId?: string
  transcriptId?: string
  draftId?: string
  trackId?: string
}

export function parseCutHostEvent(value: object | null | undefined): CutHostEventResult {
  if (!value) return { matches: false }
  const queue: object[] = [value]
  const visited = new Set<object>()
  let toolName: string | undefined
  let projectId: string | undefined
  let revision: number | undefined
  let changedClipIds: string[] | undefined
  let changedTrackIds: string[] | undefined
  let jobId: string | undefined
  let proposalId: string | undefined
  let transcriptId: string | undefined
  let draftId: string | undefined
  let trackId: string | undefined
  while (queue.length) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    for (const key of ['toolName', 'tool', 'name']) {
      const candidate = readProperty(current, key)
      if (typeof candidate === 'string' && toolNames.has(candidate)) toolName ??= candidate
    }
    const currentProjectId = readProperty(current, 'projectId')
    const currentRevision = readProperty(current, 'revision')
    const currentChangedClipIds = readProperty(current, 'changedClipIds')
    const currentChangedTrackIds = readProperty(current, 'changedTrackIds')
    const currentJobId = readProperty(current, 'jobId')
    const currentProposalId = readProperty(current, 'proposalId')
    const currentTranscriptId = readProperty(current, 'transcriptId')
    const currentDraftId = readProperty(current, 'draftId')
    const currentTrackId = readProperty(current, 'trackId')
    if (typeof currentProjectId === 'string' && currentProjectId) projectId ??= currentProjectId
    if (typeof currentRevision === 'number' && Number.isInteger(currentRevision)) revision ??= currentRevision
    if (Array.isArray(currentChangedClipIds)) {
      const ids = currentChangedClipIds.filter((item): item is string => typeof item === 'string').slice(0, 200)
      if (ids.length) changedClipIds ??= ids
    }
    if (Array.isArray(currentChangedTrackIds)) {
      const ids = currentChangedTrackIds.filter((item): item is string => typeof item === 'string').slice(0, 128)
      if (ids.length) changedTrackIds ??= ids
    }
    if (typeof currentJobId === 'string' && currentJobId) jobId ??= currentJobId
    if (typeof currentProposalId === 'string' && currentProposalId) proposalId ??= currentProposalId
    if (typeof currentTranscriptId === 'string' && currentTranscriptId) transcriptId ??= currentTranscriptId
    if (typeof currentDraftId === 'string' && currentDraftId) draftId ??= currentDraftId
    if (typeof currentTrackId === 'string' && currentTrackId) trackId ??= currentTrackId
    for (const key of ['event', 'payload', 'data', 'input', 'result', 'output', 'detail', 'message']) {
      const nested = readProperty(current, key)
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) queue.push(nested)
      else if (typeof nested === 'string') {
        const parsed = parseObject(nested)
        if (parsed) queue.push(parsed)
      }
    }
  }
  return toolName
    ? {
        matches: true,
        toolName,
        projectId,
        revision,
        changedClipIds,
        changedTrackIds,
        jobId,
        proposalId,
        transcriptId,
        draftId,
        trackId
      }
    : { matches: false }
}

function readProperty(value: object, key: string) {
  return key in value ? (value as Record<string, string | number | boolean | object | null | undefined>)[key] : undefined
}

function parseObject(value: string) {
  if (!value.trim().startsWith('{')) return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}
