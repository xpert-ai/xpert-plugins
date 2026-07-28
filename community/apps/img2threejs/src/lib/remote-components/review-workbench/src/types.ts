export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export type JsonObject = { [key: string]: JsonValue | undefined }

export type SupportedLocale = 'en-US' | 'zh-Hans' | 'zh-Hant'

export type HostContext = {
  locale?: string
  initialQuery?: JsonObject
  debug?: { enabled?: boolean; production?: boolean }
}

export type ProjectRow = {
  id: string
  name: string
  route: 'object' | 'character'
  modelingMode: 'semantic-3d' | 'relief'
  status: string
  revision: number
  confidence: number
  humanReviewStatus: string
  nextDecision: string
  updatedAt: string
}

export type StageResult = {
  stage: string
  status: 'passed' | 'failed' | 'blocked'
  score: number
  checks: Array<{ code: string; passed: boolean; detail: string }>
}

export type SelectedData = {
  project: {
    projectId: string
    runId: string | null
    revision: number
    runRevision: number | null
    status: string
    currentStage: string | null
    completedStages: string[]
    deterministicStatus: string
    visualStatus: string
    humanReviewStatus: string
    nextDecision: string
    failureCodes: string[]
    cursor: string
    nextAction: string
    name: string
    route: 'object' | 'character'
    modelingMode: 'semantic-3d' | 'relief'
    confidence: number
  }
  images: Array<{
    id: string
    label: string
    view: string
    admissionStatus: string
    sha256: string
    width: number | null
    height: number | null
    confidence: number
    previewFileKey: string
    previewUrl: string | null
  }>
  stages: StageResult[]
  viewerScene: ViewerSceneDto | null
  artifact: {
    codeVersionId: string | null
    codeSha256: string | null
    sourceAsset: JsonObject | null
    comparisonAsset: JsonObject | null
    comparisonPreviewUrl: string | null
    visualReview: JsonObject | null
    renderReport: JsonObject | null
    capabilities: {
      workspaceFiles: { available: boolean; reason?: string }
      artifacts: { available: boolean; reason?: string }
      sandboxRender: { available: boolean; reason?: string }
    }
  }
}

export type WorkbenchData = {
  tableKey: 'projects'
  table: {
    key: 'projects'
    items: ProjectRow[]
    total: number
    page: number
    pageSize: number
  }
  selected: SelectedData | null
}

export type BridgeMessage = JsonObject & {
  channel: 'xpertai.remote_component'
  protocolVersion: 1
  instanceId?: string
  requestId?: string
  type: string
}
import type { ViewerSceneDto } from '../../../contracts/viewer-scene.js'
