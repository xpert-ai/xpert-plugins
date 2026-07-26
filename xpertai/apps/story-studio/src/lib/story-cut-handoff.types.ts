import type { StoryAspectRatio, StoryScope } from './types.js'

export const STORY_CUT_HANDOFF_CONTRACT_VERSION = '1.0' as const
export const STORY_CUT_HANDOFF_STATUSES = [
  'ready',
  'delivered',
  'proposal_ready',
  'failed'
] as const

export type StoryCutHandoffStatus =
  (typeof STORY_CUT_HANDOFF_STATUSES)[number]
export type StoryCutHandoffMode = 'create' | 'proposal'

export interface StoryCutHandoffFile {
  workspacePath: string
  originalName: string
  mimeType: 'video/mp4'
  size: number
  sha256: string
}

export interface StoryCutHandoffShot {
  sceneId: string
  shotId: string
  title: string
  startSeconds: number
  durationSeconds: number
  camera: string
  action: string
  dialogue: string | null
  file: StoryCutHandoffFile
}

export interface StoryCutHandoffContract {
  contractVersion: typeof STORY_CUT_HANDOFF_CONTRACT_VERSION
  handoffId: string
  source: {
    projectId: string
    revision: number
    title: string
    brief: string
    visualStyle: string
  }
  sequence: {
    aspectRatio: StoryAspectRatio
    width: number
    height: number
    fps: 24 | 30
    durationSeconds: number
  }
  target: {
    mode: StoryCutHandoffMode
    cutProjectId: string | null
  }
  shots: StoryCutHandoffShot[]
}

export interface PrepareStoryCutHandoffInput {
  projectId: string
  operationId: string
  expectedRevision: number
  fps?: 24 | 30
  changeSummary: string
}

export interface GetStoryCutHandoffInput {
  projectId: string
  handoffId?: string
}

export interface RecordStoryCutHandoffDeliveryInput {
  projectId: string
  handoffId: string
  operationId: string
  baseHandoffRevision: number
  status: 'delivered' | 'proposal_ready' | 'failed'
  cutProjectId?: string
  cutProjectRevision?: number
  cutProposalId?: string
  failureCode?: string
  failureMessage?: string
  changeSummary: string
}

export interface StoryCutHandoffSummary {
  id: string
  projectId: string
  contractVersion: typeof STORY_CUT_HANDOFF_CONTRACT_VERSION
  sourceRevision: number
  handoffRevision: number
  mode: StoryCutHandoffMode
  status: StoryCutHandoffStatus
  checksum: string
  cutProjectId: string | null
  cutProjectRevision: number | null
  cutProposalId: string | null
  shotCount: number
  durationSeconds: number
  width: number
  height: number
  fps: number
  changeSummary: string
  failureCode: string | null
  failureMessage: string | null
  createdAt: string | null
  updatedAt: string | null
  deliveredAt: string | null
}

export interface StoryCutHandoffResult {
  success: true
  duplicate: boolean
  handoff: StoryCutHandoffSummary
}

export interface StoryCutHandoffDetail extends StoryCutHandoffResult {
  contract: StoryCutHandoffContract
}

export type StoryCutHandoffScope = StoryScope
