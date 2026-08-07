import { isRemoteObject, type RemoteObject, type RemoteValue } from './runtime'

export type VideoGeneratorFamily = 'seedance' | 'veo' | 'kling'
export type VideoTaskStatus =
  | 'queued'
  | 'submitting'
  | 'generating'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'stale'
  | 'submission_unknown'

export type VideoGeneratorOption = {
  id: string
  family: VideoGeneratorFamily
  displayName: string
  available: boolean
  unavailableReason: string | null
  models: Array<{ id: string; label: string }>
  defaultModel: string
  resolutions: string[]
  aspectRatios: string[]
  durationSeconds: { min: number; max: number; default: number }
  supportsAudio: boolean
  supportsCancel: boolean
}

export type VideoGeneratorCatalog = {
  selectedToolsetId: string | null
  generators: VideoGeneratorOption[]
}

export type VideoGenerationTask = {
  id: string
  projectId: string
  sceneId: string
  shotId: string
  requestGroupId: string
  takeIndex: number
  generatorFamily: VideoGeneratorFamily
  generatorName: string
  status: VideoTaskStatus
  stage: string
  progress: number
  resultCandidateId: string | null
  failureCode: string | null
  failureMessage: string | null
  recoverable: boolean
  upstreamMayContinue: boolean
  createdAt: string | null
  updatedAt: string | null
  continuityStatus?: 'not_required' | 'waiting_source' | 'preparing' | 'ready' | 'prompt_only' | 'stale' | 'failed' | null
  continuityStrength?: 'none' | 'prompt_only' | 'first_frame' | null
  continuityFromShotId?: string | null
  continuityRisks?: string[]
}

export function parseVideoGeneratorCatalog(payload: RemoteObject): VideoGeneratorCatalog | null {
  const value = isRemoteObject(payload.videoGenerators) ? payload.videoGenerators : null
  if (!value || !Array.isArray(value.generators)) return null
  return {
    selectedToolsetId: readNullableString(value, 'selectedToolsetId'),
    generators: value.generators.map(parseGenerator).filter((item): item is VideoGeneratorOption => Boolean(item))
  }
}

export function parseVideoTasks(payload: RemoteObject): VideoGenerationTask[] {
  const value = isRemoteObject(payload.videoTasks) ? payload.videoTasks : null
  return parseVideoTaskList(value)
}

export function parseVideoTaskList(value: RemoteValue): VideoGenerationTask[] {
  if (!isRemoteObject(value) || !Array.isArray(value.items)) return []
  return value.items.map(parseTask).filter((item): item is VideoGenerationTask => Boolean(item))
}

function parseGenerator(value: RemoteValue): VideoGeneratorOption | null {
  if (!isRemoteObject(value)) return null
  const id = readString(value, 'id')
  const family = readFamily(value.family)
  const displayName = readString(value, 'displayName')
  if (!id || !family || !displayName) return null
  const duration = isRemoteObject(value.durationSeconds) ? value.durationSeconds : {}
  return {
    id,
    family,
    displayName,
    available: value.available === true,
    unavailableReason: readNullableString(value, 'unavailableReason'),
    models: Array.isArray(value.models)
      ? value.models.flatMap((model) => {
          if (!isRemoteObject(model)) return []
          const modelId = readString(model, 'id')
          const label = readString(model, 'label')
          return modelId && label ? [{ id: modelId, label }] : []
        })
      : [],
    defaultModel: readString(value, 'defaultModel') ?? '',
    resolutions: readStringArray(value, 'resolutions'),
    aspectRatios: readStringArray(value, 'aspectRatios'),
    durationSeconds: {
      min: readNumber(duration, 'min') ?? 0,
      max: readNumber(duration, 'max') ?? 0,
      default: readNumber(duration, 'default') ?? 0
    },
    supportsAudio: value.supportsAudio === true,
    supportsCancel: value.supportsCancel === true
  }
}

function parseTask(value: RemoteValue): VideoGenerationTask | null {
  if (!isRemoteObject(value)) return null
  const id = readString(value, 'id')
  const projectId = readString(value, 'projectId')
  const sceneId = readString(value, 'sceneId')
  const shotId = readString(value, 'shotId')
  const requestGroupId = readString(value, 'requestGroupId')
  const generatorFamily = readFamily(value.generatorFamily)
  const status = readStatus(value.status)
  if (!id || !projectId || !sceneId || !shotId || !requestGroupId || !generatorFamily || !status) return null
  return {
    id,
    projectId,
    sceneId,
    shotId,
    requestGroupId,
    takeIndex: readNumber(value, 'takeIndex') ?? 1,
    generatorFamily,
    generatorName: readString(value, 'generatorName') ?? generatorFamily,
    status,
    stage: readString(value, 'stage') ?? status,
    progress: readNumber(value, 'progress') ?? 0,
    resultCandidateId: readNullableString(value, 'resultCandidateId'),
    failureCode: readNullableString(value, 'failureCode'),
    failureMessage: readNullableString(value, 'failureMessage'),
    recoverable: value.recoverable === true,
    upstreamMayContinue: value.upstreamMayContinue === true,
    createdAt: readNullableString(value, 'createdAt'),
    updatedAt: readNullableString(value, 'updatedAt'),
    continuityStatus: readContinuityStatus(value.continuityStatus),
    continuityStrength: value.continuityStrength === 'none' || value.continuityStrength === 'prompt_only' || value.continuityStrength === 'first_frame' ? value.continuityStrength : null,
    continuityFromShotId: readNullableString(value, 'continuityFromShotId'),
    continuityRisks: readStringArray(value, 'continuityRisks')
  }
}

function readContinuityStatus(value: RemoteValue): VideoGenerationTask['continuityStatus'] {
  return value === 'not_required' || value === 'waiting_source' || value === 'preparing' || value === 'ready' || value === 'prompt_only' || value === 'stale' || value === 'failed' ? value : null
}

export function isActiveVideoTask(task: VideoGenerationTask) {
  return ['queued', 'submitting', 'generating', 'finalizing'].includes(task.status)
}

export function hasUnhydratedCompletedVideoTask(
  tasks: VideoGenerationTask[],
  hydratedCandidateIds: ReadonlySet<string>
) {
  return tasks.some((task) => {
    const candidateId = task.resultCandidateId
    return task.status === 'completed' &&
      candidateId !== null &&
      !hydratedCandidateIds.has(candidateId)
  })
}

function readFamily(value: RemoteValue): VideoGeneratorFamily | null {
  return value === 'seedance' || value === 'veo' || value === 'kling' ? value : null
}

function readStatus(value: RemoteValue): VideoTaskStatus | null {
  switch (value) {
    case 'queued':
    case 'submitting':
    case 'generating':
    case 'finalizing':
    case 'completed':
    case 'failed':
    case 'cancelled':
    case 'stale':
    case 'submission_unknown':
      return value
    default:
      return null
  }
}

function readString(record: RemoteObject, key: string) {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNullableString(record: RemoteObject, key: string) {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(record: RemoteObject, key: string) {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readStringArray(record: RemoteObject, key: string) {
  const value = record[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}
