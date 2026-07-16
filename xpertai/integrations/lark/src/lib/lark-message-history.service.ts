import type * as lark from '@larksuiteoapi/node-sdk'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type AgentMiddlewareRuntimeCapabilityRegistry,
  type WorkspaceFileCatalog,
  type WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'
import { Readable } from 'node:stream'
import { createHash, randomUUID } from 'node:crypto'
import type { Cache } from 'cache-manager'
import {
  And,
  Brackets,
  In,
  LessThan,
  LessThanOrEqual,
  MoreThan,
  Not,
  type FindOptionsWhere,
  type FindOperator,
  type Repository,
  type SelectQueryBuilder
} from 'typeorm'
import {
  LarkMessageFileEntity,
  LarkMessageLogEntity,
  type LarkMessageDirection,
  type LarkMessageLogStatus
} from './entities/index.js'
import { LarkChannelStrategy } from './lark-channel.strategy.js'
import type { LarkInboundFile, LarkMessageResourceType, NormalizedMessageResourceRef } from './types.js'

const DEFAULT_HISTORY_LIMIT = 20
const MAX_HISTORY_LIMIT = 100
const DEFAULT_HISTORY_WINDOW_SECONDS = 3600
const DEFAULT_MAX_HISTORY_FILES = 20
const MAX_HISTORY_FILES = 20
const DEFAULT_MAX_FILE_SIZE_MB = 10
const FILE_PROCESSING_LEASE_MS = 15 * 60 * 1000
const MAX_CONTEXT_ITEM_CHARS = 1000
const MAX_CONTEXT_TOTAL_CHARS = 12000
const DEFAULT_RETENTION_DAYS = 30
const CONTEXT_RESET_CONTENT = 'history_context_reset'
const ADMIN_TOTAL_CACHE_TTL_MS = 15 * 60 * 1000
const ADMIN_TOTAL_CACHE_PREFIX = 'plugin_lark:admin_message_total'
export const LARK_ADMIN_SEARCH_FIELDS = [
  'id',
  'messageId',
  'runId',
  'scopeKey',
  'chatId',
  'senderOpenId',
  'senderName',
  'messageType',
  'content',
  'error',
  'conversationId',
  'xpertId',
  'direction',
  'status'
] as const

export function buildAdminSearchExpression(alias?: string): string {
  const prefix = alias ? `${alias}.` : ''
  return `LOWER(${LARK_ADMIN_SEARCH_FIELDS.map(
    (field) => `COALESCE(CAST(${prefix}${field} AS text), '')`
  ).join(" || ' ' || ")})`
}

export type LarkHistoryScope = {
  integrationId: string
  scopeKey: string
  xpertId: string
  tenantId?: string | null
  organizationId?: string | null
}

export type CaptureLarkInboundInput = LarkHistoryScope & {
  messageId: string
  chatType?: 'p2p' | 'group' | null
  chatId?: string | null
  senderOpenId?: string | null
  senderName?: string | null
  messageType?: string | null
  content?: string | null
  botMentioned?: boolean
  messageCreatedAt?: Date | string | number | null
  resourceRefs?: NormalizedMessageResourceRef[] | null
  status?: Extract<LarkMessageLogStatus, 'received' | 'history_only' | 'dispatched' | 'failed'>
  conversationId?: string | null
  createdById?: string | null
}

export type UpdateLarkInboundLogsPatch = {
  status: LarkMessageLogStatus
  error?: string | null
  conversationId?: string | null
}

export type MaterializeLarkFilesInput = Pick<
  LarkHistoryScope,
  'integrationId' | 'xpertId' | 'tenantId' | 'organizationId'
> & {
  messageLogIds: string[]
  maxSizeMb?: number | null
  maxFiles?: number | null
  inlineImageContent?: boolean
}

export type BuildLarkHistoryBundleInput = LarkHistoryScope & {
  limit?: number | null
  windowSeconds?: number | null
  before?: Date | string | number | null
  excludedLogIds?: string[] | null
  maxFiles?: number | null
  maxFileSizeMb?: number | null
  respectContextReset?: boolean
}

export type LarkHistoryBundle = {
  context?: string
  files?: LarkInboundFile[]
  messageLogIds: string[]
  resetAt?: Date
}

export type RecordLarkOutboundInput = LarkHistoryScope & {
  runId: string
  status: Extract<LarkMessageLogStatus, 'queued' | 'dispatched' | 'sent' | 'failed'>
  content?: string | null
  messageId?: string | null
  conversationId?: string | null
  error?: string | null
  sentAt?: Date | string | number | null
  createdById?: string | null
}

export type MarkLarkContextResetInput = LarkHistoryScope & {
  conversationId?: string | null
  createdById?: string | null
}

export type SearchLarkHistoryInput = LarkHistoryScope & {
  keyword?: string | null
  direction?: 'inbound' | 'outbound' | 'both' | null
  senderOpenId?: string | null
  before?: Date | string | number | null
  after?: Date | string | number | null
  cursor?: string | null
  limit?: number | null
  excludedLogIds?: string[] | null
  respectContextReset?: boolean
  includeFiles?: boolean | null
  hasAttachments?: boolean | null
}

export type LarkHistoryItem = {
  id: string
  direction: LarkMessageDirection
  status: LarkMessageLogStatus
  senderOpenId: string | null
  senderName: string | null
  content: string
  messageId: string | null
  messageType: string | null
  createdAt: Date
  messageCreatedAt: Date | null
  sentAt: Date | null
}

export type ListLarkMessageLogsInput = {
  integrationId: string
  tenantId?: string | null
  organizationId?: string | null
  scopeKey?: string | null
  xpertId?: string | null
  direction?: LarkMessageDirection | null
  status?: LarkMessageLogStatus | null
  search?: string | null
  cursor?: string | null
  page?: number | null
  pageSize?: number | null
  sortBy?: 'createdAt' | 'messageCreatedAt' | 'direction' | 'status' | 'senderName' | 'botMentioned' | null
  sortDirection?: 'asc' | 'desc' | null
}

type LarkAdminMessageSortBy = NonNullable<ListLarkMessageLogsInput['sortBy']>

type LarkAdminMessageCursor = {
  sortBy: LarkAdminMessageSortBy
  sortDirection: 'ASC' | 'DESC'
  sortValue: string | boolean | Date | null
  id: string
  queryFingerprint: string
  sessionId: string
}

export type CleanupExpiredLarkHistoryInput = {
  integrationId?: string | null
  tenantId?: string | null
  organizationId?: string | null
  olderThan?: Date | string | number | null
  retentionDays?: number | null
  batchSize?: number | null
  afterCreatedAt?: Date | string | number | null
  afterId?: string | null
}

type LarkMessageResourceDownload = {
  headers?: Record<string, unknown>
  getReadableStream: () => Readable
}

export type MaterializeFailure = {
  fileId: string
  messageLogId: string
  resourceKey: string
  error: string
  retryable: boolean
}

@Injectable()
export class LarkMessageHistoryService {
  private readonly logger = new Logger(LarkMessageHistoryService.name)

  constructor(
    @InjectRepository(LarkMessageLogEntity)
    private readonly messageLogRepository: Repository<LarkMessageLogEntity>,
    @InjectRepository(LarkMessageFileEntity)
    private readonly messageFileRepository: Repository<LarkMessageFileEntity>,
    private readonly larkChannel: LarkChannelStrategy,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: AgentMiddlewareRuntimeCapabilityRegistry,
    @Optional()
    @Inject(CACHE_MANAGER)
    private readonly cacheManager?: Cache
  ) {}

