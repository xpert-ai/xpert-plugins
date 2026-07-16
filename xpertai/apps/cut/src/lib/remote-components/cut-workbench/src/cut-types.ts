export type ClipType = 'video' | 'image' | 'audio' | 'text' | 'color'
export type CutClip = {
  id: string
  type: ClipType
  name: string
  start: number
  duration: number
  trimIn: number
  trimOut: number
  mediaAssetId?: string
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
  effects?: { brightness: number; contrast: number; saturation: number; blur: number; grayscale: number; sepia: number }
  blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'
  mask?: { shape: 'none' | 'rectangle' | 'circle' | 'rounded'; inset: number; radius: number }
  transitionIn?: { type: 'fade' | 'slide' | 'zoom'; duration: number }
  transitionOut?: { type: 'fade' | 'slide' | 'zoom'; duration: number }
  mediaFit?: 'contain' | 'cover' | 'stretch'
  transform?: { x: number; y: number; width: number; height: number; rotation: number; opacity: number }
}
export type CutTrack = { id: string; name: string; kind: 'visual' | 'audio'; muted: boolean; hidden: boolean; clips: CutClip[] }
export type CutDocument = {
  schemaVersion: 1
  settings: { width: number; height: number; fps: number; durationSeconds: number; background: string }
  tracks: CutTrack[]
  bookmarks?: Array<{ id: string; time: number; label: string }>
}
export type ProjectSummary = {
  id?: string
  title: string
  brief?: string | null
  status: string
  revision: number
  currentVersionNumber: number
}
export type MediaSummary = {
  id?: string
  originalName: string
  mimeType: string
  size: number
  previewUrl?: string | null
  duration?: number | null
  codedWidth?: number | null
  codedHeight?: number | null
  displayWidth?: number | null
  displayHeight?: number | null
  rotationDegrees?: number | null
}
export type ProjectDetail = {
  item: ProjectSummary
  document: CutDocument
  media: MediaSummary[]
  versions: Array<{ id?: string; versionNumber: number; revision: number; changeSummary: string }>
  exports: Array<{ id?: string; kind: string; mimeType: string; size: number; fileUrl?: string | null; changeSummary: string; analysisJobId?: string | null; sourceRevision?: number | null; renderer?: string | null }>
  logs: Array<{ id?: string; action: string; message: string; errorMessage?: string | null }>
}
export type CaptionDraftSummary = {
  id?: string
  projectId: string
  transcriptId: string
  sourceRevision: number
  status: 'draft' | 'committed' | 'rejected'
  revision: number
  language: string
  targetTrackId?: string | null
  captionCount: number
  committedRevision?: number | null
}
export type CaptionCue = { id: string; start: number; end: number; text: string; speaker?: string | null }
export type CaptionDraftPage = {
  item: CaptionDraftSummary
  captions: CaptionCue[]
  total: number
  page: number
  pageSize: number
}
export type AnalysisJobSummary = {
  id?: string
  projectId: string
  type: string
  executionMode: 'local' | 'server' | 'import'
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  progress: number
  mediaAssetId?: string | null
  language?: string | null
  model?: string | null
  resultTranscriptId?: string | null
  resultExportId?: string | null
  sandboxJobId?: string | null
  stage?: string | null
  variantName?: string | null
  failureCode?: string | null
  errorMessage?: string | null
  cancellationRequested?: boolean
}
export type MediaEvidenceSummary = {
  id: string
  projectId: string
  mediaAssetId: string
  mediaName: string
  evidenceType: 'transcript' | 'silence' | 'audio_activity' | 'shot' | 'keyframe' | 'visual_description' | 'ocr'
  start: number
  end: number
  label: string
  text?: string | null
  confidence?: number | null
  relevance: number
  inputRevision: number
  thumbnail?: { url: string; time: number } | null
}
export type EditProposalSummary = {
  id?: string
  projectId: string
  sourceRevision: number
  status: 'draft' | 'applying' | 'applied' | 'reverting' | 'reverted' | 'rejected'
  revision: number
  goal: string
  itemCount: number
  enabledItemCount: number
  highRiskCount: number
  estimatedDurationSeconds: number
  appliedRevision?: number | null
  revertedRevision?: number | null
}
export type EditProposalEvidence = {
  segmentId: string
  mediaAssetId: string
  mediaName: string
  evidenceType: MediaEvidenceSummary['evidenceType']
  start: number
  end: number
  label: string
  text?: string | null
  confidence?: number | null
  thumbnail?: { url: string; time: number } | null
}
export type EditProposalItem = {
  id: string
  enabled: boolean
  operation: { kind: string; [key: string]: unknown }
  summary: string
  evidence: EditProposalEvidence[]
  confidence: number
  risk: 'low' | 'medium' | 'high'
}
export type EditProposalReview = {
  item: EditProposalSummary & {
    constraints?: { targetDurationSeconds?: number; preserveTopics?: string[]; removeSilence?: boolean; notes?: string } | null
    items: EditProposalItem[]
    reviewNote?: string | null
  }
  preview: {
    changedClipIds: string[]
    changedTrackIds: string[]
    estimatedDurationSeconds: number
    enabledItemCount: number
    document?: CutDocument
  }
}
export type CutViewData = {
  projects: { items: ProjectSummary[]; total: number; page: number; pageSize: number }
  detail: ProjectDetail | null
  captionDrafts: CaptionDraftSummary[]
  analysisJobs: AnalysisJobSummary[]
  mediaSegments: MediaEvidenceSummary[]
  editProposals: EditProposalSummary[]
  renderCapability: {
    available: boolean
    backend: 'sandbox-job'
    reason?: string
    message?: string
    action?: string
    actionVersion?: string
    runtimeProfile?: string | null
    workerCount?: number
    limits: { maxVariants: number; maxDurationSeconds: number; maxFrames: number; maxWidth: number; maxHeight: number; maxFps: number; maxMediaBytes: number }
  }
}
