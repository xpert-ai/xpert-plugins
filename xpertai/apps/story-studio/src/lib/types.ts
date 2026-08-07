export const STORY_PROJECT_STATUSES = [
  'draft',
  'planning',
  'production',
  'review',
  'completed',
  'failed',
  'archived'
] as const

export const STORY_PRODUCTION_FORMATS = [
  'vertical_short',
  'horizontal_short',
  'episodic_series',
  'feature',
  'custom'
] as const

export const STORY_ASPECT_RATIOS = ['9:16', '16:9', '1:1', '4:3', '3:4', 'custom'] as const

export type StoryProjectStatus = (typeof STORY_PROJECT_STATUSES)[number]
export type StoryProductionFormat = (typeof STORY_PRODUCTION_FORMATS)[number]
export type StoryAspectRatio = (typeof STORY_ASPECT_RATIOS)[number]
export type StoryActorType = 'agent' | 'user' | 'system'
export type StoryProjectAction =
  | 'project_created'
  | 'project_updated'
  | 'status_updated'
  | 'failure_reported'
  | 'production_saved'
  | 'generated_video_attached'
  | 'cut_handoff_prepared'
  | 'cut_handoff_delivered'
  | 'cut_handoff_failed'

export interface StoryScope {
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  hostProjectId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
  actorType?: StoryActorType
}

export interface CreateStoryProjectInput {
  operationId: string
  title: string
  description?: string
  premise?: string
  productionFormat?: StoryProductionFormat
  aspectRatio?: StoryAspectRatio
  targetDurationSeconds?: number
  tags?: string[]
  changeSummary: string
}

export interface SearchStoryProjectsInput {
  status?: StoryProjectStatus
  productionFormat?: StoryProductionFormat
  search?: string
  page?: number
  pageSize?: number
}

export interface GetStoryProjectSummaryInput {
  projectId: string
  expectedRevision?: number
}

export interface UpdateStoryProjectInput {
  projectId: string
  operationId: string
  baseRevision: number
  title?: string
  description?: string | null
  premise?: string | null
  productionFormat?: StoryProductionFormat
  aspectRatio?: StoryAspectRatio
  targetDurationSeconds?: number | null
  tags?: string[]
  changeSummary: string
}

export interface UpdateStoryProjectStatusInput {
  projectId: string
  operationId: string
  baseRevision: number
  status: StoryProjectStatus
  reason?: string
  changeSummary: string
}

export interface ReportStoryFailureInput {
  projectId: string
  operationId: string
  baseRevision: number
  failureCode: string
  errorMessage: string
  recoverable: boolean
  changeSummary: string
}

export interface StoryProjectSummary {
  id: string
  title: string
  description: string | null
  premise: string | null
  productionFormat: StoryProductionFormat
  aspectRatio: StoryAspectRatio
  targetDurationSeconds: number | null
  status: StoryProjectStatus
  revision: number
  preferredVideoGeneratorToolsetId: string | null
  preferredVideoGeneratorFamily: 'seedance' | 'veo' | 'kling' | null
  tags: string[]
  failureCode: string | null
  failureMessage: string | null
  failureRecoverable: boolean | null
  createdAt: string | null
  updatedAt: string | null
  counts: {
    sources: number
    events: number
    episodes: number
    assets: number
    shots: number
    candidates: number
  }
  availableReads: string[]
  nextAction: string
}

export interface StoryMutationReceipt {
  success: true
  duplicate: boolean
  operationId: string
  projectId: string
  previousRevision: number | null
  revision: number
  status: StoryProjectStatus
  changedFields: string[]
  nextAction: string
}

export interface StoryProjectMutationResult {
  project: StoryProjectSummary
  receipt: StoryMutationReceipt
}

export interface StoryProjectSearchResult {
  items: StoryProjectSummary[]
  total: number
  page: number
  pageSize: number
  search: string
}