  /** Store every inbound event, including non-mention group messages, exactly once. */
  async captureInbound(input: CaptureLarkInboundInput): Promise<{ log: LarkMessageLogEntity; created: boolean }> {
    const integrationId = requireText(input.integrationId, 'integrationId')
    const scopeKey = requireText(input.scopeKey, 'scopeKey')
    const xpertId = requireText(input.xpertId, 'xpertId')
    const messageId = requireText(input.messageId, 'messageId')

    let existing = await this.messageLogRepository.findOne({
      where: {
        integrationId,
        direction: 'inbound',
        messageId
      }
    })
    if (existing) {
      await this.ensureResourceRows(existing, input)
      return { log: existing, created: false }
    }

    const candidate = this.messageLogRepository.create({
      integrationId,
      messageId,
      scopeKey,
      xpertId,
      conversationId: optionalText(input.conversationId),
      chatType: input.chatType === 'p2p' || input.chatType === 'group' ? input.chatType : null,
      chatId: optionalText(input.chatId),
      senderOpenId: optionalText(input.senderOpenId),
      senderName: optionalText(input.senderName),
      messageType: optionalText(input.messageType),
      botMentioned: input.botMentioned === true,
      direction: 'inbound',
      status: input.status ?? 'received',
      content: optionalText(input.content),
      messageCreatedAt: toDate(input.messageCreatedAt),
      tenantId: optionalText(input.tenantId),
      organizationId: optionalText(input.organizationId),
      createdById: optionalText(input.createdById),
      updatedById: optionalText(input.createdById)
    })

    let created = true
    try {
      existing = await this.messageLogRepository.save(candidate)
    } catch (error) {
      // Webhook and long-connection delivery can race. The unique key is the final arbiter.
      existing = await this.messageLogRepository.findOne({
        where: { integrationId, direction: 'inbound', messageId }
      })
      if (!existing) {
        throw error
      }
      created = false
    }

    await this.ensureResourceRows(existing, input)
    return { log: existing, created }
  }

  /** Update only inbound rows represented by the current dispatch/window. */
  async updateLogs(ids: string[], patch: UpdateLarkInboundLogsPatch): Promise<LarkMessageLogEntity[]> {
    const normalizedIds = uniqueTexts(ids)
    if (!normalizedIds.length) {
      return []
    }

    await this.messageLogRepository.update(
      { id: In(normalizedIds), direction: 'inbound' },
      {
        status: patch.status,
        ...(patch.error !== undefined ? { error: truncateText(patch.error, 1024) || null } : {}),
        ...(patch.conversationId !== undefined ? { conversationId: optionalText(patch.conversationId) ?? null } : {})
      }
    )

    return this.messageLogRepository.find({
      where: { id: In(normalizedIds), direction: 'inbound' },
      order: { createdAt: 'ASC', id: 'ASC' }
    })
  }

  async updateInboundStatus(
    ids: string[],
    status: LarkMessageLogStatus,
    error?: string | null,
    conversationId?: string | null
  ): Promise<LarkMessageLogEntity[]> {
    return this.updateLogs(ids, {
      status,
      ...(error !== undefined ? { error } : {}),
      ...(conversationId !== undefined ? { conversationId } : {})
    })
  }

  /** Atomically claim captured rows so duplicate callbacks cannot enqueue the same message twice. */
  async claimInboundStatus(
    ids: string[],
    fromStatuses: Array<Extract<LarkMessageLogStatus, 'received' | 'failed' | 'dispatched'>>,
    status: Extract<LarkMessageLogStatus, 'queued' | 'history_only'>
  ): Promise<boolean> {
    const normalizedIds = uniqueTexts(ids)
    if (!normalizedIds.length) {
      return true
    }
    const result = await this.messageLogRepository.update(
      {
        id: In(normalizedIds),
        direction: 'inbound',
        status: In(fromStatuses)
      },
      { status, error: null }
    )
    return result.affected === normalizedIds.length
  }

  async areInboundLogsInStatus(ids: string[], status: LarkMessageLogStatus): Promise<boolean> {
    const normalizedIds = uniqueTexts(ids)
    if (!normalizedIds.length) {
      return false
    }
    const count = await this.messageLogRepository.count({
      where: {
        id: In(normalizedIds),
        direction: 'inbound',
        status
      }
    })
    return count === normalizedIds.length
  }

  async areInboundLogsInStatusWithError(
    ids: string[],
    status: LarkMessageLogStatus,
    error: string
  ): Promise<boolean> {
    const normalizedIds = uniqueTexts(ids)
    if (!normalizedIds.length) {
      return false
    }
    const count = await this.messageLogRepository.count({
      where: {
        id: In(normalizedIds),
        direction: 'inbound',
        status,
        error
      }
    })
    return count === normalizedIds.length
  }

  /**
   * Download pending message resources with the native Lark SDK, then register them
   * in the platform workspace. This deliberately does not call LarkContextToolService.
   */
  async materializeFiles(input: MaterializeLarkFilesInput): Promise<{
    files: LarkInboundFile[]
    failed: MaterializeFailure[]
    nextLeaseAt?: Date
  }> {
    const integrationId = requireText(input.integrationId, 'integrationId')
    const xpertId = requireText(input.xpertId, 'xpertId')
    const messageLogIds = uniqueTexts(input.messageLogIds)
    if (!messageLogIds.length) {
      return { files: [], failed: [] }
    }

    const maxFiles = normalizeMaxFiles(input.maxFiles)
    const maxBytes = normalizeMaxFileBytes(input.maxSizeMb)
    const rows = await this.messageFileRepository.find({
      where: this.scopedFileWhere(
        {
          integrationId,
          xpertId,
          messageLogId: In(messageLogIds)
        },
        input
      ),
      order: { createdAt: 'ASC', id: 'ASC' }
    })
    const processingLeaseCutoff = new Date(Date.now() - FILE_PROCESSING_LEASE_MS)
    const freshProcessing = rows.filter(
      (row) => row.status === 'processing' && row.updatedAt && row.updatedAt > processingLeaseCutoff
    )
    const pending = rows.filter(
      (row) =>
        row.status === 'pending' ||
        (row.status === 'failed' && !/^file_size_exceeded:/i.test(row.error ?? '')) ||
        (row.status === 'processing' && (!row.updatedAt || row.updatedAt <= processingLeaseCutoff))
    )
    const failed: MaterializeFailure[] = []
    let client: lark.Client | undefined
    let workspaceFiles = pending.length ? this.requireWorkspaceFiles() : undefined

    for (const row of pending) {
      const claimWhere =
        row.status === 'processing'
          ? { id: row.id, status: 'processing' as const, updatedAt: LessThanOrEqual(processingLeaseCutoff) }
          : { id: row.id, status: In(['pending', 'failed']) }
      const claimed = await this.messageFileRepository.update(
        claimWhere,
        {
          status: 'processing',
          error: null
        }
      )
      if (claimed.affected !== 1) {
        continue
      }
      row.status = 'processing'
      row.error = null
      try {
        if (!row.filePath) {
          client ??= await this.larkChannel.getOrCreateLarkClientById(integrationId)
        }
        await this.materializeOneFile(client, workspaceFiles!, row, {
          integrationId,
          xpertId,
          tenantId: optionalText(input.tenantId),
          organizationId: optionalText(input.organizationId),
          maxBytes
        })
      } catch (error) {
        const message = truncateText(getErrorMessage(error), 1024) || 'lark_resource_materialization_failed'
        const retryable = !isPermanentMaterializationError(message)
        row.status = 'failed'
        row.error = message
        await this.messageFileRepository.save(row)
        failed.push({
          fileId: row.id,
          messageLogId: row.messageLogId,
          resourceKey: row.resourceKey,
          error: message,
          retryable
        })
      }
    }

    const readyRows = await this.messageFileRepository.find({
      where: this.scopedFileWhere(
        {
          integrationId,
          xpertId,
          messageLogId: In(messageLogIds),
          status: 'ready'
        },
        input
      ),
      order: { createdAt: 'ASC', id: 'ASC' },
      take: maxFiles
    })

    const shouldInlineImages = Boolean(input.inlineImageContent && readyRows.some((row) => row.resourceType === 'image'))
    if (shouldInlineImages) {
      workspaceFiles ??= this.requireWorkspaceFiles()
    }
    const files = shouldInlineImages
      ? await Promise.all(
          readyRows.slice(0, maxFiles).map((row) => this.toDispatchInboundFile(workspaceFiles!, row))
        )
      : readyRows.slice(0, maxFiles).map((row) => this.toInboundFile(row))

    return {
      files,
      failed,
      ...(freshProcessing.length
        ? {
            nextLeaseAt: new Date(
              Math.min(...freshProcessing.map((row) => row.updatedAt.getTime())) + FILE_PROCESSING_LEASE_MS
            )
          }
        : {})
    }
  }

