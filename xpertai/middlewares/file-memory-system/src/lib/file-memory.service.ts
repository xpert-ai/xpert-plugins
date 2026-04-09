import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { LongTermMemoryTypeEnum, TFile, TFileDirectory, TMemoryQA, TMemoryUserProfile } from '@metad/contracts'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import yaml from 'yaml'
import { FileMemoryFileRepository } from './file-repository.js'
import { FileMemoryLayerResolver } from './layer-resolver.js'
import { FileMemoryRecallPlanner } from './recall-planner.js'
import {
  INDEX_MANAGED_END,
  INDEX_MANAGED_START,
  MEMORY_INDEX_FILENAME,
  MemoryAudience,
  MemoryLayer,
  MemoryRecallSelectionResult,
  MemoryRecord,
  MemoryRecordFrontmatter,
  MemoryRecordHeader,
  MemoryRecordStatus,
  MemoryRuntimeDetail,
  MemoryRuntimeEntrypoint,
  MemoryRuntimeRecallOptions,
  MemoryRuntimeRecallResult,
  MemoryRuntimeSummaryDigestItem,
  MemoryScope,
  MemoryScopeInput,
  MemorySearchOptions,
  MemorySearchResult,
  MemoryUpsertInput
} from './types.js'
import { FileMemoryWritePolicy } from './write-policy.js'
import { memoryAge, memoryFreshnessText } from './memory-freshness.js'
import {
  defaultSemanticKindForLegacyKind,
  inferRelativeMemoryPath,
  resolveMemoryDirectoryName,
  resolveSemanticKind,
  sectionHeadingForSemanticKind,
  SemanticMemoryKind
} from './memory-taxonomy.js'

const MAX_ENTRYPOINT_LINES = 200
const MAX_ENTRYPOINT_BYTES = 25_000
const MAX_MEMORY_FILES = 200
const MAX_HEADER_LINES = 30
const MAX_MEMORY_LINES = 200
const MAX_MEMORY_BYTES = 4_096
const MAX_RECALL_BYTES_PER_TURN = 20 * 1024
const MAX_RECALL_BYTES_PER_SESSION = 60 * 1024
const MAX_SELECTED_TOTAL = 5
const MAX_RUNTIME_SUMMARY_ITEMS = 5
const MEMORY_CONTEXT_SECTION_HEADING = '补充上下文'
const MEMORY_CONTEXT_SECTION_PATTERN = /\n##\s+(?:Context|上下文|补充上下文)\s*\n([\s\S]*)$/i
const MEMORY_WORKBENCH_ROOTS = ['my', 'shared'] as const

type MemoryWorkbenchLayerKey = (typeof MEMORY_WORKBENCH_ROOTS)[number]

@Injectable()
export class XpertFileMemoryService {
  private readonly logger = new Logger(XpertFileMemoryService.name)
  private readonly entrypointCache = new Map<string, string>()
  private readonly headerManifestCache = new Map<string, MemoryRecordHeader[]>()

  constructor(
    private readonly layerResolver: FileMemoryLayerResolver,
    private readonly fileRepository: FileMemoryFileRepository,
    private readonly recallPlanner: FileMemoryRecallPlanner,
    private readonly writePolicy: FileMemoryWritePolicy
  ) {}

  resolveScope(input: MemoryScopeInput) {
    return this.layerResolver.resolveScope(input)
  }

  resolveVisibleLayers(scope: MemoryScope, userId: string, audience: MemoryAudience | 'all' = 'all') {
    return this.layerResolver.resolveVisibleLayers(scope, userId, audience)
  }

  resolveScopeDirectory(tenantId: string, scope: MemoryScope) {
    return this.layerResolver.resolveScopeDirectory(tenantId, scope)
  }

  resolveLayerDirectory(tenantId: string, layer: MemoryLayer) {
    return this.layerResolver.resolveLayerDirectory(tenantId, layer)
  }

  async search(tenantId: string, scope: MemoryScope, options: MemorySearchOptions = {}): Promise<MemorySearchResult[]> {
    const records = await this.listRecords(tenantId, scope, options)
    const query = options.text?.trim()
    if (!query) {
      return records.slice(0, options.limit ?? records.length).map((record) => ({ ...record, score: 1 }))
    }

    return records
      .map((record) => ({
        ...record,
        score: this.scoreRecord(record, query)
      }))
      .filter((record) => record.score > 0)
      .sort((a, b) => b.score - a.score || compareLayeredRecords(a, b))
      .slice(0, options.limit ?? records.length)
  }

  async readRuntimeEntrypoints(tenantId: string, scope: MemoryScope, userId: string) {
    const layers = this.resolveVisibleLayers(scope, userId, 'all')
    const indexParts = await Promise.all(layers.map((layer) => this.readIndexForLayer(tenantId, layer)))
    return layers.map((layer, index) => createRuntimeEntrypoint(layer, indexParts[index] ?? ''))
  }

  async buildRuntimeSummaryDigest(
    tenantId: string,
    scope: MemoryScope,
    options: {
      query: string
      userId: string
      recentTools?: readonly string[]
      limit?: number
      enableLogging?: boolean
    }
  ): Promise<MemoryRuntimeSummaryDigestItem[]> {
    const query = options.query.trim()
    if (!query) {
      return []
    }

    const layers = this.resolveVisibleLayers(scope, options.userId, 'all')
    const headersByLayer = await Promise.all(
      layers.map(async (layer) => {
        const headers = await this.scanHeadersInLayer(tenantId, layer, {
          audience: layer.audience,
          includeArchived: false,
          includeFrozen: false
        })
        return headers.slice(0, MAX_MEMORY_FILES)
      })
    )

    const recallableHeaders = headersByLayer
      .flat()
      .sort(compareLayeredRecords)
      .filter((header) => buildMemoryLifecycle(header).recallEligible)

    const selection = await this.recallPlanner.selectSummaryDigestHeaders(query, recallableHeaders, {
      limit: options.limit ?? MAX_RUNTIME_SUMMARY_ITEMS,
      recentTools: options.recentTools,
      enableLogging: options.enableLogging
    })

    return selection.headers.map((header) => ({
      id: header.id,
      canonicalRef: header.id,
      title: header.title,
      summary: header.summary,
      kind: header.kind,
      semanticKind: header.semanticKind,
      audience: header.audience,
      layerLabel: header.layerLabel,
      relativePath: inferRelativeMemoryPath(header.filePath),
      updatedAt: header.updatedAt,
      mtimeMs: header.mtimeMs
    }))
  }

