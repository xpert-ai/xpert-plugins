import type { TCopilotModel } from '@xpert-ai/contracts'
import type { WorkspacePortableFileReference, WorkspaceRuntimeFileDescriptor } from '@xpert-ai/plugin-sdk'
import type { CutExportSettings } from './cut-export-settings.js'

export type CutProjectStatus = 'draft' | 'reviewed' | 'archived' | 'failed'
export type CutClipType = 'video' | 'image' | 'audio' | 'text' | 'color'
export type CutTrackKind = 'visual' | 'audio'
export type CutMediaFit = 'contain' | 'cover' | 'stretch'
export type CutProjectReframeMode = 'preserve' | CutMediaFit
export type CutOperationKind = 'split' | 'trim' | 'move'
export type CutActorType = 'agent' | 'user' | 'system'
export type CutAnalysisJobType = 'transcription' | 'media_analysis' | 'render'
export type CutAnalysisExecutionMode = 'local' | 'server' | 'import'
export type CutAnalysisJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export type CutTranscriptSource = 'stt' | 'subtitle_import'
export type CutMediaEvidenceType = 'transcript' | 'silence' | 'audio_activity' | 'shot' | 'keyframe' | 'visual_description' | 'ocr'
export type CutCaptionDraftStatus = 'draft' | 'committed' | 'rejected'
export type CutEditProposalStatus = 'draft' | 'applying' | 'applied' | 'reverting' | 'reverted' | 'rejected'
export type CutProposalRisk = 'low' | 'medium' | 'high'
export type CutActionType =
  | 'cut_project_created'
  | 'cut_project_saved'
  | 'cut_media_imported'
  | 'cut_edit_applied'
  | 'cut_edit_batch_applied'
  | 'cut_version_finalized'
  | 'cut_export_saved'
  | 'cut_failure_reported'
  | 'cut_subtitle_imported'
  | 'cut_transcription_started'
  | 'cut_transcription_completed'
  | 'cut_transcription_failed'
  | 'cut_local_transcription_imported'
  | 'cut_media_analysis_imported'
  | 'cut_edit_proposal_created'
  | 'cut_edit_proposal_updated'
  | 'cut_edit_proposal_applied'
  | 'cut_edit_proposal_reverted'
  | 'cut_edit_proposal_rejected'
  | 'cut_render_started'
  | 'cut_render_completed'
  | 'cut_render_failed'
  | 'cut_analysis_job_cancelled'
  | 'cut_caption_draft_created'
  | 'cut_caption_draft_updated'
  | 'cut_caption_draft_committed'
  | 'cut_subtitle_exported'

export type CutJsonPrimitive = string | number | boolean | null
export type CutJsonValue = CutJsonPrimitive | CutJsonObject | CutJsonArray
export interface CutJsonObject {
  [key: string]: CutJsonValue | undefined
}
export type CutJsonArray = CutJsonValue[]