  /** Build automatic local context bounded by scope, reset marker, time, count and files. */
  async buildHistoryBundle(input: BuildLarkHistoryBundleInput): Promise<LarkHistoryBundle> {
    const integrationId = requireText(input.integrationId, 'integrationId')
    const scopeKey = requireText(input.scopeKey, 'scopeKey')
    const xpertId = requireText(input.xpertId, 'xpertId')
    const limit = normalizeHistoryLimit(input.limit)
    const before = toDate(input.before) ?? new Date()
    const maxFiles = normalizeMaxFiles(input.maxFiles)
    if (!limit) {
      return { messageLogIds: [] }
    }

    const scope = { ...input, integrationId, scopeKey, xpertId }
    const resetMarker =
      input.respectContextReset === false
        ? null
        : await this.messageLogRepository.findOne({
            where: this.scopedLogWhere(
              {
                integrationId,
                scopeKey,
                xpertId,
                direction: 'system',
                status: 'context_reset',
                createdAt: LessThan(before)
              },
              scope
            ),
            order: { createdAt: 'DESC', id: 'DESC' }
          })

    const lowerBound = this.resolveHistoryLowerBound(before, input.windowSeconds, resetMarker?.createdAt)
    const createdAt = this.historyDateRange(before, lowerBound)
    const excludedLogIds = uniqueTexts(input.excludedLogIds ?? [])
    const commonWhere = {
      integrationId,
      scopeKey,
      xpertId,
      createdAt,
      ...(excludedLogIds.length ? { id: Not(In(excludedLogIds)) } : {})
    }
    const logs = await this.messageLogRepository.find({
      where: [
        this.scopedLogWhere(
          {
            ...commonWhere,
            direction: 'inbound',
            status: In(['dispatched', 'history_only'] satisfies LarkMessageLogStatus[])
          },
          scope
        ),
        this.scopedLogWhere(
          {
            ...commonWhere,
            direction: 'outbound',
            status: 'sent'
          },
          scope
        )
      ],
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit
    })
    const chronologicalLogs = logs.reverse()
    const messageLogIds = chronologicalLogs.map((log) => log.id)
    if (!messageLogIds.length) {
      return {
        messageLogIds,
        ...(resetMarker?.createdAt ? { resetAt: resetMarker.createdAt } : {})
      }
    }

    try {
      await this.materializeFiles({
        integrationId,
        xpertId,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        messageLogIds,
        maxFiles,
        maxSizeMb: input.maxFileSizeMb
      })
    } catch (error) {
      // Text history remains useful if the workspace capability is temporarily unavailable.
      this.logger.warn(`Failed to materialize Lark history files: ${getErrorMessage(error)}`)
    }

    const fileRows = await this.messageFileRepository.find({
      where: this.scopedFileWhere(
        {
          integrationId,
          xpertId,
          messageLogId: In(messageLogIds)
        },
        scope
      ),
      order: { createdAt: 'ASC', id: 'ASC' }
    })
    const filesByLogId = groupFilesByLogId(fileRows)
    const readyFiles = fileRows
      .filter((row) => row.status === 'ready')
      .slice(0, maxFiles)
      .map((row) => this.toInboundFile(row))
    const context = this.formatHistoryContext(chronologicalLogs, filesByLogId)

    return {
      ...(context ? { context } : {}),
      ...(readyFiles.length ? { files: readyFiles } : {}),
      messageLogIds,
      ...(resetMarker?.createdAt ? { resetAt: resetMarker.createdAt } : {})
    }
  }

  /** Upsert one outbound row per Agent run id. */
  async recordOutbound(input: RecordLarkOutboundInput): Promise<{ log: LarkMessageLogEntity; created: boolean }> {
    const integrationId = requireText(input.integrationId, 'integrationId')
    const scopeKey = requireText(input.scopeKey, 'scopeKey')
    const xpertId = requireText(input.xpertId, 'xpertId')
    const runId = requireText(input.runId, 'runId')
    let existing = await this.messageLogRepository.findOne({
      where: { integrationId, direction: 'outbound', runId }
    })

    if (existing) {
      this.applyOutboundPatch(existing, input)
      return { log: await this.messageLogRepository.save(existing), created: false }
    }

    const candidate = this.messageLogRepository.create({
      integrationId,
      runId,
      messageId: optionalText(input.messageId),
      scopeKey,
      xpertId,
      conversationId: optionalText(input.conversationId),
      direction: 'outbound',
      status: input.status,
      content: optionalText(input.content),
      error: truncateText(input.error, 1024) || null,
      sentAt: toDate(input.sentAt) ?? (input.status === 'sent' ? new Date() : null),
      tenantId: optionalText(input.tenantId),
      organizationId: optionalText(input.organizationId),
      createdById: optionalText(input.createdById),
      updatedById: optionalText(input.createdById),
      botMentioned: false
    })

    try {
      return { log: await this.messageLogRepository.save(candidate), created: true }
    } catch (error) {
      existing = await this.messageLogRepository.findOne({
        where: { integrationId, direction: 'outbound', runId }
      })
      if (!existing) {
        throw error
      }
      this.applyOutboundPatch(existing, input)
      return { log: await this.messageLogRepository.save(existing), created: false }
    }
  }

  async markContextReset(input: MarkLarkContextResetInput): Promise<LarkMessageLogEntity> {
    const integrationId = requireText(input.integrationId, 'integrationId')
    const scopeKey = requireText(input.scopeKey, 'scopeKey')
    const xpertId = requireText(input.xpertId, 'xpertId')
    return this.messageLogRepository.save(
      this.messageLogRepository.create({
        integrationId,
        scopeKey,
        xpertId,
        conversationId: optionalText(input.conversationId),
        direction: 'system',
        status: 'context_reset',
        content: CONTEXT_RESET_CONTENT,
        botMentioned: false,
        tenantId: optionalText(input.tenantId),
        organizationId: optionalText(input.organizationId),
        createdById: optionalText(input.createdById),
        updatedById: optionalText(input.createdById)
      })
    )
  }