  async buildRuntimeRecall(
    tenantId: string,
    scope: MemoryScope,
    options: MemoryRuntimeRecallOptions
  ): Promise<MemoryRuntimeRecallResult> {
    const entrypoints = await this.readRuntimeEntrypoints(tenantId, scope, options.userId)
    const layers = entrypoints.map((entrypoint) => entrypoint.layer)
    const recallLimits = {
      maxSelectedTotal: options.maxSelectedTotal ?? MAX_SELECTED_TOTAL
    }
    const headersByLayer = await Promise.all(
      layers.map(async (layer) => {
        const headers = await this.scanHeadersInLayer(tenantId, layer, {
          audience: layer.audience,
          includeArchived: false,
          includeFrozen: false
        })
        return headers.slice(0, MAX_MEMORY_FILES)
      })
    )
    const flatHeaders = headersByLayer.flat().sort(compareLayeredRecords)
    const recallableHeaders = flatHeaders.filter((header) => buildMemoryLifecycle(header).recallEligible)
    const selection = options.query.trim()
      ? await this.recallPlanner.selectAsyncRecallHeaders(options.query, recallableHeaders, options.recallModel, {
          limit: options.limit ?? recallLimits.maxSelectedTotal,
          recentTools: options.recentTools,
          alreadySurfaced: options.alreadySurfaced,
          timeoutMs: options.timeoutMs,
          prompt: options.prompt,
          enableLogging: options.enableLogging
        })
      : { headers: [], strategy: 'disabled' as const }

    const selectedRecords = await Promise.all(
      selection.headers.map((header) => this.readRecordForRuntimeDetail(header, layerFromHeader(header)))
    )

    const surfacedPaths = new Set<string>(options.alreadySurfaced ?? [])
    let usedTurnBytes = 0
    let usedSessionBytes = Math.max(0, options.surfacedBytes ?? 0)
    const details: MemoryRuntimeDetail[] = []

    for (const record of selectedRecords) {
      const detail = formatRuntimeDetail(record)
      if (usedTurnBytes + detail.byteLength > MAX_RECALL_BYTES_PER_TURN) {
        continue
      }
      if (usedSessionBytes + detail.byteLength > MAX_RECALL_BYTES_PER_SESSION) {
        continue
      }
      details.push(detail)
      usedTurnBytes += detail.byteLength
      usedSessionBytes += detail.byteLength
      surfacedPaths.add(record.filePath)
    }

    return {
      layers,
      index: entrypoints.map((entrypoint) => entrypoint.content).filter(Boolean).join('\n\n'),
      headers: flatHeaders,
      selected: selectedRecords,
      selection,
      entrypoints,
      details,
      surfaceState: {
        alreadySurfaced: Array.from(surfacedPaths),
        totalBytes: usedSessionBytes
      },
      budget: {
        maxSelectedTotal: recallLimits.maxSelectedTotal,
        maxFilesPerLayer: MAX_MEMORY_FILES,
        maxHeaderLines: MAX_HEADER_LINES,
        maxMemoryLinesPerFile: MAX_MEMORY_LINES,
        maxMemoryBytesPerFile: MAX_MEMORY_BYTES,
        maxRecallBytesPerTurn: MAX_RECALL_BYTES_PER_TURN,
        maxRecallBytesPerSession: MAX_RECALL_BYTES_PER_SESSION
      }
    }
  }

  async selectRecallHeadersForQuery(
    tenantId: string,
    scope: MemoryScope,
    options: MemoryRuntimeRecallOptions
  ): Promise<MemoryRecallSelectionResult> {
    const layers = this.resolveVisibleLayers(scope, options.userId, 'all')
    const headersByLayer = await Promise.all(
      layers.map(async (layer) => {
        const headers = await this.scanHeadersInLayer(tenantId, layer, {
          audience: layer.audience,
          includeArchived: false,
          includeFrozen: false
        })
        return headers.slice(0, MAX_MEMORY_FILES)
      })
    )

    const flatHeaders = headersByLayer.flat().sort(compareLayeredRecords)
    const recallableHeaders = flatHeaders.filter((header) => buildMemoryLifecycle(header).recallEligible)
    if (!options.query.trim()) {
      return {
        headers: [],
        strategy: 'disabled'
      }
    }

    return this.recallPlanner.selectRecallHeaders(options.query, recallableHeaders, options.recallModel, {
      limit: options.limit ?? options.maxSelectedTotal ?? MAX_SELECTED_TOTAL,
      recentTools: options.recentTools,
      alreadySurfaced: options.alreadySurfaced,
      timeoutMs: options.timeoutMs,
      prompt: options.prompt,
      enableLogging: options.enableLogging
    })
  }

  async findVisibleRecordById(tenantId: string, scope: MemoryScope, userId: string, memoryId: string) {
    const layers = this.resolveVisibleLayers(scope, userId, 'all')
    return this.findRecordInLayers(tenantId, layers, memoryId)
  }

  async findVisibleRecordByRelativePath(tenantId: string, scope: MemoryScope, userId: string, relativePath: string) {
    const layers = this.resolveVisibleLayers(scope, userId, 'all')
    return this.findRecordInLayersByRelativePath(tenantId, layers, relativePath)
  }

  async upsert(tenantId: string, input: MemoryUpsertInput): Promise<MemoryRecord> {
    const layer = this.resolveTargetLayer(input)
    const existing = input.memoryId ? await this.getRecordFromLayer(tenantId, layer, input.memoryId) : null
    const id = input.memoryId ?? uuidv4()
    const semanticKind = resolveSemanticKind({
      semanticKind: input.semanticKind ?? existing?.semanticKind,
      kind: input.kind,
      title: input.title ?? existing?.title,
      summary: existing?.summary,
      content: input.content ?? existing?.content,
      context: input.context ?? existing?.context,
      tags: input.tags ?? existing?.tags,
      relativePath: existing?.relativePath
    })
    const normalized = normalizeRecordValue(input.kind, semanticKind, input, existing)
    const filePath =
      existing?.filePath ?? this.resolveRecordPath(tenantId, layer, input.kind, semanticKind, id, normalized.title)
    const createdAt = existing?.createdAt ?? new Date().toISOString()
    const createdBy = existing?.createdBy ?? input.createdBy
    const updatedAt = new Date().toISOString()
    const updatedBy = input.updatedBy ?? input.createdBy

    const frontmatter: MemoryRecordFrontmatter = {
      id,
      scopeType: layer.scope.scopeType,
      scopeId: layer.scope.scopeId,
      audience: layer.audience,
      ownerUserId: layer.ownerUserId ?? undefined,
      kind: input.kind,
      semanticKind,
      status: normalizeStatus(input.status ?? existing?.status ?? 'active'),
      title: normalized.title,
      summary: createPreview(normalized.content, normalized.context),
      createdAt,
      updatedAt,
      createdBy: String(createdBy),
      updatedBy: String(updatedBy),
      source: input.source ?? existing?.source ?? 'manual',
      sourceRef: input.sourceRef ?? existing?.sourceRef ?? undefined,
      tags: normalizeTags(input.tags ?? existing?.tags)
    }

    await this.ensureLayerDirectories(tenantId, layer)
    await this.fileRepository.writeFile(filePath, serializeMemoryFile(frontmatter, normalized.body))
    this.invalidateLayerCaches(tenantId, layer)
    await this.updateIndexForLayer(tenantId, layer)
    return this.readRecord(tenantId, filePath, layer)
  }