export interface CutScope {
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export interface CutTranscriptionQueueJobData {
  jobId: string
  projectId: string
  mediaAssetId: string
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  platformProjectId?: string | null
  userId?: string | null
  assistantId?: string | null
  xpertId: string
  copilotModel: TCopilotModel
  fileReference: WorkspacePortableFileReference
  originalName: string
  mimeType: string
  duration?: number | null
  language: string
  inputRevision: number
  changeSummary: string
}

export interface CutRenderVariantInput {
  name: string
  width?: number
  height?: number
  variables?: Record<string, string>
  /** Replaces every clip using a source mediaAssetId with another imported project asset. */
  mediaAssetMap?: Record<string, string>
}

export interface StartCutHeadlessRenderInput {
  projectId: string
  baseRevision: number
  variants?: CutRenderVariantInput[]
  exportSettings?: Partial<CutExportSettings>
  idempotencyKey?: string
  changeSummary: string
}

export interface CutRenderQueueJobData {
  jobId: string
  projectId: string
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  platformProjectId?: string | null
  userId?: string | null
  assistantId?: string | null
}

export interface CutTransform {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
}

export interface CutVisualEffects {
  brightness: number
  contrast: number
  saturation: number
  blur: number
  grayscale: number
  sepia: number
}

export type CutBlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'

export interface CutMask {
  shape: 'none' | 'rectangle' | 'circle' | 'rounded'
  inset: number
  radius: number
}

export interface CutBookmark {
  id: string
  time: number
  label: string
}

export interface CutTimeRange {
  start: number
  end: number
}

export type CutTransitionKind = 'fade' | 'slide' | 'zoom'

export interface CutTransition {
  type: CutTransitionKind
  duration: number
}

export interface CutClip {
  id: string
  type: CutClipType
  name: string
  start: number
  duration: number
  trimIn: number
  trimOut: number
  mediaAssetId?: string
  source?: WorkspacePortableFileReference
  previewUrl?: string
  text?: string
  color?: string
  volume?: number
  audioDetached?: boolean
  playbackRate?: number
  fadeIn?: number
  fadeOut?: number
  fontSize?: number
  fontWeight?: number
  textAlign?: 'left' | 'center' | 'right'
  effects?: CutVisualEffects
  blendMode?: CutBlendMode
  mask?: CutMask
  transitionIn?: CutTransition
  transitionOut?: CutTransition
  mediaFit?: CutMediaFit
  transform?: CutTransform
}

export interface CutMediaMetadata {
  duration?: number | null
  containerDuration?: number | null
  videoDuration?: number | null
  audioDuration?: number | null
  codedWidth?: number | null
  codedHeight?: number | null
  displayWidth?: number | null
  displayHeight?: number | null
  rotationDegrees?: number | null
}

export interface CutTrack {
  id: string
  name: string
  kind: CutTrackKind
  muted: boolean
  hidden: boolean
  clips: CutClip[]
}

export interface CutProjectDocument {
  schemaVersion: 1
  settings: {
    width: number
    height: number
    fps: number
    durationSeconds: number
    background: string
  }
  tracks: CutTrack[]
  bookmarks?: CutBookmark[]
}

export type CutClipDraft = Omit<CutClip, 'id' | 'trimIn' | 'trimOut'> & {
  id?: string
  trimIn?: number
  trimOut?: number
}

export type CutTrackMutation =
  | { action: 'add'; track: { id?: string; name: string; kind: CutTrackKind; index?: number } }
  | { action: 'update'; trackId: string; name?: string; muted?: boolean; hidden?: boolean }
  | { action: 'delete'; trackId: string; deleteClips?: boolean }
  | { action: 'move'; trackId: string; index: number }

export type CutEditOperation =
  | { kind: 'split'; clipId: string; at: number }
  | { kind: 'trim'; clipId: string; edge: 'start' | 'end'; time: number }
  | { kind: 'move'; clipId: string; start: number; trackId?: string }
  | { kind: 'add_clip'; trackId: string; clip: CutClipDraft }
  | { kind: 'delete_clips'; clipIds: string[] }
  | { kind: 'duplicate_clips'; clipIds: string[]; offsetSeconds?: number; trackId?: string }
  | { kind: 'update_clip_timing'; clipId: string; start?: number; duration?: number; trimIn?: number; trimOut?: number; playbackRate?: number }
  | { kind: 'update_transform'; clipId: string; transform: Partial<CutTransform>; mediaFit?: CutMediaFit }
  | {
      kind: 'update_project_settings'
      settings: { width?: number; height?: number; fps?: number; background?: string }
      reframe: CutProjectReframeMode
    }
  | { kind: 'update_text'; clipId: string; text?: string; fontSize?: number; fontWeight?: number; textAlign?: CutClip['textAlign']; color?: string }
  | { kind: 'update_audio'; clipId: string; volume?: number; fadeIn?: number; fadeOut?: number }
  | { kind: 'update_effects'; clipId: string; effects?: Partial<CutVisualEffects> | null; blendMode?: CutBlendMode }
  | { kind: 'update_mask'; clipId: string; mask: CutMask | null }
  | { kind: 'update_transition'; clipId: string; edge: 'in' | 'out'; transition: CutTransition | null }
  | { kind: 'manage_track'; mutation: CutTrackMutation }
  | { kind: 'ripple_delete_ranges'; ranges: CutTimeRange[] }
  | {
      kind: 'add_cover'
      title: string
      subtitle?: string
      duration: number
      background: string
      color: string
    }

export interface CutProposalEvidence {
  segmentId: string
  mediaAssetId: string
  mediaName: string
  evidenceType: CutMediaEvidenceType
  start: number
  end: number
  label: string
  text?: string | null
  confidence?: number | null
  thumbnail?: { url: string; time: number } | null
  rationale?: string | null
}

export interface CutEditProposalItem {
  id: string
  enabled: boolean
  operation: CutEditOperation
  summary: string
  evidence: CutProposalEvidence[]
  confidence: number
  risk: CutProposalRisk
}

export interface CutProposalConstraints {
  targetDurationSeconds?: number
  preserveTopics?: string[]
  removeSilence?: boolean
  notes?: string
}

export interface CreateCutProjectInput {
  title: string
  brief?: string | null
  width?: number
  height?: number
  fps?: number
  durationSeconds?: number
  changeSummary?: string | null
}

export interface SearchCutProjectsInput {
  status?: CutProjectStatus
  search?: string
  page?: number
  pageSize?: number
}

export interface SaveCutProjectInput {
  projectId: string
  document: CutProjectDocument
  baseRevision: number
  changeSummary?: string | null
}

export interface ApplyCutEditInput {
  projectId: string
  operation: CutEditOperation
  baseRevision: number
  changeSummary?: string | null
}

export interface ApplyCutEditBatchInput {
  projectId: string
  operations: CutEditOperation[]
  baseRevision: number
  mode?: 'validate' | 'apply'
  changeSummary?: string | null
}

export interface ImportCutMediaInput {
  projectId: string
  file: string | WorkspaceRuntimeFileDescriptor | WorkspacePortableFileReference
  duration?: number
  baseRevision: number
  changeSummary?: string | null
}

export interface CutImportedMedia {
  id: string
  originalName: string
  mimeType: string
  size: number
  reference: WorkspacePortableFileReference
  previewUrl?: string
}

export interface CutTranscriptWord {
  start: number
  end: number
  text: string
  confidence?: number | null
}

export interface CutTranscriptSegmentData {
  id?: string
  sequence: number
  start: number
  end: number
  text: string
  confidence?: number | null
  speaker?: string | null
  words?: CutTranscriptWord[] | null
}

export interface CutMediaEvidenceSegmentData {
  id?: string
  mediaAssetId: string
  evidenceType: Exclude<CutMediaEvidenceType, 'transcript'>
  start: number
  end: number
  label: string
  text?: string | null
  confidence?: number | null
  thumbnailTime?: number | null
  metadata?: CutJsonValue | null
}

export interface CutCaptionItem {
  id: string
  start: number
  end: number
  text: string
  speaker?: string | null
}

export interface CutCaptionRules {
  maxCharsPerLine?: number
  maxLines?: number
  minDuration?: number
  maxDuration?: number
  targetTrackName?: string
}

export type CutCaptionDraftEditOperation =
  | { action: 'update'; captionId: string; start?: number; end?: number; text?: string; speaker?: string | null }
  | { action: 'split'; captionId: string; at: number; leftText: string; rightText: string }
  | { action: 'merge'; captionIds: string[]; text?: string }
  | { action: 'delete'; captionIds: string[] }
  | { action: 'offset'; seconds: number; captionIds?: string[] }