  /** Search only the persisted local history for the exact current Lark/Xpert scope. */
  async searchChatHistory(input: SearchLarkHistoryInput): Promise<{
    items: LarkHistoryItem[]
    totalScanned: number
    hasMore: boolean
    nextCursor?: string
    files?: LarkInboundFile[]
  }> {
    const integrationId = requireText(input.integrationId, 'integrationId')
    const scopeKey = requireText(input.scopeKey, 'scopeKey')
    const xpertId = requireText(input.xpertId, 'xpertId')
    const limit = normalizeHistoryLimit(input.limit)
    if (!limit) {
      return { items: [], totalScanned: 0, hasMore: false }
    }

    const before = toDate(input.before)
    const after = toDate(input.after)
    const cursor = decodeHistoryCursor(input.cursor)
    const keyword = normalizeSearch(input.keyword)
    const senderOpenId = optionalText(input.senderOpenId)
    const direction = input.direction ?? 'both'
    const excluded = uniqueTexts(input.excludedLogIds ?? [])
    const resetMarker = input.respectContextReset
      ? await this.messageLogRepository.findOne({
          where: this.scopedLogWhere(
            {
              integrationId,
              scopeKey,
              xpertId,
              direction: 'system',
              status: 'context_reset',
              ...(before ? { createdAt: LessThan(before) } : {})
            },
            input
          ),
          order: { createdAt: 'DESC', id: 'DESC' }
        })
      : null
    const lowerBound =
      after && resetMarker?.createdAt
        ? after > resetMarker.createdAt
          ? after
          : resetMarker.createdAt
        : after ?? resetMarker?.createdAt
    // messageLogId is retained as varchar for compatibility with plugin-created tables,
    // while the message log primary key is a PostgreSQL uuid. Cast the outer id to text
    // so PostgreSQL can use the indexed varchar association without a schema migration.
    const attachmentExists = `EXISTS (SELECT 1 FROM ${LarkMessageFileEntity.tableName} history_file WHERE history_file."messageLogId" = CAST(log.id AS text))`
    const query = this.messageLogRepository.createQueryBuilder('log')
    this.applyLogScopeQuery(query, { ...input, integrationId, scopeKey, xpertId })
    query.andWhere(
      new Brackets((statusQuery) => {
        if (direction !== 'outbound') {
          statusQuery.where('(log.direction = :inboundDirection AND log.status IN (:...inboundStatuses))', {
            inboundDirection: 'inbound',
            inboundStatuses: ['received', 'dispatched', 'history_only']
          })
        }
        if (direction !== 'inbound') {
          const clause = '(log.direction = :outboundDirection AND log.status = :sentStatus)'
          const parameters = { outboundDirection: 'outbound', sentStatus: 'sent' }
          if (direction === 'outbound') {
            statusQuery.where(clause, parameters)
          } else {
            statusQuery.orWhere(clause, parameters)
          }
        }
      })
    )
    if (senderOpenId) {
      query.andWhere('log.senderOpenId = :senderOpenId', { senderOpenId })
    }
    if (before) {
      query.andWhere('log.createdAt < :before', { before })
    }
    if (cursor) {
      query.andWhere(
        new Brackets((cursorQuery) => {
          cursorQuery
            .where('log.createdAt < :cursorCreatedAt', { cursorCreatedAt: cursor.createdAt })
            .orWhere('(log.createdAt = :cursorCreatedAt AND log.id < :cursorId)', {
              cursorCreatedAt: cursor.createdAt,
              cursorId: cursor.id
            })
        })
      )
    }
    if (lowerBound) {
      query.andWhere('log.createdAt > :lowerBound', { lowerBound })
    }
    if (excluded.length) {
      query.andWhere('log.id NOT IN (:...excluded)', { excluded })
    }
    if (keyword) {
      query.andWhere(this.buildKeywordFilter('log'), {
        keyword: `%${escapeLikePattern(keyword)}%`
      })
    }
    if (typeof input.hasAttachments === 'boolean') {
      query.andWhere(`${input.hasAttachments ? '' : 'NOT '}${attachmentExists}`)
    }
    query.andWhere(
      new Brackets((contentQuery) => {
        contentQuery.where("NULLIF(TRIM(log.content), '') IS NOT NULL").orWhere(attachmentExists)
      })
    )
    query
      .orderBy('log.createdAt', 'DESC')
      .addOrderBy('log.id', 'DESC')
      .take(limit + 1)

    const matched = await query.getMany()
    const hasMore = matched.length > limit
    const pageRows = matched.slice(0, limit)
    const selected = [...pageRows].reverse()
    const candidateFiles =
      input.includeFiles && selected.length
        ? await this.messageFileRepository.find({
            where: this.scopedFileWhere(
              {
                integrationId,
                xpertId,
                messageLogId: In(selected.map((log) => log.id)),
                status: 'ready'
              },
              input
            ),
            order: { createdAt: 'ASC', id: 'ASC' },
            take: 10
          })
        : []

    const files = input.includeFiles && selected.length ? candidateFiles.slice(0, 10) : []

    return {
      items: selected.map((log) => this.toHistoryItem(log)),
      totalScanned: matched.length,
      hasMore,
      ...(hasMore && pageRows.length ? { nextCursor: encodeHistoryCursor(pageRows[pageRows.length - 1]) } : {}),
      ...(files.length ? { files: files.map((file) => this.toInboundFile(file)) } : {})
    }
  }

  async searchHistory(input: SearchLarkHistoryInput) {
    return this.searchChatHistory(input)
  }

  async listMessageLogs(input: ListLarkMessageLogsInput): Promise<{
    items: LarkMessageLogEntity[]
    total: number
    page: number
    pageSize: number
    nextCursor?: string
  }> {
    const integrationId = requireText(input.integrationId, 'integrationId')
    const page = normalizePositiveInteger(input.page, 1, 1, Number.MAX_SAFE_INTEGER)
    const pageSize = normalizePositiveInteger(input.pageSize, 50, 1, 200)
    const offset = (page - 1) * pageSize
    if (!Number.isSafeInteger(offset)) {
      throw new Error('Requested Lark message page is too large.')
    }
    const search = normalizeSearch(input.search)
    const sortBy = input.sortBy ?? 'createdAt'
    const sortDirection = input.sortDirection === 'asc' ? 'ASC' : 'DESC'
    const queryFingerprint = buildAdminQueryFingerprint({
      integrationId,
      tenantId: optionalText(input.tenantId) ?? null,
      organizationId: optionalText(input.organizationId) ?? null,
      scopeKey: optionalText(input.scopeKey) ?? null,
      xpertId: optionalText(input.xpertId) ?? null,
      direction: input.direction ?? null,
      status: input.status ?? null,
      search,
      pageSize,
      sortBy,
      sortDirection
    })
    const cursor = decodeAdminMessageCursor(input.cursor, sortBy, sortDirection, queryFingerprint)
    const query = this.messageLogRepository.createQueryBuilder('log')
    this.applyLogScopeQuery(query, { ...input, integrationId })
    if (input.direction) {
      query.andWhere('log.direction = :direction', { direction: input.direction })
    }
    if (input.status) {
      query.andWhere('log.status = :status', { status: input.status })
    }
    if (search) {
      query.andWhere(this.buildAdminKeywordFilter('log'), {
        keyword: `%${escapeLikePattern(search)}%`
      })
    }
    if (cursor) {
      this.applyAdminMessageCursor(query, cursor)
    }
    query
      .orderBy(`log.${sortBy}`, sortDirection, 'NULLS LAST')
      .addOrderBy('log.id', sortDirection)
      .take(pageSize + 1)

    let rows: LarkMessageLogEntity[]
    let total: number
    let sessionId: string
    if (cursor) {
      rows = await query.getMany()
      sessionId = cursor.sessionId
      const cachedTotal = await this.readCachedAdminTotal(sessionId, queryFingerprint)
      if (typeof cachedTotal === 'number' && Number.isSafeInteger(cachedTotal) && cachedTotal >= 0) {
        total = cachedTotal
      } else {
        const countQuery = this.messageLogRepository.createQueryBuilder('log')
        this.applyLogScopeQuery(countQuery, { ...input, integrationId })
        if (input.direction) {
          countQuery.andWhere('log.direction = :direction', { direction: input.direction })
        }
        if (input.status) {
          countQuery.andWhere('log.status = :status', { status: input.status })
        }
        if (search) {
          countQuery.andWhere(this.buildAdminKeywordFilter('log'), {
            keyword: `%${escapeLikePattern(search)}%`
          })
        }
        total = await countQuery.getCount()
        await this.writeCachedAdminTotal(sessionId, queryFingerprint, total)
      }
    } else {
      query.skip(offset)
      ;[rows, total] = await query.getManyAndCount()
      sessionId = randomUUID()
      await this.writeCachedAdminTotal(sessionId, queryFingerprint, total)
    }

    const hasMore = rows.length > pageSize
    const items = rows.slice(0, pageSize)
    return {
      items,
      total,
      page,
      pageSize,
      ...(hasMore && items.length
        ? {
            nextCursor: encodeAdminMessageCursor(
              items[items.length - 1],
              sortBy,
              sortDirection,
              queryFingerprint,
              sessionId
            )
          }
        : {})
    }
  }