  async applyGovernance(
    tenantId: string,
    scope: MemoryScope,
    memoryId: string,
    action: 'archive',
    updatedBy: string,
    options: {
      userId?: string | null
      audience?: MemoryAudience | 'all'
      ownerUserId?: string | null
    } = {}
  ) {
    const layers = this.resolveLayersForOptions(scope, options)
    const found = await this.findRecordInLayers(tenantId, layers, memoryId)
    if (!found) {
      return null
    }

    const { record, layer } = found
    const frontmatter: MemoryRecordFrontmatter = {
      ...record,
      status: action === 'archive' ? 'archived' : record.status,
      updatedAt: new Date().toISOString(),
      updatedBy
    }

    await this.fileRepository.writeFile(record.filePath, serializeMemoryFile(frontmatter, record.body))
    this.invalidateLayerCaches(tenantId, layer)
    await this.updateIndexForLayer(tenantId, layer)
    return this.readRecord(tenantId, record.filePath, layer)
  }

  async listWorkbenchFiles(
    tenantId: string,
    scope: MemoryScope,
    userId: string,
    logicalPath = ''
  ): Promise<TFileDirectory[]> {
    const target = parseMemoryWorkbenchPath(logicalPath)
    if (!target.layerKey) {
      return MEMORY_WORKBENCH_ROOTS.map((layerKey) => createWorkbenchRootNode(layerKey))
    }

    const layer = this.resolveWorkbenchLayer(scope, userId, target.layerKey)
    if (!target.relativePath) {
      return this.listWorkbenchLayerEntries(tenantId, layer, target.layerKey)
    }

    if (isMemoryIndexPath(target.relativePath)) {
      return []
    }

    return this.listWorkbenchDirectoryEntries(tenantId, layer, target.layerKey, target.relativePath)
  }

  async readWorkbenchFile(
    tenantId: string,
    scope: MemoryScope,
    userId: string,
    logicalPath: string
  ): Promise<TFile> {
    const target = parseMemoryWorkbenchPath(logicalPath)
    if (!target.layerKey || !target.relativePath) {
      throw new BadRequestException('File path is required')
    }

    const layer = this.resolveWorkbenchLayer(scope, userId, target.layerKey)
    if (isMemoryIndexPath(target.relativePath)) {
      let contents = await this.readIndexForLayer(tenantId, layer)
      if (!contents.trim()) {
        const headers = await this.scanHeadersInLayer(tenantId, layer, {
          includeArchived: true,
          includeFrozen: true,
          audience: layer.audience
        })
        contents = normalizeIndexSource('', renderManagedIndex(layer, headers), layer)
      }
      return createWorkbenchFile({
        logicalPath: target.fullPath,
        contents,
        description: `${layer.layerLabel} index`
      })
    }

    if (!isMemoryRecordPath(target.relativePath)) {
      throw new BadRequestException('Directory paths cannot be opened as files')
    }

    const found = await this.findRecordInLayersByRelativePath(tenantId, [layer], target.relativePath)
    if (!found) {
      throw new BadRequestException('Memory file not found')
    }

    const contents = await this.fileRepository.readFile(found.record.filePath)
    return createWorkbenchFile({
      logicalPath: target.fullPath,
      contents,
      description: found.record.summary,
      mtimeMs: found.record.mtimeMs
    })
  }

  async saveWorkbenchFile(
    tenantId: string,
    scope: MemoryScope,
    userId: string,
    logicalPath: string,
    content: string,
    updatedBy: string
  ): Promise<TFile> {
    const target = parseMemoryWorkbenchPath(logicalPath)
    if (!target.layerKey || !target.relativePath) {
      throw new BadRequestException('File path is required')
    }
    if (isMemoryIndexPath(target.relativePath)) {
      throw new BadRequestException('MEMORY.md is managed by the file-memory runtime and cannot be edited directly')
    }
    if (!isMemoryRecordPath(target.relativePath)) {
      throw new BadRequestException('Directory paths cannot be edited as files')
    }

    const layer = this.resolveWorkbenchLayer(scope, userId, target.layerKey)
    const found = await this.findRecordInLayersByRelativePath(tenantId, [layer], target.relativePath)
    if (!found) {
      throw new BadRequestException('Memory file not found')
    }

    const parsed = parseMemoryFile(content ?? '', toFrontmatter(found.record))
    const resolvedTitle =
      coalesce(parsed.frontmatter.title, extractTitleFromBody(parsed.body), found.record.title) || found.record.title
    const parsedBody = parseBody(found.record.kind, resolvedTitle, parsed.body)

    await this.upsert(tenantId, {
      scope: found.layer.scope,
      audience: found.record.audience,
      ownerUserId: found.record.ownerUserId,
      kind: found.record.kind,
      semanticKind: found.record.semanticKind,
      memoryId: found.record.id,
      title: resolvedTitle,
      content: parsedBody.content,
      context: parsedBody.context,
      tags: parsed.frontmatter.tags,
      source: found.record.source,
      sourceRef: found.record.sourceRef,
      status: found.record.status,
      createdBy: found.record.createdBy,
      updatedBy
    })

    return this.readWorkbenchFile(tenantId, scope, userId, target.fullPath)
  }

  private async listRecords(
    tenantId: string,
    scope: MemoryScope,
    options: {
      kinds?: LongTermMemoryTypeEnum[]
      semanticKinds?: SemanticMemoryKind[]
      includeArchived?: boolean
      includeFrozen?: boolean
      audience?: MemoryAudience | 'all'
      userId?: string | null
      ownerUserId?: string | null
    }
  ) {
    const layers = this.resolveLayersForOptions(scope, options)
    const groups = await Promise.all(
      layers.map(async (layer) => {
        const headers = await this.scanHeadersInLayer(tenantId, layer, {
          kinds: options.kinds,
          semanticKinds: options.semanticKinds,
          includeArchived: options.includeArchived,
          includeFrozen: options.includeFrozen,
          audience: layer.audience
        })
        return Promise.all(headers.map((header) => this.readRecord(tenantId, header.filePath, layer)))
      })
    )
    return groups.flat().sort(compareLayeredRecords)
  }

