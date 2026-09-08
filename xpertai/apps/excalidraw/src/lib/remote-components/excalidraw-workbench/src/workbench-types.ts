import type { CollaborationSessionDescriptor } from '@xpert-ai/plugin-sdk/collaboration-client'
export type StatusFilter = '' | 'draft' | 'reviewed' | 'archived'
export type Drawing = Record<string, any>
export type DrawingVersion = Record<string, any>
export type ExcalidrawTheme = 'light' | 'dark'
export type DetailPayload = {
  item?: Drawing
  currentVersion?: DrawingVersion | null
  versions?: DrawingVersion[]
  logs?: any[]
  diagramTemplates?: DiagramTemplateSummary[]
  diagramQuality?: DiagramQualitySummary | null
  artifactShare?: ArtifactShareSummary | null
}
export type ArtifactShareSummary = {
  artifactId?: string
  artifactVersionId?: string
  artifactLinkId?: string
  versionMode?: 'latest' | 'version'
  accessMode?: string
  shareUrl?: string
  sharedAt?: string
  status?: string
  revision?: number
}
export type ArtifactAccessSelection = 'public_link' | 'organization_all' | 'workspace_all'
export type ArtifactVersionSelection = 'latest' | 'version'
export type CollaborationDescriptor = CollaborationSessionDescriptor & { drawingId: string; revision: number }
export type DiagramTemplateSummary = {
  key: string
  version: string
  artifactType: string
  title: Record<string, string>
  description?: Record<string, string>
  category: string
  tags: string[]
  preview?: { assetPath: string; alt: Record<string, string> }
  previewDataUrl?: string
  inputSchema?: Record<string, any>
  defaults?: Record<string, any>
}
export type DiagramQualitySummary = {
  drawingId: string
  revision: number
  status: string
  renderedExcalidrawVersionId?: string | null
  validationReport?: { valid?: boolean; issues?: any[] } | null
  visualReviews?: any[]
  qualityArtifacts?: Record<string, any> | null
}
export type SceneApplyPayload = {
  elements: any[]
  appState: Record<string, unknown>
  files: Record<string, unknown>
  mermaidSource: string
}
export type DraftRecoverySnapshot = SceneApplyPayload & {
  drawingId: string
  signature: string
  savedAt: number
}
export type SaveCurrentSceneOptions = {
  force?: boolean
  changeSummary?: string
  silent?: boolean
  background?: boolean
  reloadAfterSave?: boolean
}
export type LoadDrawingDetailOptions = {
  applyScene?: boolean
  resetDirty?: boolean
  closeVersions?: boolean
  clearChangeSummary?: boolean
  suppressErrorNotify?: boolean
}
export type DeleteTarget = {type:'drawing';drawingId:string;title:string} | {type:'version';drawingId:string;versionId:string;versionNumber?:number}
export type ConfirmationRequest = {title:string;description:string;confirmLabel:string;destructive?:boolean}
