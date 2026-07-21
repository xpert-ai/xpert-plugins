import type { WorkspacePortableFileReference } from '@xpert-ai/plugin-sdk'
import type {
  PRESENTATION_EXPORT_KINDS,
  PRESENTATION_EXPORT_STATUSES,
  PRESENTATION_SLIDE_STATUSES,
  PRESENTATION_STATUSES,
  PRESENTATION_THEME_PACKS,
  PRESENTATION_VERSION_SOURCES
} from './constants.js'

export type PresentationJsonPrimitive = string | number | boolean | null
export type PresentationJsonValue = PresentationJsonPrimitive | PresentationJsonObject | PresentationJsonValue[]
export interface PresentationJsonObject { [key: string]: PresentationJsonValue }

export type PresentationThemePack = (typeof PRESENTATION_THEME_PACKS)[number]
export const PRESENTATION_THEME_SOURCE_TYPES = ['react', 'html', 'pptx', 'pdf', 'images', 'mixed'] as const
export type PresentationThemeSourceType = (typeof PRESENTATION_THEME_SOURCE_TYPES)[number]
export const PRESENTATION_THEME_SOURCE_MODES = ['single_file', 'image_files'] as const
export type PresentationThemeSourceMode = (typeof PRESENTATION_THEME_SOURCE_MODES)[number]
/** `draft` is retained only for themes created before the staged generator workflow. */
export const PRESENTATION_THEME_STATUSES = ['draft', 'prepared', 'analyzing', 'generating', 'validating', 'ready', 'failed'] as const
export type PresentationThemeStatus = (typeof PRESENTATION_THEME_STATUSES)[number]
export const PRESENTATION_THEME_PROGRESS_STATUSES = ['analyzing', 'generating', 'validating'] as const
export type PresentationThemeProgressStatus = (typeof PRESENTATION_THEME_PROGRESS_STATUSES)[number]
export type PresentationThemeReference =
  | { type: 'builtin'; key: PresentationThemePack }
  | { type: 'custom'; key: string; themeId: string }
export type PresentationStatus = (typeof PRESENTATION_STATUSES)[number]
export type PresentationSlideStatus = (typeof PRESENTATION_SLIDE_STATUSES)[number]
export type PresentationExportKind = (typeof PRESENTATION_EXPORT_KINDS)[number]
export type PresentationExportStatus = (typeof PRESENTATION_EXPORT_STATUSES)[number]
export type PresentationVersionSource = (typeof PRESENTATION_VERSION_SOURCES)[number]
export const PRESENTATION_SHARE_ACCESS_MODES = ['owner_only', 'workspace_all', 'organization_all', 'public_link'] as const
export type PresentationShareAccessMode = (typeof PRESENTATION_SHARE_ACCESS_MODES)[number]

export interface PresentationSharePolicy {
  defaultAccessMode: PresentationShareAccessMode
  allowedAccessModes: PresentationShareAccessMode[]
  allowAgentPublicSharing: boolean
  allowWorkbenchPublicSharing: boolean
}

export interface PresentationStudioConfig {
  exportBackend: 'sandbox-job' | 'local'
  chromiumExecutablePath?: string
  exportConcurrency: number
  maxPageCount: number
  maxAssetBytes: number
  maxDeckMediaBytes: number
  maxPreviewBytes: number
  debug: boolean
  defaultShareAccessMode: PresentationShareAccessMode
  allowedShareAccessModes: PresentationShareAccessMode[]
  allowAgentPublicSharing: boolean
  allowWorkbenchPublicSharing: boolean
}

export interface PresentationScope {
  tenantId?: string | null
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  userId?: string | null
  /** Current Xpert/Assistant owner used to isolate Presentation Studio data. */
  xpertId?: string | null
  /** Persisted compatibility name for xpertId on existing Presentation entities. */
  assistantId?: string | null
  assistantDisplayName?: string | null
  agentKey?: string | null
  conversationId?: string | null
}

export interface PresentationSlideSpec {
  id: string
  layout: string
  status: PresentationSlideStatus
  sourceSlideId?: string | null
  props: PresentationJsonObject
}