  private async readCachedAdminTotal(sessionId: string, queryFingerprint: string): Promise<number | undefined> {
    try {
      return await this.cacheManager?.get<number>(adminTotalCacheKey(sessionId, queryFingerprint))
    } catch (error) {
      this.logger.warn(`Unable to read cached Lark admin message total: ${String(error)}`)
      return undefined
    }
  }

  private async writeCachedAdminTotal(
    sessionId: string,
    queryFingerprint: string,
    total: number
  ): Promise<void> {
    try {
      await this.cacheManager?.set(
        adminTotalCacheKey(sessionId, queryFingerprint),
        total,
        ADMIN_TOTAL_CACHE_TTL_MS
      )
    } catch (error) {
      this.logger.warn(`Unable to cache Lark admin message total: ${String(error)}`)
    }
  }

  async listMessageFiles(input: {
    integrationId: string
    messageLogIds: string[]
    tenantId?: string | null
    organizationId?: string | null
  }): Promise<LarkMessageFileEntity[]> {
    const integrationId = requireText(input.integrationId, 'integrationId')
    const messageLogIds = [...new Set(input.messageLogIds.map(optionalText).filter(Boolean) as string[])]
    if (!messageLogIds.length) {
      return []
    }

    return this.messageFileRepository.find({
      where: this.scopedFileWhere(
        {
          integrationId,
          messageLogId: In(messageLogIds)
        },
        input
      ),
      order: { createdAt: 'ASC', id: 'ASC' }
    })
  }

  /** Delete each workspace object before removing its file row and parent message log. */
  async cleanupExpired(input: CleanupExpiredLarkHistoryInput = {}): Promise<{
    cutoff: Date
    deletedLogs: number
    deletedFiles: number
    failedFiles: number
    errors: string[]
    hasMore: boolean
    nextCursor?: { createdAt: Date; id: string }
  }> {
    if (input.retentionDays === 0 && !input.olderThan) {
      return {
        cutoff: new Date(0),
        deletedLogs: 0,
        deletedFiles: 0,
        failedFiles: 0,
        errors: [],
        hasMore: false
      }
    }
    const cutoff =
      toDate(input.olderThan) ??
      new Date(
        Date.now() -
          normalizePositiveInteger(input.retentionDays, DEFAULT_RETENTION_DAYS, 1, 36500) * 24 * 60 * 60 * 1000
      )
    const batchSize = normalizePositiveInteger(input.batchSize, 500, 1, 1000)
    const afterCreatedAt = toDate(input.afterCreatedAt)
    const afterId = optionalText(input.afterId)
    if ((afterCreatedAt && !afterId) || (!afterCreatedAt && afterId)) {
      throw new Error('Both afterCreatedAt and afterId are required for Lark cleanup continuation.')
    }
    const baseWhere = {
      ...(optionalText(input.integrationId) ? { integrationId: optionalText(input.integrationId)! } : {})
    }
    const where: FindOptionsWhere<LarkMessageLogEntity> | FindOptionsWhere<LarkMessageLogEntity>[] =
      afterCreatedAt && afterId
        ? [
            this.scopedLogWhere(
              { ...baseWhere, createdAt: And(MoreThan(afterCreatedAt), LessThan(cutoff)) },
              input
            ),
            this.scopedLogWhere(
              { ...baseWhere, createdAt: afterCreatedAt, id: MoreThan(afterId) },
              input
            )
          ]
        : this.scopedLogWhere({ ...baseWhere, createdAt: LessThan(cutoff) }, input)
    const logs = await this.messageLogRepository.find({
      where,
      order: { createdAt: 'ASC', id: 'ASC' },
      take: batchSize + 1
    })
    const hasMore = logs.length > batchSize
    const batch = logs.slice(0, batchSize)
    const logIds = batch.map((log) => log.id)
    const files = logIds.length
      ? await this.messageFileRepository.find({
          where: { messageLogId: In(logIds) },
          order: { createdAt: 'ASC', id: 'ASC' }
        })
      : []
    const filesByLogId = groupFilesByLogId(files)
    let deletedLogs = 0
    let deletedFiles = 0
    let failedFiles = 0
    const errors: string[] = []

    for (const log of batch) {
      let canDeleteLog = true
      for (const file of filesByLogId.get(log.id) ?? []) {
        try {
          await this.deleteWorkspaceFileFirst(file)
          await this.messageFileRepository.delete(file.id)
          deletedFiles += 1
        } catch (error) {
          canDeleteLog = false
          failedFiles += 1
          errors.push(`${file.id}: ${getErrorMessage(error)}`)
        }
      }
      if (!canDeleteLog) {
        continue
      }
      await this.messageLogRepository.delete(log.id)
      deletedLogs += 1
    }

    const lastScanned = batch[batch.length - 1]
    return {
      cutoff,
      deletedLogs,
      deletedFiles,
      failedFiles,
      errors,
      hasMore,
      ...(hasMore && lastScanned
        ? { nextCursor: { createdAt: lastScanned.createdAt, id: lastScanned.id } }
        : {})
    }
  }

  private async ensureResourceRows(log: LarkMessageLogEntity, input: CaptureLarkInboundInput): Promise<void> {
    const refs = dedupeResourceRefs(input.resourceRefs ?? [])
    for (const ref of refs) {
      const existing = await this.messageFileRepository.findOne({
        where: { messageLogId: log.id, resourceKey: ref.fileKey }
      })
      if (existing) {
        continue
      }

      const candidate = this.messageFileRepository.create({
        messageLogId: log.id,
        integrationId: log.integrationId,
        scopeKey: log.scopeKey,
        xpertId: log.xpertId,
        messageId: log.messageId,
        resourceKey: ref.fileKey,
        resourceType: normalizeResourceType(ref.type),
        originalName: optionalText(ref.name),
        status: 'pending',
        tenantId: log.tenantId,
        organizationId: log.organizationId,
        createdById: log.createdById,
        updatedById: log.updatedById
      })
      try {
        await this.messageFileRepository.save(candidate)
      } catch (error) {
        const raced = await this.messageFileRepository.findOne({
          where: { messageLogId: log.id, resourceKey: ref.fileKey }
        })
        if (!raced) {
          throw error
        }
      }
    }
  }

  private async materializeOneFile(
    client: lark.Client | undefined,
    workspaceFiles: WorkspaceFilesApi,
    row: LarkMessageFileEntity,
    scope: {
      integrationId: string
      xpertId: string
      tenantId?: string
      organizationId?: string
      maxBytes: number
    }
  ): Promise<LarkMessageFileEntity> {
    const messageId = requireText(row.messageId, 'messageId')
    row.status = 'processing'
    row.error = null
    await this.messageFileRepository.save(row)

    if (row.filePath) {
      return this.understandWorkspaceFile(workspaceFiles, row, scope)
    }

    if (!client) {
      throw new Error('Lark client is required to download a message resource')
    }

    const response = (await client.im.messageResource.get({
      params: { type: toLarkDownloadResourceType(row.resourceType) },
      path: { message_id: messageId, file_key: row.resourceKey }
    })) as LarkMessageResourceDownload
    const headers = normalizeHeaders(response.headers)
    const declaredSize = parseHeaderNumber(headers['content-length'])
    if (declaredSize !== undefined && declaredSize > scope.maxBytes) {
      throw new Error(fileSizeExceededMessage(declaredSize, scope.maxBytes))
    }
    const stream = response.getReadableStream?.()
    if (!stream) {
      throw new Error(`Lark resource '${row.resourceKey}' did not return a readable stream`)
    }
    const buffer = await readStreamAsBuffer(stream, scope.maxBytes)
    const mimeType = optionalText(headers['content-type'])?.split(';')[0]?.trim()
    const originalName = normalizeFileName(
      parseContentDispositionFilename(headers['content-disposition']) ??
        row.originalName ??
        `${row.resourceKey}.${extensionFor(row.resourceType, mimeType)}`
    )
    const userId = optionalText(row.createdById)
    const workspaceScope = {
      tenantId: scope.tenantId,
      userId,
      catalog: 'xperts' as const,
      xpertId: scope.xpertId,
      isolateByUser: false
    }
    const metadata = {
      source: 'lark_message_resource',
      integrationId: scope.integrationId,
      organizationId: scope.organizationId,
      messageId,
      messageLogId: row.messageLogId,
      resourceKey: row.resourceKey,
      resourceType: row.resourceType,
      scopeKey: row.scopeKey
    }
    const uploaded = await workspaceFiles.uploadBuffer({
      ...workspaceScope,
      folder: `files/lark/${safePathSegment(scope.integrationId)}/${safePathSegment(row.messageLogId)}`,
      fileName: originalName,
      originalName,
      mimeType,
      size: buffer.byteLength,
      buffer,
      metadata
    })

    row.filePath = uploaded.filePath
    row.workspacePath = uploaded.workspacePath
    row.fileUrl = uploaded.fileUrl ?? uploaded.url ?? null
    row.originalName = originalName
    row.mimeType = mimeType ?? uploaded.mimeType ?? null
    row.size = buffer.byteLength
    row.workspaceCatalog = uploaded.catalog
    row.workspaceScopeId = uploaded.scopeId ?? null
    row.workspaceUserId = userId ?? null
    row.workspaceIsolateByUser = false
    await this.messageFileRepository.save(row)

    return this.understandWorkspaceFile(workspaceFiles, row, scope, metadata)
  }