  private resolveTargetLayer(
    input: Pick<
      MemoryUpsertInput,
      'scope' | 'audience' | 'ownerUserId' | 'kind' | 'title' | 'content' | 'context' | 'tags' | 'createdBy'
    >
  ): MemoryLayer {
    const audience = this.writePolicy.resolveAudience({
      kind: input.kind,
      title: input.title,
      content: input.content,
      context: input.context,
      tags: input.tags,
      explicitAudience: input.audience
    })
    const ownerUserId = audience === 'user' ? (input.ownerUserId ?? input.createdBy) : undefined
    return {
      scope: input.scope,
      audience,
      ownerUserId,
      layerLabel: audience === 'user' ? 'My Memory' : 'Shared Memory'
    }
  }

  private resolveLayersForOptions(
    scope: MemoryScope,
    options: {
      userId?: string | null
      audience?: MemoryAudience | 'all'
      ownerUserId?: string | null
    }
  ) {
    const audience = options.audience ?? (options.userId ? 'all' : 'shared')
    if (audience === 'user') {
      if (!options.userId && !options.ownerUserId) {
        return []
      }
      return [
        {
          scope,
          audience: 'user' as const,
          ownerUserId: options.ownerUserId ?? options.userId ?? undefined,
          layerLabel: 'My Memory'
        }
      ]
    }
    if (audience === 'shared') {
      return [
        {
          scope,
          audience: 'shared' as const,
          layerLabel: 'Shared Memory'
        }
      ]
    }
    if (options.userId) {
      return this.resolveVisibleLayers(scope, options.userId, 'all')
    }
    return [
      {
        scope,
        audience: 'shared' as const,
        layerLabel: 'Shared Memory'
      }
    ]
  }

  private resolveWorkbenchLayer(scope: MemoryScope, userId: string, layerKey: MemoryWorkbenchLayerKey) {
    const audience = layerKey === 'my' ? 'user' : 'shared'
    const layers = this.resolveVisibleLayers(scope, userId, audience)
    const layer = layers[0]
    if (!layer) {
      throw new BadRequestException(`Memory layer "${layerKey}" is not available`)
    }
    return layer
  }

  private async listWorkbenchLayerEntries(
    tenantId: string,
    layer: MemoryLayer,
    layerKey: MemoryWorkbenchLayerKey
  ): Promise<TFileDirectory[]> {
    const headers = await this.readHeaderManifest(tenantId, layer)
    const directoryNames = Array.from(
      new Set(
        headers
          .map((header) => inferRelativeMemoryPath(header.filePath).split('/')[0]?.trim())
          .filter(Boolean)
      )
    ).sort((left, right) => left.localeCompare(right))

    return [
      createWorkbenchIndexNode(layerKey),
      ...directoryNames.map((directoryName) => createWorkbenchDirectoryNode(layerKey, directoryName))
    ]
  }

  private async listWorkbenchDirectoryEntries(
    tenantId: string,
    layer: MemoryLayer,
    layerKey: MemoryWorkbenchLayerKey,
    directoryPath: string
  ): Promise<TFileDirectory[]> {
    const normalizedDirectoryPath = normalizeRelativePath(directoryPath)
    if (!isMemoryDirectoryPath(normalizedDirectoryPath)) {
      return []
    }

    const directoryName = normalizedDirectoryPath.split('/')[0]
    const headers = await this.readHeaderManifest(tenantId, layer)
    return headers
      .filter((header) => inferRelativeMemoryPath(header.filePath).startsWith(`${directoryName}/`))
      .map((header) => createWorkbenchRecordNode(layerKey, header))
  }

  private layerCacheKey(tenantId: string, layer: MemoryLayer) {
    return [
      tenantId,
      layer.scope.scopeType,
      layer.scope.scopeId,
      layer.audience,
      layer.ownerUserId ?? ''
    ].join(':')
  }

  private invalidateLayerCaches(tenantId: string, layer: MemoryLayer) {
    const cacheKey = this.layerCacheKey(tenantId, layer)
    this.entrypointCache.delete(cacheKey)
    this.headerManifestCache.delete(cacheKey)
  }

  private async readHeaderManifest(tenantId: string, layer: MemoryLayer) {
    const cacheKey = this.layerCacheKey(tenantId, layer)
    const cached = this.headerManifestCache.get(cacheKey)
    if (cached) {
      return cached
    }

    const files = await this.fileRepository.listFiles(tenantId, layer)
    const headers = (
      await Promise.all(
        files.map(async (filePath) => {
          try {
            return await this.readHeader(filePath, layer)
          } catch (error) {
            this.logger.warn(`Failed to scan memory header ${filePath}: ${getErrorMessage(error)}`)
            return null
          }
        })
      )
    )
      .filter((item): item is MemoryRecordHeader => Boolean(item))
      .sort(compareLayeredRecords)

    this.headerManifestCache.set(cacheKey, headers)
    return headers
  }

  private async scanHeadersInLayer(
    tenantId: string,
    layer: MemoryLayer,
    options: {
      kinds?: LongTermMemoryTypeEnum[]
      semanticKinds?: SemanticMemoryKind[]
      includeArchived?: boolean
      includeFrozen?: boolean
      audience?: MemoryAudience
    } = {}
  ) {
    const headers = await this.readHeaderManifest(tenantId, layer)
    return headers
      .filter((header) => matchesKindFilters(header, options))
      .filter((header) => shouldIncludeStatus(header.status, options))
      .sort(compareLayeredRecords)
  }

  private async readHeader(filePath: string, layer: MemoryLayer): Promise<MemoryRecordHeader> {
    const { content, mtimeMs } = await readFileHeader(filePath, MAX_HEADER_LINES)
    const relativePath = inferRelativeMemoryPath(filePath)
    const { frontmatter, body } = parseMemoryFile(content, createFrontmatterDefaults(layer))
    const title = frontmatter.title || extractTitleFromBody(body) || createTitle(frontmatter.kind, body, frontmatter.semanticKind)
    const parsed = parseBody(frontmatter.kind, title, body)
    const semanticKind = resolveSemanticKind({
      semanticKind: frontmatter.semanticKind,
      kind: frontmatter.kind,
      title,
      summary: frontmatter.summary,
      content: parsed.content,
      context: parsed.context,
      tags: frontmatter.tags,
      relativePath
    })
    return {
      ...frontmatter,
      title,
      semanticKind,
      summary: frontmatter.summary ?? '',
      layerLabel: layer.layerLabel,
      filePath,
      mtimeMs
    }
  }

