import type { RemotePayloadObject, RemotePayloadValue } from './runtime.js'

/** Browser-side mirror of the persisted graph contract used by the remote bridge. */
export type GraphSnapshot = {
  formatVersion: 'pencil.scene-graph.v1'
  pencilVersion: string
  rootId: string
  nodes: Array<[string, RemotePayloadObject]>
  images: Array<[string, string]>
  variables: Array<[string, RemotePayloadObject]>
  variableCollections: Array<[string, RemotePayloadObject]>
  activeMode: Array<[string, string]>
  instanceIndex: Array<[string, string[]]>
  figKiwiVersion?: number | null
  figSchemaDeflatedBase64?: string | null
  documentColorSpace?: string
}

export type DocumentItem = {
  id?: string
  title?: string
  status?: string
  kind?: string
  currentVersionId?: string
  currentVersionNumber?: number
  workingCopyRevision?: number
  graphChecksum?: string
  updatedAt?: string
}

export type VersionItem = {
  id?: string
  versionNumber?: number
  sourceType?: string
  changeSummary?: string
  createdAt?: string
}

export type LogItem = {
  action?: string
  message?: string
  errorMessage?: string
}

/** Detail payload combines immutable version metadata with the current mutable graph. */
export type DetailPayload = {
  item?: DocumentItem
  graphSnapshot?: GraphSnapshot
  workingCopy?: RemotePayloadObject
  versions?: VersionItem[]
  logs?: LogItem[]
  snapshotSummary?: RemotePayloadObject
  graphChecksum?: string
  workingCopyRevision?: number
}

export type Summary = {
  nodeCount: number
  pageCount: number
  imageCount: number
  variableCount: number
}

export type InspectorTab = 'properties' | 'code' | 'activity'
export type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive'
export type PencilBinaryObject = RemotePayloadObject & { __pencilBinary?: RemotePayloadValue; base64?: RemotePayloadValue }