  private async understandWorkspaceFile(
    workspaceFiles: WorkspaceFilesApi,
    row: LarkMessageFileEntity,
    scope: {
      integrationId: string
      xpertId: string
      tenantId?: string
      organizationId?: string
      maxBytes: number
    },
    existingMetadata?: Record<string, unknown>
  ): Promise<LarkMessageFileEntity> {
    const filePath = requireText(row.filePath, 'filePath')
    const originalName = normalizeFileName(row.originalName ?? filePath.split('/').pop() ?? 'lark-file')
    const userId = optionalText(row.workspaceUserId ?? row.createdById)
    const workspaceScope = {
      tenantId: scope.tenantId,
      userId,
      catalog: (row.workspaceCatalog ?? 'xperts') as WorkspaceFileCatalog,
      ...(row.workspaceScopeId ? { scopeId: row.workspaceScopeId } : {}),
      xpertId: scope.xpertId,
      isolateByUser: row.workspaceIsolateByUser ?? false
    }
    const metadata =
      existingMetadata ?? {
        source: 'lark_message_resource',
        integrationId: scope.integrationId,
        organizationId: scope.organizationId,
        messageId: row.messageId,
        messageLogId: row.messageLogId,
        resourceKey: row.resourceKey,
        resourceType: row.resourceType,
        scopeKey: row.scopeKey
      }
    const understood = await workspaceFiles.understandFile({
      ...workspaceScope,
      filePath,
      originalName,
      mimeType: row.mimeType,
      size: row.size,
      fileUrl: row.fileUrl ?? undefined,
      purpose: 'chat_attachment',
      parseMode: 'auto',
      metadata
    })

    row.fileAssetId = understood.fileAssetId
    row.fileId = understood.fileId
    row.storageFileId = understood.storageFileId ?? null
    row.filePath = understood.filePath || filePath
    row.workspacePath = understood.workspacePath || row.workspacePath
    row.fileUrl = understood.fileUrl ?? understood.url ?? row.fileUrl ?? null
    row.originalName = understood.originalName || originalName
    row.mimeType = understood.mimeType ?? row.mimeType
    row.size = understood.size ?? row.size
    row.workspaceCatalog = understood.catalog ?? row.workspaceCatalog ?? 'xperts'
    row.workspaceScopeId = understood.scopeId ?? row.workspaceScopeId ?? null
    row.status = 'ready'
    row.error = null
    return this.messageFileRepository.save(row)
  }

  private applyOutboundPatch(log: LarkMessageLogEntity, input: RecordLarkOutboundInput): void {
    log.status = input.status
    if (input.content !== undefined) {
      log.content = optionalText(input.content) ?? null
    }
    if (input.messageId !== undefined) {
      log.messageId = optionalText(input.messageId) ?? null
    }
    if (input.conversationId !== undefined) {
      log.conversationId = optionalText(input.conversationId) ?? null
    }
    if (input.error !== undefined) {
      log.error = truncateText(input.error, 1024) || null
    }
    if (input.sentAt !== undefined || input.status === 'sent') {
      log.sentAt = toDate(input.sentAt) ?? new Date()
    }
    log.updatedById = optionalText(input.createdById) ?? log.updatedById
  }

  private resolveHistoryLowerBound(
    before: Date,
    windowSeconds: number | null | undefined,
    resetAt?: Date | null
  ): Date | undefined {
    const seconds = normalizeHistoryWindow(windowSeconds)
    const windowStart = seconds > 0 ? new Date(before.getTime() - seconds * 1000) : undefined
    if (windowStart && resetAt) {
      return windowStart > resetAt ? windowStart : resetAt
    }
    return windowStart ?? resetAt ?? undefined
  }

  private historyDateRange(before: Date, lowerBound?: Date): FindOperator<Date> {
    return lowerBound ? And(MoreThan(lowerBound), LessThan(before)) : LessThan(before)
  }

  private formatHistoryContext(
    logs: LarkMessageLogEntity[],
    filesByLogId: Map<string, LarkMessageFileEntity[]>
  ): string | undefined {
    const lines: string[] = []
    for (const log of logs) {
      const content = truncateText(log.content, MAX_CONTEXT_ITEM_CHARS)
      const fileLines = (filesByLogId.get(log.id) ?? []).map((file) => this.formatHistoryFile(file))
      if (!content && !fileLines.length) {
        continue
      }
      const timestamp = (log.sentAt ?? log.messageCreatedAt ?? log.createdAt).toISOString()
      const actor =
        log.direction === 'outbound'
          ? 'Agent'
          : `用户${log.senderName ? `(${log.senderName})` : log.senderOpenId ? `(${log.senderOpenId})` : ''}`
      lines.push(`[${timestamp}] ${actor}: ${content || '[历史文件]'}`)
      lines.push(...fileLines)
    }
    if (!lines.length) {
      return undefined
    }
    return truncateText(
      [
        '[历史上下文，仅供背景参考，勿当作本次用户新消息。以下内容来自本地保存的飞书消息；历史附件已关联到当前 Xpert 工作区。]',
        ...lines
      ].join('\n'),
      MAX_CONTEXT_TOTAL_CHARS
    )
  }

  private formatHistoryFile(file: LarkMessageFileEntity): string {
    const name = truncateText(
      file.originalName || file.workspacePath || file.filePath || file.resourceKey || 'lark-file',
      160
    )
    const identifiers = [
      file.fileAssetId ? `fileAssetId=${file.fileAssetId}` : '',
      file.fileId ? `fileId=${file.fileId}` : '',
      file.workspacePath ? `workspacePath=${file.workspacePath}` : '',
      file.filePath && file.filePath !== file.workspacePath ? `filePath=${file.filePath}` : '',
      `status=${file.status}`
    ].filter(Boolean)
    return `  - 历史附件: ${name}${identifiers.length ? ` (${identifiers.join(', ')})` : ''}`
  }

  private toInboundFile(row: LarkMessageFileEntity): LarkInboundFile {
    return {
      id: row.fileAssetId ?? row.fileId ?? row.id,
      fileAssetId: row.fileAssetId ?? undefined,
      fileId: row.fileId ?? undefined,
      storageFileId: row.storageFileId ?? undefined,
      filePath: row.filePath ?? undefined,
      workspacePath: row.workspacePath ?? undefined,
      fileUrl: row.fileUrl ?? undefined,
      url: row.fileUrl ?? undefined,
      mimeType: row.mimeType ?? undefined,
      mimetype: row.mimeType ?? undefined,
      originalName: row.originalName ?? undefined,
      name: row.originalName ?? undefined,
      fileKey: row.resourceKey,
      size: row.size ?? undefined
    }
  }

