import type { WorkspacePortableFileReference } from '@xpert-ai/plugin-sdk'
import type { StoryVideoGeneratorFamily } from './story-video-generation.platform.js'
import type { StoryVideoGenerationReference } from './story-video-generation.platform.js'
import type {
  StoryShotContinuityState,
  StoryShotTransition
} from './production-types.js'

export type StoryContinuityPreparationStatus =
  | 'not_required'
  | 'waiting_source'
  | 'preparing'
  | 'ready'
  | 'prompt_only'
  | 'stale'
  | 'failed'

export interface StoryVideoGenerationContinuitySnapshot {
  transition: StoryShotTransition
  fromSceneId?: string
  fromShotId?: string
  fromShotTitle?: string
  sourceCandidateId?: string
  sourceVideo?: WorkspacePortableFileReference
  sourceVideoSize?: number
  sourceVideoSha256?: string
  sourceState?: StoryShotContinuityState
  targetState?: StoryShotContinuityState
  sourceFrame?: WorkspacePortableFileReference
  strength: 'none' | 'prompt_only' | 'first_frame'
  status: StoryContinuityPreparationStatus
  risks?: string[]
}

export const STORY_VIDEO_GENERATION_STATUSES = [
  'queued',
  'submitting',
  'generating',
  'finalizing',
  'completed',
  'failed',
  'cancelled',
  'stale',
  'submission_unknown'
] as const

export type StoryVideoGenerationStatus =
  (typeof STORY_VIDEO_GENERATION_STATUSES)[number]

export const STORY_ACTIVE_VIDEO_GENERATION_STATUSES = new Set<StoryVideoGenerationStatus>([
  'queued',
  'submitting',
  'generating',
  'finalizing'
])

export interface StoryVideoGenerationRequestSnapshot {
  prompt: string
  userPrompt?: string
  model: string
  resolution: string
  aspectRatio: string
  fps: number
  durationSeconds: number
  generateAudio: boolean
  redoScope?: 'performance' | 'camera' | 'lighting' | null
  referenceAssetIds?: string[]
  referenceImageCandidateIds?: string[]
  referenceImages?: WorkspacePortableFileReference[]
  references?: StoryVideoGenerationReference[]
  continuity?: StoryVideoGenerationContinuitySnapshot
  /** Compatibility with tasks created before the multi-reference protocol. */
  inputImage?: WorkspacePortableFileReference | null
}

export interface GenerateStoryShotTakesInput {
  projectId: string
  operationId: string
  sceneId: string
  shotId: string
  toolsetId: string
  takeCount: number
  prompt: string
  model: string
  resolution: string
  aspectRatio: string
  fps: number
  durationSeconds: number
  referenceAssetIds?: string[]
  generateAudio?: boolean
  redoScope?: 'performance' | 'camera' | 'lighting'
}

export interface SetStoryVideoGeneratorInput {
  projectId: string
  toolsetId: string
}

export interface ListStoryVideoTasksInput {
  projectId: string
  sceneId?: string
  shotId?: string
  statuses?: StoryVideoGenerationStatus[]
  page?: number
  pageSize?: number
}

export interface GetStoryVideoTaskInput {
  projectId: string
  taskId: string
}

export interface ManageStoryVideoTaskInput extends GetStoryVideoTaskInput {
  operationId: string
  changeSummary: string
}

export interface SelectStoryShotVideoInput {
  projectId: string
  sceneId: string
  shotId: string
  candidateId: string
  operationId: string
  changeSummary: string
}

export interface StoryVideoTaskSummary {
  id: string
  projectId: string
  sceneId: string
  shotId: string
  requestGroupId: string
  takeIndex: number
  generatorFamily: StoryVideoGeneratorFamily
  generatorName: string
  status: StoryVideoGenerationStatus
  stage: string
  progress: number
  providerStatus?: string | null
  resultCandidateId?: string | null
  failureCode?: string | null
  failureMessage?: string | null
  recoverable: boolean
  upstreamMayContinue: boolean
  createdAt: string | null
  updatedAt: string | null
  completedAt?: string | null
  continuityStatus?: StoryContinuityPreparationStatus | null
  continuityStrength?: 'none' | 'prompt_only' | 'first_frame' | null
  continuityFromShotId?: string | null
  continuityRisks?: string[]
}