export interface PresentationEditorState {
  slideOrder: string[]
  skippedSlides: string[]
  deletedSlides: string[]
  duplicatedSlides: Array<{ sourceId: string; copyId: string; copyKey?: string }>
  text: Record<string, string>
  props: Record<string, PresentationJsonObject>
  preview: PresentationJsonObject
}

export interface PresentationDeckSpec {
  title: string
  goal: string
  audience?: string | null
  owner?: string | null
  themePack: string
  theme?: PresentationThemeReference
  pageCount: number
  allowMediaReuse?: boolean
  preview?: PresentationJsonObject
  slides: PresentationSlideSpec[]
}

export interface PresentationThemeRuntimeMetadata extends PresentationJsonObject {
  schema: 'xpert.presentation-theme-runtime/v1'
  theme: PresentationJsonObject
  pages: PresentationJsonObject[]
}

export interface PresentationCollabSession {
  sessionId: string
  clientKey: string
  deckId: string
  scope: PresentationScope
  userId?: string | null
  actor: PresentationCollabActor
  expiresAt: number
}

export interface PresentationCollabActor {
  presenceId: string
  displayName: string
  color: string
  actorType: 'user' | 'agent'
  avatarUrl?: string | null
}

export interface PresentationAwarenessV2 {
  protocolVersion: 2
  slideId?: string | null
  pointer?: { x: number; y: number; visible: boolean } | null
  focus?: { kind: 'slide' | 'text' | 'control' | 'element'; key?: string } | null
  selection?: { textKey: string; anchorRelativeBase64: string; headRelativeBase64: string } | null
  mode?: 'edit' | 'present'
  viewport?: { zoom: number; width: number; height: number } | null
  status?: 'thinking' | 'editing' | 'done' | 'failed'
  toolName?: string | null
  operationLabel?: string | null
}

/** Minimal Managed Queue payload; deck snapshots and assets stay in persistent storage. */
export interface PresentationExportJobData {
  exportId: string
  tenantId?: string | null
  organizationId?: string | null
}

/** Structured reason used to disable PDF/PPTX while keeping HTML independently available. */
export type PresentationExportCapabilityReason =
  | 'ACTION_MISSING'
  | 'ACTION_INVALID'
  | 'PROFILE_MISSING'
  | 'VERSION_MISMATCH'
  | 'RUNTIME_UNBOUND'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROFILE_UNHEALTHY'
  | 'WORKER_UNAVAILABLE'
  | 'LOCAL_BROWSER_UNAVAILABLE'

/** Health-derived export availability and optional Runtime evidence for the Workbench. */
export interface PresentationExportCapabilities {
  html: { available: boolean }
  pdf: { available: boolean; reason?: PresentationExportCapabilityReason; message?: string }
  pptx: { available: boolean; reason?: PresentationExportCapabilityReason; message?: string }
  backend: 'sandbox-job' | 'local'
  action?: string
  actionVersion?: string
  runtimeProfile?: string
  sandboxRuntimeVersion?: string
  provider?: string
  runtimeBindingId?: string
  artifactDigest?: string
}

export interface PresentationAssetReference {
  reference: WorkspacePortableFileReference
  fileName: string
  mimeType?: string | null
  size: number
  sha256: string
  fileUrl?: string | null
  workspacePath?: string | null
}

export interface PresentationWorkbenchQuery {
  table?: 'decks' | 'deck_detail' | 'exports' | 'versions'
  deckId?: string | null
  versionId?: string | null
  checksum?: string | null
  status?: PresentationStatus | null
  search?: string | null
  page?: number
  pageSize?: number
}

export interface PresentationWorkbenchAgentContext {
  deckId: string
  slideId?: string | null
  deckTitle?: string | null
  themePack?: string | null
  slideLayout?: string | null
  slideLabel?: string | null
  activeIndex?: number | null
  slideCount?: number | null
  revision?: number | null
  currentVersionNumber?: number | null
  assistantDisplayName?: string | null
  updatedAt: number
}

export interface PresentationRenderResult {
  directory: string
  indexHtmlPath: string
  goalPath: string
  warnings: string[]
}
