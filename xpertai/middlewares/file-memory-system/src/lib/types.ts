import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { LongTermMemoryTypeEnum, TMemoryQA, TMemoryUserProfile } from '@metad/contracts'
import { SemanticMemoryKind } from './memory-taxonomy.js'

export const MEMORY_INDEX_FILENAME = 'MEMORY.md'
export const INDEX_MANAGED_START = '<!-- XPERT_FILE_MEMORY_MANAGED_START -->'
export const INDEX_MANAGED_END = '<!-- XPERT_FILE_MEMORY_MANAGED_END -->'

export type MemoryAudience = 'user' | 'shared'
export type MemoryScopeType = 'xpert' | 'workspace'
export type MemoryRecordStatus = 'active' | 'archived' | 'frozen'

export type MemoryScope = {
  scopeType: MemoryScopeType
  scopeId: string
  parentScope?: {
    scopeType: MemoryScopeType
    scopeId: string
  }
}

export type MemoryScopeInput = {
  id?: string | null
  workspaceId?: string | null
}

export type MemoryLayer = {
  scope: MemoryScope
  audience: MemoryAudience
  ownerUserId?: string | null
  layerLabel: string
}

export type MemoryRecordFrontmatter = {
  id: string
  scopeType: MemoryScopeType
  scopeId: string
  audience: MemoryAudience
  ownerUserId?: string
  kind: LongTermMemoryTypeEnum
  semanticKind?: SemanticMemoryKind
  status: MemoryRecordStatus
  title: string
  summary?: string
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
  source: string
  sourceRef?: string
  tags: string[]
}

export type MemoryRecord = MemoryRecordFrontmatter & {
  layerLabel: string
  filePath: string
  relativePath: string
  mtimeMs: number
  body: string
  content: string
  context?: string
  value: TMemoryQA | TMemoryUserProfile
}

export type MemoryRecordHeader = MemoryRecordFrontmatter & {
  layerLabel: string
  filePath: string
  mtimeMs: number
}

export type MemorySearchResult = MemoryRecord & {
  score: number
}

export type MemoryEntrypointBudget = {
  maxLines: number
  maxBytes: number
  truncated: boolean
  lineCount: number
  byteLength: number
}

export type MemoryRecallBudget = {
  maxSelectedTotal: number
  maxFilesPerLayer: number
  maxHeaderLines: number
  maxMemoryLinesPerFile: number
  maxMemoryBytesPerFile: number
  maxRecallBytesPerTurn: number
  maxRecallBytesPerSession: number
}

export type MemoryRuntimeEntrypoint = {
  layer: MemoryLayer
  content: string
  budget: MemoryEntrypointBudget
}

export type MemoryRuntimeDetail = {
  record: MemoryRecord
  content: string
  freshnessNote?: string | null
  byteLength: number
}

export type MemoryRuntimeSummaryDigestItem = {
  id: string
  canonicalRef: string
  title: string
  summary?: string
  kind: LongTermMemoryTypeEnum
  semanticKind?: SemanticMemoryKind
  audience: MemoryAudience
  layerLabel: string
  relativePath: string
  updatedAt: string
  mtimeMs: number
}

export type MemorySurfaceState = {
  alreadySurfaced: string[]
  totalBytes: number
}

export type MemoryRuntimeRecallResult = {
  layers: MemoryLayer[]
  index: string
  headers: MemoryRecordHeader[]
  selected: MemoryRecord[]
  selection: MemoryRecallSelectionResult
  entrypoints: MemoryRuntimeEntrypoint[]
  details: MemoryRuntimeDetail[]
  surfaceState: MemorySurfaceState
  budget: MemoryRecallBudget
}

export type MemorySearchOptions = {
  text?: string | null
  limit?: number
  kinds?: LongTermMemoryTypeEnum[]
  semanticKinds?: SemanticMemoryKind[]
  userId?: string | null
  audience?: MemoryAudience | 'all'
  includeArchived?: boolean
  includeFrozen?: boolean
}

export type MemoryRuntimeRecallOptions = {
  query: string
  userId: string
  recallModel?: BaseChatModel | null
  limit?: number
  recentTools?: readonly string[]
  alreadySurfaced?: ReadonlySet<string>
  surfacedBytes?: number
  timeoutMs?: number
  prompt?: string
  maxSelectedTotal?: number
  enableLogging?: boolean
}

export type MemoryUpsertInput = {
  scope: MemoryScope
  audience?: MemoryAudience | null
  ownerUserId?: string | null
  kind: LongTermMemoryTypeEnum
  semanticKind?: SemanticMemoryKind | null
  memoryId?: string | null
  title?: string | null
  content?: string | null
  context?: string | null
  tags?: string[] | null
  source?: string | null
  sourceRef?: string | null
  status?: MemoryRecordStatus | null
  createdBy: string
  updatedBy?: string | null
}

export type MemoryWriteDecision =
  | { action: 'noop' }
  | { action: 'archive'; memoryId: string; reason?: string | null }
  | {
      action: 'upsert'
      kind: LongTermMemoryTypeEnum
      semanticKind: SemanticMemoryKind
      audience?: MemoryAudience | null
      memoryId?: string | null
      title: string
      content: string
      context?: string | null
      tags?: string[] | null
    }

export type MemoryRecallPlanner = {
  selectRecallHeaders(
    query: string,
    headers: MemoryRecordHeader[],
    chatModel?: BaseChatModel | null,
    options?: {
      limit?: number
      recentTools?: readonly string[]
      alreadySurfaced?: ReadonlySet<string>
      timeoutMs?: number
      prompt?: string
      enableLogging?: boolean
    }
  ): Promise<MemoryRecallSelectionResult>
  selectSummaryDigestHeaders(
    query: string,
    headers: MemoryRecordHeader[],
    options?: {
      limit?: number
      recentTools?: readonly string[]
      alreadySurfaced?: ReadonlySet<string>
      enableLogging?: boolean
    }
  ): Promise<MemoryRecallSelectionResult>
  selectAsyncRecallHeaders(
    query: string,
    headers: MemoryRecordHeader[],
    chatModel?: BaseChatModel | null,
    options?: {
      limit?: number
      recentTools?: readonly string[]
      alreadySurfaced?: ReadonlySet<string>
      timeoutMs?: number
      prompt?: string
      enableLogging?: boolean
    }
  ): Promise<MemoryRecallSelectionResult>
}

export type MemoryRecallSelectionResult = {
  headers: MemoryRecordHeader[]
  strategy: 'model' | 'fallback' | 'disabled'
}