  private async readRecord(tenantId: string, filePath: string, layer: MemoryLayer): Promise<MemoryRecord> {
    const [raw, mtimeMs] = await Promise.all([this.fileRepository.readFile(filePath), getFileMtimeMs(filePath)])
    const relativePath = inferRelativeMemoryPath(filePath)
    const { frontmatter, body } = parseMemoryFile(raw, createFrontmatterDefaults(layer))
    const resolvedTitle =
      frontmatter.title || extractTitleFromBody(body) || createTitle(frontmatter.kind, body, frontmatter.semanticKind)
    const parsed = parseBody(frontmatter.kind, resolvedTitle, body)
    const semanticKind = resolveSemanticKind({
      semanticKind: frontmatter.semanticKind,
      kind: frontmatter.kind,
      title: resolvedTitle,
      summary: frontmatter.summary,
      content: parsed.content,
      context: parsed.context,
      tags: frontmatter.tags,
      relativePath
    })

    return {
      ...frontmatter,
      title: resolvedTitle,
      semanticKind,
      layerLabel: layer.layerLabel,
      filePath,
      relativePath,
      mtimeMs,
      body,
      content: parsed.content,
      context: parsed.context,
      value:
        frontmatter.kind === LongTermMemoryTypeEnum.QA
          ? ({
              memoryId: frontmatter.id,
              question: resolvedTitle,
              answer: parsed.content,
              ...(parsed.context ? { context: parsed.context } : {})
            } as TMemoryQA)
          : ({
              memoryId: frontmatter.id,
              profile: parsed.content,
              ...(parsed.context ? { context: parsed.context } : {})
            } as TMemoryUserProfile)
    }
  }

  private async readRecordForRuntimeDetail(header: MemoryRecordHeader, layer: MemoryLayer): Promise<MemoryRecord> {
    const { content } = await readRuntimeDetailSource(header.filePath)
    const { frontmatter, body } = parseMemoryFile(content, createFrontmatterDefaults(layer))
    const title = header.title || frontmatter.title || extractTitleFromBody(body) || createTitle(header.kind, body, header.semanticKind)
    const parsed = parseBody(header.kind, title, body)
    const relativePath = inferRelativeMemoryPath(header.filePath)
    const semanticKind = resolveSemanticKind({
      semanticKind: header.semanticKind ?? frontmatter.semanticKind,
      kind: header.kind,
      title,
      summary: header.summary,
      content: parsed.content,
      context: parsed.context,
      tags: header.tags,
      relativePath
    })

    return {
      ...frontmatter,
      ...header,
      title,
      semanticKind,
      layerLabel: layer.layerLabel,
      filePath: header.filePath,
      relativePath,
      mtimeMs: header.mtimeMs,
      body,
      content: parsed.content,
      context: parsed.context,
      value:
        header.kind === LongTermMemoryTypeEnum.QA
          ? ({
              memoryId: header.id,
              question: title,
              answer: parsed.content,
              ...(parsed.context ? { context: parsed.context } : {})
            } as TMemoryQA)
          : ({
              memoryId: header.id,
              profile: parsed.content,
              ...(parsed.context ? { context: parsed.context } : {})
            } as TMemoryUserProfile)
    }
  }

  private async getRecordFromLayer(tenantId: string, layer: MemoryLayer, memoryId: string) {
    const filePath = await this.findRecordPathInLayer(tenantId, layer, memoryId)
    if (!filePath) {
      return null
    }
    return this.readRecord(tenantId, filePath, layer)
  }

  private async findRecordInLayers(tenantId: string, layers: MemoryLayer[], memoryId: string) {
    for (const layer of layers) {
      const record = await this.getRecordFromLayer(tenantId, layer, memoryId)
      if (record) {
        return { record, layer }
      }
    }
    return null
  }

  private async findRecordInLayersByRelativePath(tenantId: string, layers: MemoryLayer[], relativePath: string) {
    const normalizedRelativePath = normalizeRelativePath(relativePath)
    for (const layer of layers) {
      const headers = await this.readHeaderManifest(tenantId, layer)
      const matchedHeader = headers.find((header) => inferRelativeMemoryPath(header.filePath) === normalizedRelativePath)
      if (matchedHeader) {
        return {
          record: await this.readRecord(tenantId, matchedHeader.filePath, layer),
          layer
        }
      }
    }
    return null
  }

  private async findRecordPathInLayer(tenantId: string, layer: MemoryLayer, memoryId: string) {
    const headers = await this.readHeaderManifest(tenantId, layer)
    return headers.find((header) => header.id === memoryId)?.filePath ?? null
  }

  private resolveIndexPath(tenantId: string, layer: MemoryLayer) {
    return path.join(this.resolveLayerDirectory(tenantId, layer), MEMORY_INDEX_FILENAME)
  }

  private resolveRecordPath(
    tenantId: string,
    layer: MemoryLayer,
    kind: LongTermMemoryTypeEnum,
    semanticKind: SemanticMemoryKind,
    memoryId: string,
    title?: string | null
  ) {
    return path.join(
      this.resolveLayerDirectory(tenantId, layer),
      resolveMemoryDirectoryName({ kind, semanticKind }),
      buildMemoryFileName(title, memoryId)
    )
  }

  private async ensureLayerDirectories(tenantId: string, layer: MemoryLayer) {
    const layerDirectory = this.resolveLayerDirectory(tenantId, layer)
    await Promise.all(
      [layerDirectory, ...['profile', 'qa', 'user', 'feedback', 'project', 'reference'].map((name) => path.join(layerDirectory, name))].map(
        (directory) => fsPromises.mkdir(directory, { recursive: true })
      )
    )
  }

