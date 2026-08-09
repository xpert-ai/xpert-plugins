import type { BUILD_STAGES, NEXT_DECISIONS } from '../constants.js'

export type BuildStage = (typeof BUILD_STAGES)[number]
export type NextDecision = (typeof NEXT_DECISIONS)[number]
export type ModelRoute = 'object' | 'character'
export type ModelingMode = 'semantic-3d' | 'relief'
export type HumanReviewStatus = 'pending' | 'approved' | 'changes_requested' | 'rejected'
export type ProjectStatus =
  | 'draft'
  | 'awaiting_images'
  | 'awaiting_spec'
  | 'spec_ready'
  | 'queued'
  | 'building'
  | 'review_required'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type Scope = {
  tenantId: string
  organizationId: string | null
  userId: string
  workspaceId: string | null
  projectId: string | null
  xpertId: string | null
}

export type WorkspaceAssetReference = {
  source: 'platform.workspace.files'
  catalog: 'projects' | 'xperts'
  scopeId: string
  tenantId: string
  userId: string
  projectId?: string
  xpertId?: string
  isolateByUser: false
  filePath: string
  workspacePath: string
  name: string
  mimeType: string
  size: number
  sha256: string
}

export type StageGateResult = {
  stage: BuildStage
  status: 'passed' | 'failed' | 'blocked'
  score: number
  checks: Array<{ code: string; passed: boolean; detail: string }>
  completedAt: string
}

export type DeterministicReview = {
  status: 'passed' | 'failed' | 'not_run'
  score: number
  checks: Array<{ code: string; passed: boolean; detail: string }>
  codeSha256?: string
  authorship?: 'deterministic-generator' | 'assistant-authored' | 'assistant-refined'
  changeSummary?: string
}

export type VisualReview = {
  status: 'pending_human' | 'approved' | 'changes_requested' | 'unavailable'
  evidenceKind: 'deterministic_projection' | 'browser_render' | 'none'
  renderStatus?: 'not_requested' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'unavailable'
  comparisonAsset?: WorkspaceAssetReference
  modelAsset?: WorkspaceAssetReference
  capabilityReason?: string
  notes?: string
}

export type CapabilityAvailability = {
  available: boolean
  code: 'available' | 'runtime_unavailable' | 'action_unavailable' | 'worker_unavailable'
  reason?: string
  action?: string
  actionVersion?: string
  runtimeProfile?: string | null
  workerCount?: number
}

export type BrowserRenderReport = {
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'unavailable'
  action: 'img2threejs.review-render'
  actionVersion: '1.0.0'
  runtimeProfile?: string | null
  sandboxRuntimeVersion?: string | null
  attempt?: number
  comparisonArtifactId?: string
  comparisonArtifactVersionId?: string
  modelArtifactId?: string
  modelArtifactVersionId?: string
  outputs?: Array<{
    path: string
    name: string
    mimeType: string
    size: number
    sha256: string
    filePath?: string
  }>
  quality?: {
    triangles: number
    drawCalls: number
    runtimeMeshCount?: number
    minimumRuntimeMeshCount?: number
    maximumTriangles: number
    maximumDrawCalls: number
    minimumVisiblePixelRatio?: number
    minimumSilhouetteFillRatio?: number
    visiblePixelRatio?: number
    silhouetteFillRatio?: number
    views?: Array<{
      view: string
      visiblePixelRatio: number
      silhouetteFillRatio: number
      silhouetteWidthRatio?: number
      silhouetteHeightRatio?: number
    }>
    referenceAlignment?: {
      evidenceId: string
      view: string
      maskConfidence: number
      silhouetteIoU: number
      scaleScore: number
      edgeScore: number
      perceptualScore: number
      hardGateEligible: boolean
      passed: boolean
    }
    featureResults?: Array<{
      id: string
      label: string
      criticality: 'critical' | 'important'
      metric: 'silhouette' | 'edge' | 'color' | 'luminance'
      score: number
      threshold: number
      passed: boolean
    }>
    multiAngle?: {
      minimumSilhouetteRetention: number
      minimumVolumeAxisRatio: number
      silhouetteRetention: number
      volumeAxisRatio: number
      degenerateView: boolean
      passed: boolean
    }
    failureCodes?: string[]
    passed: boolean
  }
  correction?: {
    iteration: number
    maximumIterations: number
    defectSignature: string
    repeatedDefectCount: number
    plateauCount: number
    terminalReason?: 'success' | 'repeated_defect' | 'plateau' | 'hard_ceiling'
    recommendedDecision: NextDecision
  }
  failure?: { code: string; message: string; retryable: boolean }
}