  private async toDispatchInboundFile(
    workspaceFiles: WorkspaceFilesApi,
    row: LarkMessageFileEntity
  ): Promise<LarkInboundFile> {
    const file = this.toInboundFile(row)
    if (row.resourceType !== 'image') {
      return file
    }

    const workspaceFile = await workspaceFiles.readBuffer({
      tenantId: row.tenantId,
      userId: row.workspaceUserId,
      catalog: row.workspaceCatalog ?? 'xperts',
      scopeId: row.workspaceScopeId,
      xpertId: row.xpertId,
      isolateByUser: row.workspaceIsolateByUser,
      filePath: requireText(row.filePath, 'filePath')
    })
    const mimeType = optionalText(row.mimeType) ?? optionalText(workspaceFile.mimeType)
    if (!mimeType?.startsWith('image/')) {
      throw new Error(`Lark image resource '${row.resourceKey}' has invalid mime type '${mimeType ?? 'unknown'}'`)
    }
    const fileUrl = `data:${mimeType};base64,${workspaceFile.buffer.toString('base64')}`

    return {
      ...file,
      fileUrl,
      url: fileUrl,
      mimeType,
      mimetype: mimeType,
      size: workspaceFile.buffer.byteLength
    }
  }

  private toHistoryItem(log: LarkMessageLogEntity): LarkHistoryItem {
    return {
      id: log.id,
      direction: log.direction,
      status: log.status,
      senderOpenId: log.senderOpenId ?? null,
      senderName: log.senderName ?? null,
      content: truncateText(log.content, MAX_CONTEXT_ITEM_CHARS),
      messageId: log.messageId ?? null,
      messageType: log.messageType ?? null,
      createdAt: log.createdAt,
      messageCreatedAt: log.messageCreatedAt ?? null,
      sentAt: log.sentAt ?? null
    }
  }

  private scopedLogWhere(
    where: FindOptionsWhere<LarkMessageLogEntity>,
    scope: { tenantId?: string | null; organizationId?: string | null }
  ): FindOptionsWhere<LarkMessageLogEntity> {
    return {
      ...where,
      ...(optionalText(scope.tenantId) ? { tenantId: optionalText(scope.tenantId)! } : {}),
      ...(optionalText(scope.organizationId) ? { organizationId: optionalText(scope.organizationId)! } : {})
    }
  }

  private scopedFileWhere(
    where: FindOptionsWhere<LarkMessageFileEntity>,
    scope: { tenantId?: string | null; organizationId?: string | null }
  ): FindOptionsWhere<LarkMessageFileEntity> {
    return {
      ...where,
      ...(optionalText(scope.tenantId) ? { tenantId: optionalText(scope.tenantId)! } : {}),
      ...(optionalText(scope.organizationId) ? { organizationId: optionalText(scope.organizationId)! } : {})
    }
  }

  private applyLogScopeQuery(
    query: SelectQueryBuilder<LarkMessageLogEntity>,
    scope: {
      integrationId: string
      scopeKey?: string | null
      xpertId?: string | null
      tenantId?: string | null
      organizationId?: string | null
    }
  ): void {
    query.where('log.integrationId = :integrationId', { integrationId: scope.integrationId })
    if (optionalText(scope.scopeKey)) {
      query.andWhere('log.scopeKey = :scopeKey', { scopeKey: optionalText(scope.scopeKey) })
    }
    if (optionalText(scope.xpertId)) {
      query.andWhere('log.xpertId = :xpertId', { xpertId: optionalText(scope.xpertId) })
    }
    if (optionalText(scope.tenantId)) {
      query.andWhere('log.tenantId = :tenantId', { tenantId: optionalText(scope.tenantId) })
    }
    if (optionalText(scope.organizationId)) {
      query.andWhere('log.organizationId = :organizationId', {
        organizationId: optionalText(scope.organizationId)
      })
    }
  }

  private buildKeywordFilter(alias: string): Brackets {
    return new Brackets((query) => {
      for (const field of ['content', 'senderName', 'senderOpenId', 'messageId', 'messageType']) {
        const clause = `LOWER(COALESCE(${alias}.${field}, '')) LIKE :keyword ESCAPE '!'`
        field === 'content' ? query.where(clause) : query.orWhere(clause)
      }
    })
  }

  private applyAdminMessageCursor(
    query: SelectQueryBuilder<LarkMessageLogEntity>,
    cursor: LarkAdminMessageCursor
  ): void {
    const field = `log.${cursor.sortBy}`
    const idOperator = cursor.sortDirection === 'ASC' ? '>' : '<'
    if (cursor.sortValue === null) {
      query.andWhere(`(${field} IS NULL AND log.id ${idOperator} :adminCursorId)`, {
        adminCursorId: cursor.id
      })
      return
    }

    const valueOperator = cursor.sortDirection === 'ASC' ? '>' : '<'
    query.andWhere(
      new Brackets((cursorQuery) => {
        cursorQuery
          .where(`${field} ${valueOperator} :adminCursorValue`, {
            adminCursorValue: cursor.sortValue
          })
          .orWhere(`(${field} = :adminCursorValue AND log.id ${idOperator} :adminCursorId)`, {
            adminCursorValue: cursor.sortValue,
            adminCursorId: cursor.id
          })
          .orWhere(`${field} IS NULL`)
      })
    )
  }

  private buildAdminKeywordFilter(alias: string): Brackets {
    return new Brackets((query) => {
      query.where(`${buildAdminSearchExpression(alias)} LIKE :keyword ESCAPE '!'`)
    })
  }

  private requireWorkspaceFiles(): WorkspaceFilesApi {
    const workspaceFiles = this.runtimeCapabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!workspaceFiles) {
      throw new Error('Platform workspace files capability is not available')
    }
    return workspaceFiles
  }

  private async deleteWorkspaceFileFirst(file: LarkMessageFileEntity): Promise<void> {
    if (!file.filePath) {
      return
    }
    const workspaceFiles = this.requireWorkspaceFiles()
    try {
      await workspaceFiles.deleteFile({
        tenantId: file.tenantId,
        userId: file.workspaceUserId,
        catalog: file.workspaceCatalog ?? 'xperts',
        scopeId: file.workspaceScopeId,
        xpertId: file.xpertId,
        isolateByUser: file.workspaceIsolateByUser,
        filePath: file.filePath
      })
    } catch (error) {
      if (!isMissingWorkspaceFileError(error)) {
        throw error
      }
    }
  }
}

function requireText(value: unknown, fieldName: string): string {
  const text = optionalText(value)
  if (!text) {
    throw new Error(`${fieldName} is required`)
  }
  return text
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function uniqueTexts(values: readonly unknown[]): string[] {
  return Array.from(new Set(values.map(optionalText).filter((value): value is string => Boolean(value))))
}

function normalizeSearch(value: unknown): string | undefined {
  return optionalText(value)?.toLocaleLowerCase()
}

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 0 && value < 10_000_000_000 ? value * 1000 : value
    const date = new Date(milliseconds)
    return Number.isFinite(date.getTime()) ? date : undefined
  }
  if (typeof value !== 'string' || !value.trim()) {
    return undefined
  }
  const normalized = value.trim()
  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    return toDate(Number(normalized))
  }
  const date = new Date(normalized)
  return Number.isFinite(date.getTime()) ? date : undefined
}

type LarkHistoryCursor = {
  createdAt: Date
  id: string
}

function encodeHistoryCursor(log: Pick<LarkMessageLogEntity, 'createdAt' | 'id'>): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: log.createdAt.toISOString(),
      id: log.id
    }),
    'utf8'
  ).toString('base64url')
}

function decodeHistoryCursor(value: unknown): LarkHistoryCursor | undefined {
  const cursor = optionalText(value)
  if (!cursor) {
    return undefined
  }
  if (cursor.length > 1024) {
    throw new Error('Invalid Lark history cursor.')
  }
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<string, unknown>
    const createdAt = toDate(parsed.createdAt)
    const id = optionalText(parsed.id)
    if (!createdAt || !id) {
      throw new Error('missing cursor fields')
    }
    return { createdAt, id }
  } catch {
    throw new Error('Invalid Lark history cursor.')
  }
}