  private async readIndexForLayer(tenantId: string, layer: MemoryLayer) {
    const cacheKey = this.layerCacheKey(tenantId, layer)
    const cached = this.entrypointCache.get(cacheKey)
    if (typeof cached === 'string') {
      return cached
    }

    const indexPath = this.resolveIndexPath(tenantId, layer)
    try {
      const source = await this.fileRepository.readFile(indexPath)
      this.entrypointCache.set(cacheKey, source)
      return source
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return ''
      }
      throw error
    }
  }

  private async updateIndexForLayer(tenantId: string, layer: MemoryLayer) {
    await this.ensureLayerDirectories(tenantId, layer)
    const headers = await this.scanHeadersInLayer(tenantId, layer, {
      includeArchived: true,
      includeFrozen: true,
      audience: layer.audience
    })
    const indexPath = this.resolveIndexPath(tenantId, layer)
    let existing = ''
    try {
      existing = await this.fileRepository.readFile(indexPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
    const managed = renderManagedIndex(layer, headers)
    const normalized = normalizeIndexSource(existing, managed, layer)
    await this.fileRepository.writeFile(indexPath, normalized)
    this.entrypointCache.set(this.layerCacheKey(tenantId, layer), normalized)
  }

  private scoreRecord(record: MemoryRecord, query: string) {
    const titleScore = scoreText(query, record.title)
    const contentScore = scoreText(query, record.content)
    const contextScore = scoreText(query, record.context)
    const tagScore = scoreText(query, record.tags.join(' '))
    const previewScore = scoreText(query, record.summary)
    const exactTitle = includesNormalized(record.title, query) ? 0.2 : 0
    const exactBody = includesNormalized(`${record.content}\n${record.context ?? ''}`, query) ? 0.12 : 0
    const layerBoost = record.audience === 'user' ? 0.05 : 0
    const score = Math.min(
      1,
      titleScore * 0.4 +
        contentScore * 0.25 +
        contextScore * 0.12 +
        tagScore * 0.1 +
        previewScore * 0.08 +
        exactTitle +
        exactBody +
        layerBoost
    )
    return Number(score.toFixed(4))
  }
}

function createFrontmatterDefaults(layer: MemoryLayer): MemoryRecordFrontmatter {
  return {
    id: '',
    scopeType: layer.scope.scopeType,
    scopeId: layer.scope.scopeId,
    audience: layer.audience,
    ownerUserId: layer.ownerUserId ?? undefined,
    kind: LongTermMemoryTypeEnum.PROFILE,
    semanticKind: defaultSemanticKindForLegacyKind(LongTermMemoryTypeEnum.PROFILE),
    status: 'active',
    title: '',
    summary: '',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    createdBy: 'system',
    updatedBy: 'system',
    source: 'manual',
    tags: []
  }
}

function compareLayeredRecords(a: { mtimeMs: number }, b: { mtimeMs: number }) {
  return b.mtimeMs - a.mtimeMs
}

function normalizeRelativePath(value: string) {
  return value.trim().replace(/^\.?\//, '').replace(/\\/g, '/')
}

function normalizeRecordValue(
  kind: LongTermMemoryTypeEnum,
  semanticKind: SemanticMemoryKind,
  input: MemoryUpsertInput,
  existing?: MemoryRecord | null
) {
  if (kind === LongTermMemoryTypeEnum.QA) {
    const title = coalesce(input.title, existing?.title, createTitle(kind, input.content, semanticKind))
    const content = coalesce(input.content, existing?.content, '')
    const context = coalesce(input.context, existing?.context)
    return {
      title,
      content,
      context,
      body: formatBody(semanticKind, title, content, context)
    }
  }

  const title = coalesce(input.title, existing?.title, createTitle(kind, input.content, semanticKind))
  const content = coalesce(input.content, existing?.content, '')
  const context = coalesce(input.context, existing?.context)
  return {
    title,
    content,
    context,
    body: formatBody(semanticKind, title, content, context)
  }
}

function createRuntimeEntrypoint(layer: MemoryLayer, source: string): MemoryRuntimeEntrypoint {
  const trimmed = source.trim()
  const lines = trimmed ? trimmed.split('\n') : []
  const wasLineTruncated = lines.length > MAX_ENTRYPOINT_LINES
  let content = wasLineTruncated ? lines.slice(0, MAX_ENTRYPOINT_LINES).join('\n') : trimmed
  const byteLength = Buffer.byteLength(content, 'utf8')
  const wasByteTruncated = byteLength > MAX_ENTRYPOINT_BYTES
  if (wasByteTruncated) {
    let truncated = content
    while (Buffer.byteLength(truncated, 'utf8') > MAX_ENTRYPOINT_BYTES) {
      truncated = truncated.slice(0, -1)
    }
    content = truncated
  }

  const prefix = `<memory_index layer="${layer.layerLabel}" audience="${layer.audience}">`
  const suffix = `</memory_index>`
  const payload = content ? `${prefix}\n${content}\n${suffix}` : ''

  return {
    layer,
    content: payload,
    budget: {
      maxLines: MAX_ENTRYPOINT_LINES,
      maxBytes: MAX_ENTRYPOINT_BYTES,
      truncated: wasLineTruncated || wasByteTruncated,
      lineCount: lines.length,
      byteLength
    }
  }
}

function formatRuntimeDetail(record: MemoryRecord): MemoryRuntimeDetail {
  const lifecycle = buildMemoryLifecycle(record)
  const blocks = [
    `<memory_detail id="${record.id}" kind="${record.kind}" semanticKind="${record.semanticKind ?? defaultSemanticKindForLegacyKind(record.kind)}" audience="${record.audience}" layer="${record.layerLabel}">`,
    lifecycle.freshnessNote || `saved: ${lifecycle.ageText}`,
    `title: ${record.title}`,
    'content:',
    record.content.trim(),
    record.context ? `context:\n${record.context.trim()}` : '',
    '</memory_detail>'
  ].filter(Boolean)

  let content = blocks.join('\n')
  if (content.split('\n').length > MAX_MEMORY_LINES) {
    content = content.split('\n').slice(0, MAX_MEMORY_LINES).join('\n')
  }
  while (Buffer.byteLength(content, 'utf8') > MAX_MEMORY_BYTES) {
    content = content.slice(0, -1)
  }

  return {
    record,
    content,
    freshnessNote: lifecycle.freshnessNote,
    byteLength: Buffer.byteLength(content, 'utf8')
  }
}

function renderManagedIndex(layer: MemoryLayer, headers: MemoryRecordHeader[]) {
  const lines = headers
    .filter((header) => header.status !== 'archived')
    .sort(compareLayeredRecords)
    .map((header) => {
      const relativePath = inferRelativeMemoryPath(header.filePath)
      const hook = header.summary || header.title
      return `- [${header.title}](${relativePath}) - ${hook}`
    })
  return [INDEX_MANAGED_START, ...lines, INDEX_MANAGED_END].join('\n')
}

function normalizeIndexSource(existing: string, managed: string, layer: MemoryLayer) {
  const header = [
    `# ${layer.layerLabel}`,
    '',
    'This file is an index of durable memories. Keep entries short and store full content in the linked memory files.'
  ].join('\n')

  if (!existing.trim()) {
    return `${header}\n\n${managed}\n`
  }

  if (existing.includes(INDEX_MANAGED_START) && existing.includes(INDEX_MANAGED_END)) {
    return `${existing.replace(new RegExp(`${escapeRegex(INDEX_MANAGED_START)}[\\s\\S]*?${escapeRegex(INDEX_MANAGED_END)}`), managed).trimEnd()}\n`
  }

  return `${existing.trimEnd()}\n\n${managed}\n`
}

function serializeMemoryFile(frontmatter: MemoryRecordFrontmatter, body: string) {
  const normalizedBody = `${body.trim()}\n`
  const yamlContent = yaml.stringify(frontmatter).trim()
  return `---\n${yamlContent}\n---\n\n${normalizedBody}`
}

function parseMemoryFile(source: string, defaults: MemoryRecordFrontmatter) {
  const trimmed = source.trim()
  if (!trimmed.startsWith('---')) {
    return {
      frontmatter: defaults,
      body: trimmed
    }
  }

  const match = trimmed.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) {
    return {
      frontmatter: defaults,
      body: trimmed
    }
  }

  const parsed = (yaml.parse(match[1]) ?? {}) as Partial<MemoryRecordFrontmatter>
  return {
    frontmatter: {
      ...defaults,
      ...parsed,
      tags: normalizeTags(parsed.tags ?? defaults.tags)
    },
    body: (match[2] ?? '').trim()
  }
}

function parseBody(kind: LongTermMemoryTypeEnum, title: string, body: string) {
  const content = body.trim()
  const titlePattern = new RegExp(`^#\\s+${escapeRegex(title)}\\s*`, 'i')
  const withoutTitle = content.replace(titlePattern, '').trim()
  const contextMatch = withoutTitle.match(MEMORY_CONTEXT_SECTION_PATTERN)
  const context = contextMatch?.[1]?.trim()
  const contentWithoutContext = contextMatch ? withoutTitle.slice(0, contextMatch.index).trim() : withoutTitle
  const normalizedContent = contentWithoutContext.replace(/^##\s+[^\n]+\n/i, '').trim()
  return {
    content: normalizedContent,
    context: context || undefined
  }
}

function formatBody(semanticKind: SemanticMemoryKind, title: string, content: string, context?: string) {
  const section = sectionHeadingForSemanticKind(semanticKind)
  return [
    `# ${title}`,
    '',
    `## ${section}`,
    content.trim(),
    context ? `\n## ${MEMORY_CONTEXT_SECTION_HEADING}\n${context.trim()}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

function extractTitleFromBody(body: string) {
  const match = body.match(/^#\s+(.+)$/m)
  return match?.[1]?.trim()
}

function createTitle(kind: LongTermMemoryTypeEnum, raw?: string | null, semanticKind?: SemanticMemoryKind | null) {
  const cleaned = (raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  if (cleaned) {
    return cleaned
  }
  if (semanticKind === 'feedback') {
    return '未命名反馈记忆'
  }
  if (semanticKind === 'project') {
    return '未命名项目记忆'
  }
  if (semanticKind === 'reference') {
    return '未命名参考记忆'
  }
  return kind === LongTermMemoryTypeEnum.QA ? '未命名问答记忆' : '未命名用户记忆'
}

function buildMemoryFileName(title: string | null | undefined, memoryId: string) {
  const slug = (title ?? 'memory')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return `${slug || 'memory'}-${memoryId}.md`
}

function createPreview(content?: string | null, context?: string | null) {
  const merged = [content, context].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  return merged.slice(0, 160)
}

function buildMemoryLifecycle(record: { status: MemoryRecordStatus; mtimeMs: number }) {
  const freshnessText = memoryFreshnessText(record.mtimeMs)
  return {
    ageText: memoryAge(record.mtimeMs),
    freshnessNote: freshnessText || null,
    recallEligible: record.status === 'active'
  }
}

function layerFromHeader(header: MemoryRecordHeader): MemoryLayer {
  return {
    scope: {
      scopeType: header.scopeType,
      scopeId: header.scopeId
    },
    audience: header.audience,
    ownerUserId: header.ownerUserId,
    layerLabel: header.layerLabel
  }
}

function shouldIncludeStatus(
  status: MemoryRecordStatus,
  options: {
    includeArchived?: boolean
    includeFrozen?: boolean
  }
) {
  if (status === 'archived') {
    return Boolean(options.includeArchived)
  }
  if (status === 'frozen') {
    return options.includeFrozen !== false
  }
  return true
}

function normalizeStatus(status: MemoryRecordStatus) {
  if (status === 'archived' || status === 'frozen') {
    return status
  }
  return 'active'
}

function normalizeTags(tags?: string[] | null) {
  return Array.from(
    new Set(
      (tags ?? [])
        .filter(Boolean)
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  )
}

async function readFileHeader(filePath: string, maxLines: number) {
  const [content, mtimeMs] = await Promise.all([
    readFilePrefix(filePath, {
      maxLines,
      maxBytes: 12_288,
      requireClosedFrontmatter: true
    }),
    getFileMtimeMs(filePath)
  ])
  return {
    content,
    mtimeMs
  }
}

async function readRuntimeDetailSource(filePath: string) {
  const content = await readFilePrefix(filePath, {
    maxLines: MAX_MEMORY_LINES + MAX_HEADER_LINES,
    maxBytes: 12_288,
    requireClosedFrontmatter: true
  })
  return {
    content
  }
}

async function getFileMtimeMs(filePath: string) {
  const stats = await fsPromises.stat(filePath)
  return Math.floor(stats.mtimeMs)
}

async function readFilePrefix(
  filePath: string,
  options: {
    maxLines: number
    maxBytes: number
    requireClosedFrontmatter?: boolean
  }
) {
  const fileHandle = await fsPromises.open(filePath, 'r')
  try {
    const chunks: Buffer[] = []
    const chunkSize = 2_048
    const absoluteMaxBytes = Math.max(options.maxBytes, 4_096) + 16_384
    let offset = 0
    let content = ''
    let sawEof = false

    while (offset < absoluteMaxBytes) {
      const buffer = Buffer.alloc(Math.min(chunkSize, absoluteMaxBytes - offset))
      const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, offset)
      if (bytesRead <= 0) {
        sawEof = true
        break
      }
      chunks.push(buffer.subarray(0, bytesRead))
      offset += bytesRead
      content = Buffer.concat(chunks).toString('utf8')

      const lineCount = content.split('\n').length
      const byteLength = Buffer.byteLength(content, 'utf8')
      const closedFrontmatter = !options.requireClosedFrontmatter || !content.startsWith('---') || hasClosedFrontmatter(content)
      if (closedFrontmatter && (lineCount >= options.maxLines || byteLength >= options.maxBytes)) {
        break
      }
    }

    if (!sawEof && Buffer.byteLength(content, 'utf8') > options.maxBytes) {
      let trimmed = content
      while (Buffer.byteLength(trimmed, 'utf8') > options.maxBytes && trimmed.length > 0) {
        trimmed = trimmed.slice(0, -1)
      }
      return trimmed
    }

    return content
  } finally {
    await fileHandle.close()
  }
}

function tokenize(value?: string | null) {
  const chunks = (value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)

  const tokens = new Set<string>()
  for (const chunk of chunks) {
    if (chunk.length > 1) {
      tokens.add(chunk)
    }
    if (containsHan(chunk)) {
      const chars = Array.from(chunk).filter(Boolean)
      for (const char of chars) {
        if (containsHan(char)) {
          tokens.add(char)
        }
      }
      for (let size = 2; size <= Math.min(4, chars.length); size++) {
        for (let index = 0; index <= chars.length - size; index++) {
          tokens.add(chars.slice(index, index + size).join(''))
        }
      }
    }
  }
  return tokens
}

function scoreText(query: string, text?: string | null) {
  const queryTokens = Array.from(tokenize(query))
  if (!queryTokens.length) {
    return 0
  }
  const textTokens = tokenize(text)
  if (!textTokens.size) {
    return 0
  }
  let matched = 0
  queryTokens.forEach((token) => {
    if (textTokens.has(token)) {
      matched += 1
    }
  })
  const ratio = matched / queryTokens.length
  const exact = includesNormalized(text, query) ? 0.2 : 0
  return Math.min(1, ratio + exact)
}

function matchesKindFilters(
  header: MemoryRecordHeader,
  options: {
    kinds?: LongTermMemoryTypeEnum[]
    semanticKinds?: SemanticMemoryKind[]
  }
) {
  if (options.kinds?.length && !options.kinds.includes(header.kind)) {
    return false
  }
  if (options.semanticKinds?.length && !options.semanticKinds.includes(header.semanticKind ?? defaultSemanticKindForLegacyKind(header.kind))) {
    return false
  }
  return true
}

function includesNormalized(text?: string | null, query?: string | null) {
  const left = (text ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  const right = (query ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  return Boolean(left && right && left.includes(right))
}

function containsHan(value: string) {
  return /\p{Script=Han}/u.test(value)
}

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasClosedFrontmatter(source: string) {
  return /^---\n[\s\S]*?\n---\n?/m.test(source)
}

function coalesce(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function parseMemoryWorkbenchPath(value?: string | null) {
  const fullPath = normalizeRelativePath(value ?? '')
  if (!fullPath) {
    return {
      layerKey: null as MemoryWorkbenchLayerKey | null,
      relativePath: '',
      fullPath: ''
    }
  }

  const [layerKey, ...rest] = fullPath.split('/')
  if (!MEMORY_WORKBENCH_ROOTS.includes(layerKey as MemoryWorkbenchLayerKey)) {
    throw new BadRequestException(`Unsupported memory path "${value}"`)
  }

  return {
    layerKey: layerKey as MemoryWorkbenchLayerKey,
    relativePath: rest.join('/'),
    fullPath
  }
}

function createWorkbenchRootNode(layerKey: MemoryWorkbenchLayerKey): TFileDirectory {
  return {
    filePath: layerKey,
    fullPath: layerKey,
    directory: '',
    hasChildren: true,
    children: null
  }
}

function createWorkbenchIndexNode(layerKey: MemoryWorkbenchLayerKey): TFileDirectory {
  const fullPath = `${layerKey}/${MEMORY_INDEX_FILENAME}`
  return {
    filePath: MEMORY_INDEX_FILENAME,
    fullPath,
    directory: layerKey,
    hasChildren: false
  }
}

function createWorkbenchDirectoryNode(layerKey: MemoryWorkbenchLayerKey, directoryName: string): TFileDirectory {
  const fullPath = `${layerKey}/${directoryName}`
  return {
    filePath: directoryName,
    fullPath,
    directory: layerKey,
    hasChildren: true,
    children: null
  }
}

function createWorkbenchRecordNode(layerKey: MemoryWorkbenchLayerKey, header: MemoryRecordHeader): TFileDirectory {
  const relativePath = inferRelativeMemoryPath(header.filePath)
  return {
    filePath: path.basename(relativePath),
    fullPath: `${layerKey}/${relativePath}`,
    directory: `${layerKey}/${path.posix.dirname(relativePath)}`.replace(/\/\.$/, ''),
    hasChildren: false,
    createdAt: new Date(header.mtimeMs),
    description: header.summary,
    fileType: getFileExtension(relativePath)
  }
}

function createWorkbenchFile(options: {
  logicalPath: string
  contents: string
  description?: string
  mtimeMs?: number
}): TFile {
  return {
    filePath: normalizeRelativePath(options.logicalPath),
    fileType: getFileExtension(options.logicalPath) || 'md',
    mimeType: 'text/markdown; charset=utf-8',
    contents: options.contents,
    size: Buffer.byteLength(options.contents ?? '', 'utf8'),
    createdAt: options.mtimeMs ? new Date(options.mtimeMs) : undefined,
    description: options.description
  }
}

function isMemoryIndexPath(relativePath: string) {
  return normalizeRelativePath(relativePath) === MEMORY_INDEX_FILENAME
}

function isMemoryDirectoryPath(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath)
  return Boolean(normalized && !normalized.includes('/') && normalized !== MEMORY_INDEX_FILENAME)
}

function isMemoryRecordPath(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath)
  const segments = normalized.split('/').filter(Boolean)
  return segments.length === 2 && segments[1].toLowerCase().endsWith('.md')
}

function getFileExtension(filePath: string) {
  return normalizeRelativePath(filePath).split('.').pop()?.toLowerCase() ?? ''
}

function toFrontmatter(record: MemoryRecord): MemoryRecordFrontmatter {
  return {
    id: record.id,
    scopeType: record.scopeType,
    scopeId: record.scopeId,
    audience: record.audience,
    ownerUserId: record.ownerUserId ?? undefined,
    kind: record.kind,
    semanticKind: record.semanticKind,
    status: record.status,
    title: record.title,
    summary: record.summary,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    createdBy: record.createdBy,
    updatedBy: record.updatedBy,
    source: record.source,
    sourceRef: record.sourceRef,
    tags: record.tags
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return typeof error === 'string' ? error : JSON.stringify(error)
}
