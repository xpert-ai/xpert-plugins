import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { LongTermMemoryTypeEnum, TMemoryQA, TMemoryUserProfile } from '@xpert-ai/contracts'
import { SemanticMemoryKind } from './memory-taxonomy.js'

export const FileMemorySystemIcon = `<?xml version="1.0" encoding="iso-8859-1"?>
<svg height="800px" width="800px" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
   viewBox="0 0 512 512" xml:space="preserve">
<g transform="translate(1 1)">
  <polygon style="fill:#FFDD09;" points="51.966,466.862 449.207,466.862 449.207,43.138 51.966,43.138 	"/>
  <polygon style="fill:#FFFFFF;" points="25.483,466.862 51.966,466.862 51.966,43.138 25.483,43.138 	"/>
  <polygon style="fill:#FD9808;" points="449.207,78.448 449.207,466.862 60.793,466.862 60.793,502.172 484.517,502.172 
    484.517,78.448 	"/>
  <polygon style="fill:#FCC309;" points="60.793,502.172 458.034,502.172 458.034,466.862 60.793,466.862 	"/>
  <path d="M449.207,475.69H25.483c-5.297,0-8.828-3.531-8.828-8.828V43.138c0-5.297,3.531-8.828,8.828-8.828h423.724
    c5.297,0,8.828,3.531,8.828,8.828v423.724C458.034,472.159,454.503,475.69,449.207,475.69z M34.31,458.034h406.069V51.966H34.31
    V458.034z"/>
  <path d="M484.517,511H60.793c-5.297,0-8.828-3.531-8.828-8.828v-35.31c0-5.297,3.531-8.828,8.828-8.828h379.586V78.448
    c0-5.297,3.531-8.828,8.828-8.828h35.31c5.297,0,8.828,3.531,8.828,8.828v423.724C493.345,507.469,489.814,511,484.517,511z
     M69.621,493.345H475.69V87.276h-17.655v379.586c0,5.297-3.531,8.828-8.828,8.828H69.621V493.345z"/>
  <path d="M219.69,122.586c-19.421,0-35.31-15.89-35.31-35.31V34.31c0-19.421,15.89-35.31,35.31-35.31S255,14.89,255,34.31
    c0,5.297-3.531,8.828-8.828,8.828s-8.828-3.531-8.828-8.828c0-9.71-7.945-17.655-17.655-17.655c-9.71,0-17.655,7.945-17.655,17.655
    v52.966c0,9.71,7.945,17.655,17.655,17.655c9.71,0,17.655-7.945,17.655-17.655c0-5.297,3.531-8.828,8.828-8.828
    S255,81.979,255,87.276C255,106.697,239.11,122.586,219.69,122.586z"/>
  <path d="M360.931,193.207h-35.31c-5.297,0-8.828-3.531-8.828-8.828s3.531-8.828,8.828-8.828h35.31c5.297,0,8.828,3.531,8.828,8.828
    S366.228,193.207,360.931,193.207z"/>
  <path d="M290.31,193.207h-61.793c-5.297,0-8.828-3.531-8.828-8.828s3.531-8.828,8.828-8.828h61.793
    c5.297,0,8.828,3.531,8.828,8.828S295.607,193.207,290.31,193.207z"/>
  <path d="M193.207,193.207h-79.448c-5.297,0-8.828-3.531-8.828-8.828s3.531-8.828,8.828-8.828h79.448
    c5.297,0,8.828,3.531,8.828,8.828S198.503,193.207,193.207,193.207z"/>
  <path d="M360.931,246.172H290.31c-5.297,0-8.828-3.531-8.828-8.828s3.531-8.828,8.828-8.828h70.621
    c5.297,0,8.828,3.531,8.828,8.828S366.228,246.172,360.931,246.172z"/>
  <path d="M237.345,246.172h-61.793c-5.297,0-8.828-3.531-8.828-8.828s3.531-8.828,8.828-8.828h61.793
    c5.297,0,8.828,3.531,8.828,8.828S242.641,246.172,237.345,246.172z"/>
  <path d="M140.241,246.172h-26.483c-5.297,0-8.828-3.531-8.828-8.828s3.531-8.828,8.828-8.828h26.483
    c5.297,0,8.828,3.531,8.828,8.828S145.538,246.172,140.241,246.172z"/>
  <path d="M360.931,299.138h-26.483c-5.297,0-8.828-3.531-8.828-8.828s3.531-8.828,8.828-8.828h26.483
    c5.297,0,8.828,3.531,8.828,8.828S366.228,299.138,360.931,299.138z"/>
  <path d="M299.138,299.138h-88.276c-5.297,0-8.828-3.531-8.828-8.828s3.531-8.828,8.828-8.828h88.276
    c5.297,0,8.828,3.531,8.828,8.828S304.434,299.138,299.138,299.138z"/>
  <path d="M157.897,299.138h-44.138c-5.297,0-8.828-3.531-8.828-8.828s3.531-8.828,8.828-8.828h44.138
    c5.297,0,8.828,3.531,8.828,8.828S163.193,299.138,157.897,299.138z"/>
  <path d="M360.931,352.103h-97.103c-5.297,0-8.828-3.531-8.828-8.828s3.531-8.828,8.828-8.828h97.103
    c5.297,0,8.828,3.531,8.828,8.828S366.228,352.103,360.931,352.103z"/>
  <path d="M210.862,352.103h-35.31c-5.297,0-8.828-3.531-8.828-8.828s3.531-8.828,8.828-8.828h35.31c5.297,0,8.828,3.531,8.828,8.828
    S216.159,352.103,210.862,352.103z"/>
  <path d="M140.241,352.103h-26.483c-5.297,0-8.828-3.531-8.828-8.828s3.531-8.828,8.828-8.828h26.483
    c5.297,0,8.828,3.531,8.828,8.828S145.538,352.103,140.241,352.103z"/>
</g>
</svg>`

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
