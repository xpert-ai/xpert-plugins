import type { ICollaborationActor, ICollaborationPresence } from '@xpert-ai/contracts'
import type { CollaborationSessionDescriptor } from '@xpert-ai/plugin-sdk/collaboration-client'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export interface JsonObject { [key: string]: JsonValue }

export interface DeckSummary {
  deckId: string
  title: string
  goal: string
  themePack: string
  status: string
  revision: number
  currentVersionId?: string
  currentVersionNumber: number
  pageCount: number
  activeSlides: number
  checksum?: string
}

export interface DeckDetail {
  item: DeckSummary & { deckSpec?: JsonObject; editorState?: EditorState }
  versions: VersionSummary[]
  exports: ExportSummary[]
  assets: AssetSummary[]
  exportCapabilities?: ExportCapabilities
  sharePolicy?: SharePolicy
}

export type ShareAccessMode = 'owner_only' | 'workspace_all' | 'organization_all' | 'public_link'
export interface SharePolicy {
  defaultAccessMode: ShareAccessMode
  allowedAccessModes: ShareAccessMode[]
  allowAgentPublicSharing: boolean
  allowWorkbenchPublicSharing: boolean
}

export interface ExportCapability { available: boolean; reason?: string; message?: string }
export interface ExportCapabilities {
  backend: 'sandbox-job' | 'local'
  html: ExportCapability
  pdf: ExportCapability
  pptx: ExportCapability
  action?: string
  actionVersion?: string
  runtimeProfile?: string
  sandboxRuntimeVersion?: string
  provider?: string
  runtimeBindingId?: string
  artifactDigest?: string
}

export interface VersionSummary { id: string; versionNumber: number; source: string; checksum: string; changeSummary?: string }
export interface ExportSummary {
  exportId: string
  versionId?: string | null
  workingRevision?: number
  kind: 'html' | 'pdf' | 'pptx'
  status: string
  progress: number
  stage?: string
  fileName?: string
  fileUrl?: string
  workspacePath?: string
  errorMessage?: string
  artifactId?: string
  artifactVersionId?: string
  artifactLinkId?: string
  artifactLinkVersionMode?: 'latest' | 'version'
  artifactLinkAccessMode?: string
  shareUrl?: string
  sandboxJobId?: string
}
export interface AssetSummary { id: string; role: string; fileName: string; size: number; reference: string }

export interface LayoutControl {
  key?: string
  publicKey?: string
  label?: string
  desc?: string
  type?: string
  default?: JsonValue
  min?: number
  max?: number
  step?: number
  countKey?: string
  options?: JsonValue[]
}
export interface NativeLayoutDefinition {
  key: string
  themePack: string
  pageNumber?: number
  label?: string
  slot?: string
  dataLayout?: string
  controls?: LayoutControl[]
  countBindings?: JsonValue[]
  lengthBindings?: JsonValue[]
  numberBounds?: JsonObject
  freeTextFields?: JsonValue[]
}
export interface NativeThemeRuntimePayload {
  protocolVersion: 1
  themePack: string
  runtimeVersion: string
  runtimeChecksum: string
  script: string
  layouts: Record<string, NativeLayoutDefinition>
}
export interface AssetPreview { id: string; fileName: string; mimeType?: string; dataUrl: string; size: number }

export interface EditorState {
  slideOrder: string[]
  skippedSlides: string[]
  deletedSlides: string[]
  duplicatedSlides: Array<{ sourceId: string; copyId: string; copyKey?: string }>
  text: Record<string, string>
  props: Record<string, JsonObject>
  preview: JsonObject
}

export type CollabActor = ICollaborationActor
export type CollabDescriptor = CollaborationSessionDescriptor & { deckId: string }
export interface OpenDeckPayload extends DeckDetail { collab: CollabDescriptor }

export interface PresenceState extends Omit<ICollaborationPresence, 'pageId' | 'pointer' | 'focus' | 'selection' | 'viewport' | 'mode'> {
  slideId?: string | null
  pointer?: { x: number; y: number; visible: boolean } | null
  focus?: { kind: 'slide' | 'text' | 'control' | 'element'; key?: string } | null
  selection?: { textKey: string; anchorRelativeBase64: string; headRelativeBase64: string } | null
  mode?: 'edit' | 'present'
  status?: 'thinking' | 'editing' | 'done' | 'failed'
  toolName?: string | null
  operationLabel?: string | null
  updatedAt: number
}

export interface RemoteContext {
  locale?: string
  theme?: JsonObject
  debug?: { enabled?: boolean; production?: boolean }
}