function encodeAdminMessageCursor(
  log: LarkMessageLogEntity,
  sortBy: LarkAdminMessageSortBy,
  sortDirection: 'ASC' | 'DESC',
  queryFingerprint: string,
  sessionId: string
): string {
  const rawValue = log[sortBy]
  const sortValue = rawValue instanceof Date ? rawValue.toISOString() : rawValue ?? null
  return Buffer.from(
    JSON.stringify({
      sortBy,
      sortDirection,
      sortValue,
      id: log.id,
      queryFingerprint,
      sessionId
    }),
    'utf8'
  ).toString('base64url')
}

function decodeAdminMessageCursor(
  value: unknown,
  expectedSortBy: LarkAdminMessageSortBy,
  expectedSortDirection: 'ASC' | 'DESC',
  expectedQueryFingerprint: string
): LarkAdminMessageCursor | undefined {
  const cursor = optionalText(value)
  if (!cursor) {
    return undefined
  }
  if (cursor.length > 2048) {
    throw new Error('Invalid Lark message page cursor.')
  }
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<string, unknown>
    const id = optionalText(parsed.id)
    const queryFingerprint = optionalText(parsed.queryFingerprint)
    const sessionId = optionalText(parsed.sessionId)
    if (
      parsed.sortBy !== expectedSortBy ||
      parsed.sortDirection !== expectedSortDirection ||
      !id ||
      queryFingerprint !== expectedQueryFingerprint ||
      !sessionId
    ) {
      throw new Error('cursor does not match the active sort')
    }

    let sortValue: LarkAdminMessageCursor['sortValue']
    if (parsed.sortValue === null) {
      sortValue = null
    } else if (expectedSortBy === 'createdAt' || expectedSortBy === 'messageCreatedAt') {
      const date = toDate(parsed.sortValue)
      if (!date) {
        throw new Error('invalid cursor date')
      }
      sortValue = date
    } else if (expectedSortBy === 'botMentioned') {
      if (typeof parsed.sortValue !== 'boolean') {
        throw new Error('invalid cursor boolean')
      }
      sortValue = parsed.sortValue
    } else {
      const text = optionalText(parsed.sortValue)
      if (!text) {
        throw new Error('invalid cursor text')
      }
      sortValue = text
    }

    return {
      sortBy: expectedSortBy,
      sortDirection: expectedSortDirection,
      sortValue,
      id,
      queryFingerprint,
      sessionId
    }
  } catch {
    throw new Error('Invalid Lark message page cursor.')
  }
}

function buildAdminQueryFingerprint(value: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('base64url')
}

function adminTotalCacheKey(sessionId: string, queryFingerprint: string): string {
  return `${ADMIN_TOTAL_CACHE_PREFIX}:${sessionId}:${queryFingerprint}`
}

function truncateText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return ''
  }
  const text = value.trim().replace(/\r\n/g, '\n')
  if (text.length <= maxLength) {
    return text
  }
  return `${text.slice(0, Math.max(0, maxLength - 8)).trimEnd()}...[截断]`
}

function normalizeHistoryLimit(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_HISTORY_LIMIT
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) {
    return DEFAULT_HISTORY_LIMIT
  }
  return Math.min(Math.floor(numeric), MAX_HISTORY_LIMIT)
}

function normalizeHistoryWindow(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_HISTORY_WINDOW_SECONDS
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) {
    return DEFAULT_HISTORY_WINDOW_SECONDS
  }
  return Math.floor(numeric)
}

function normalizeMaxFiles(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_MAX_HISTORY_FILES
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) {
    return DEFAULT_MAX_HISTORY_FILES
  }
  return Math.min(Math.floor(numeric), MAX_HISTORY_FILES)
}

function normalizeMaxFileBytes(value: unknown): number {
  const numeric = value === undefined || value === null || value === '' ? DEFAULT_MAX_FILE_SIZE_MB : Number(value)
  const megabytes = Number.isFinite(numeric) && numeric > 0 ? numeric : DEFAULT_MAX_FILE_SIZE_MB
  return Math.floor(megabytes * 1024 * 1024)
}

function normalizePositiveInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }
  return Math.min(maximum, Math.max(minimum, Math.floor(numeric)))
}

function normalizeResourceType(value: unknown): LarkMessageResourceType {
  return value === 'image' || value === 'audio' || value === 'media' || value === 'file' ? value : 'file'
}

function dedupeResourceRefs(refs: NormalizedMessageResourceRef[]): NormalizedMessageResourceRef[] {
  const result = new Map<string, NormalizedMessageResourceRef>()
  for (const ref of refs) {
    const fileKey = optionalText(ref?.fileKey)
    if (!fileKey || result.has(fileKey)) {
      continue
    }
    result.set(fileKey, { ...ref, fileKey })
  }
  return Array.from(result.values())
}

function groupFilesByLogId(rows: LarkMessageFileEntity[]): Map<string, LarkMessageFileEntity[]> {
  const grouped = new Map<string, LarkMessageFileEntity[]>()
  for (const row of rows) {
    const bucket = grouped.get(row.messageLogId) ?? []
    bucket.push(row)
    grouped.set(row.messageLogId, bucket)
  }
  return grouped
}

function toLarkDownloadResourceType(type: LarkMessageResourceType): 'image' | 'file' {
  return type === 'image' ? 'image' : 'file'
}

function isPermanentMaterializationError(message: string): boolean {
  return /^file_size_exceeded:/i.test(message)
}

function escapeLikePattern(value: string): string {
  return value.replace(/[!%_]/g, (character) => `!${character}`)
}

function normalizeHeaders(headers: Record<string, unknown> | undefined): Record<string, string> {
  if (!headers) {
    return {}
  }
  return Object.entries(headers).reduce<Record<string, string>>((result, [key, value]) => {
    if (Array.isArray(value)) {
      result[key.toLowerCase()] = value.map(String).join(', ')
    } else if (value != null) {
      result[key.toLowerCase()] = String(value)
    }
    return result
  }, {})
}

function parseHeaderNumber(value: string | undefined): number | undefined {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : undefined
}

function parseContentDispositionFilename(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }
  const utf8 = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (utf8) {
    try {
      return decodeURIComponent(utf8)
    } catch {
      return utf8
    }
  }
  return value.match(/filename="?([^";]+)"?/i)?.[1]
}

function normalizeFileName(value: string): string {
  const withoutControlCharacters = Array.from(value, (character) =>
    character.charCodeAt(0) < 32 ? '_' : character
  ).join('')
  const normalized = withoutControlCharacters.replace(/[\\/:*?"<>|]/g, '_').trim()
  return (normalized || 'lark-resource').slice(0, 240)
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128) || 'unknown'
}

function extensionFor(type: LarkMessageResourceType, mimeType?: string): string {
  const mime = mimeType?.toLowerCase()
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'audio/mpeg') return 'mp3'
  if (mime === 'audio/wav') return 'wav'
  if (mime === 'video/mp4') return 'mp4'
  return type === 'image' ? 'png' : type === 'audio' ? 'mp3' : type === 'media' ? 'mp4' : 'bin'
}

function fileSizeExceededMessage(size: number, maxBytes: number): string {
  return `file_size_exceeded: Lark resource size ${size} bytes exceeds the ${maxBytes} byte limit`
}

async function readStreamAsBuffer(stream: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  return new Promise<Buffer>((resolve, reject) => {
    stream.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      total += buffer.byteLength
      if (total > maxBytes) {
        stream.destroy(new Error(fileSizeExceededMessage(total, maxBytes)))
        return
      }
      chunks.push(buffer)
    })
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks, total)))
  })
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function isMissingWorkspaceFileError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase()
  return message.includes('not found') || message.includes('enoent') || message.includes('404')
}
