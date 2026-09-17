import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { Repository } from 'typeorm'
import {
  BATCH_ANALYSIS_MAX,
  CONCERN_CATEGORIES,
  CONVERSATION_MAX_LENGTH,
  CUSTOMER_HISTORY_DEFAULT_LIMIT,
  CUSTOMER_HISTORY_MAX_LIMIT,
  CUSTOMER_NAME_MAX_LENGTH,
  CUSTOMER_SEARCH_DEFAULT_LIMIT,
  CUSTOMER_SEARCH_MAX_LIMIT,
  IMPORT_MAX_ROWS,
  ISSUE_SEVERITIES,
  RISK_CATEGORIES,
  SCORE_DIMENSIONS,
  TREND_DAYS
} from './constants'
import { parseConversations } from './conversation-import'
import { historyKey, resolveCustomerId } from './customer-identity'
import { ConversationReviewRecord } from './entities'
import { getRuleDisclosure, RULE_VERSION } from './rule-check'
import { CONVERSATION_REVIEW_ANALYSIS_FIELDS } from './types'
import type {
  ConfirmReviewInput,
  ConversationActivityToday,
  ConversationCustomerSearchResult,
  ConversationIntentLevel,
  ConversationIssue,
  ConversationIssueBucket,
  ConversationIssueKind,
  ConversationIssueSeverity,
  ConversationHistoryItem,
  ConversationImportResult,
  ConversationImportRow,
  ConversationImportSkip,
  ConversationReviewAccuracy,
  ConversationReviewAnalysis,
  ConversationReviewDetailItem,
  ConversationReviewInsights,
  ConversationReviewListItem,
  ConversationReviewListQuery,
  ConversationReviewScope,
  ConversationReviewScores,
  ConversationReviewStats,
  ConversationReviewStatus,
  ConversationScoreAverage,
  ConversationSource,
  ConversationTrendPoint,
  CreateConversationReviewInput,
  SaveAnalysisInput
} from './types'

/**
 * Files a real WeCom/CRM connector would return over HTTP, bundled instead because this project
 * has no such credentials. `simulateFetchConversations` replays them through the exact same
 * parse+import path as a manually picked file — from the workbench's "获取聊天会话记录" button and
 * from the `conversation_review_fetch_conversations` chat tool alike — the only difference is what
 * supplies the bytes.
 */
const SIMULATED_FETCH_SOURCES: { file: string; format: 'json' | 'csv'; label: string }[] = [
  { file: 'conversations.sample.json', format: 'json', label: '会话存档接口' },
  { file: 'conversations.sample.csv', format: 'csv', label: '运营导出表' }
]

const INTENT_LEVELS: ConversationIntentLevel[] = ['high', 'medium', 'low', 'unknown']

@Injectable()
export class ConversationReviewService {
  constructor(
    @InjectRepository(ConversationReviewRecord)
    private readonly repository: Repository<ConversationReviewRecord>
  ) {}

  // ---------------------------------------------------------------- lifecycle

  /** Step 1 of the loop: one conversation is filed. Nothing AI happens yet. */
  async createRecord(scope: ConversationReviewScope, input: CreateConversationReviewInput) {
    const customerName = requireText(input.customerName, '客户名称', CUSTOMER_NAME_MAX_LENGTH)
    const conversation = requireText(input.conversation, '沟通记录', CONVERSATION_MAX_LENGTH)

    const record = this.repository.create({
      ...scopeColumns(scope),
      customerName,
      customerId: resolveCustomerId(scope, customerName, input.customerExternalId),
      customerExternalId: trimToUndefined(input.customerExternalId),
      conversation,
      source: input.source ?? 'manual',
      externalId: input.externalId,
      occurredAt: input.occurredAt,
      status: 'draft',
      retryCount: 0,
      revision: 0
    })
    return this.repository.save(record)
  }

  /**
   * Batch ingestion: the same `createRecord` step, driven by a source adapter instead of a form.
   *
   * Everything lands as `draft`. Import deliberately does not trigger analysis — each record costs
   * a real model call, and a file drop that silently spends twenty of them is not something a user
   * can consent to. Analysis stays an explicit, interruptible action.
   *
   * A whole file is never rejected because one row is bad. Invalid rows are reported individually
   * with their position and reason so the user can fix those and re-import: `externalId` makes the
   * second pass skip everything that already came in.
   */
  async importConversations(
    scope: ConversationReviewScope,
    rows: ConversationImportRow[],
    source: ConversationSource,
    parserSkipped: ConversationImportSkip[] = []
  ): Promise<ConversationImportResult> {
    if (!rows.length && !parserSkipped.length) {
      throw new BadRequestException('导入文件里没有可识别的沟通记录')
    }
    if (rows.length > IMPORT_MAX_ROWS) {
      throw new BadRequestException(
        `单次最多导入 ${IMPORT_MAX_ROWS} 条，当前文件有 ${rows.length} 条，请拆分后再导入`
      )
    }

    const existing = await this.repository.find({ where: scopeWhere(scope) })
    const seen = new Set(
      existing.map((row) => trimToUndefined(row.externalId)).filter((value): value is string => Boolean(value))
    )

    const skipped: ConversationImportSkip[] = [...parserSkipped]
    const recordIds: string[] = []
    let duplicates = 0

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      const position = index + 1
      const externalId = trimToUndefined(row.externalId)

      // Checked against the batch as well as the database, so one file containing the same
      // conversation twice does not import it twice either.
      if (externalId && seen.has(externalId)) {
        duplicates += 1
        continue
      }

      try {
        const record = await this.createRecord(scope, {
          customerName: row.customerName as string,
          conversation: row.conversation as string,
          source,
          externalId,
          customerExternalId: row.customerExternalId,
          occurredAt: row.occurredAt
        })
        recordIds.push(record.id as string)
        if (externalId) {
          seen.add(externalId)
        }
      } catch (error) {
        skipped.push({
          row: position,
          customerName: row.customerName,
          reason: getMessage(error)
        })
      }
    }

    return { imported: recordIds.length, duplicates, skipped, recordIds }
  }

  /**
   * Simulated connector fetch — the "auto" counterpart to picking a file by hand. Reads the same
   * bundled fixtures a person could otherwise drag in, through the same adapters (`importConversations`
   * above), so it proves the ingestion port works when driven programmatically — from a workbench
   * button or from a chat instruction — and not just from a click.
   */
  async simulateFetchConversations(scope: ConversationReviewScope): Promise<ConversationImportResult> {
    const results: ConversationImportResult[] = []
    for (const { file, format, label } of SIMULATED_FETCH_SOURCES) {
      const content = await readBundledExample(file)
      const parsed = parseConversations(content, format)
      const imported = await this.importConversations(scope, parsed.rows, `import:${format}`, parsed.skipped)
      results.push({ ...imported, skipped: labelSkipped(imported.skipped, label) })
    }
    return mergeImportResults(results)
  }

  /**
   * The records a "analyse all pending" click would run, oldest conversation first so the history
   * lookup sees a customer's conversations in the order they happened.
   */
  async listPendingAnalysis(scope: ConversationReviewScope, limit = BATCH_ANALYSIS_MAX) {
    const rows = await this.repository.find({ where: scopeWhere(scope) })
    return rows
      .filter((row) => row.status === 'draft' || row.status === 'failed')
      .sort((a, b) => occurredTime(a) - occurredTime(b))
      .slice(0, Math.max(1, limit))
      .map((row) => ({ id: row.id as string, customerName: row.customerName ?? '', status: row.status }))
  }

  /**
   * Hand an existing record to the Assistant and return the message to forward into the chat.
   *
   * State change and message building happen together on purpose: the retry prompt wants to
   * quote the previous failure reason, which this same call clears. Doing it in two steps left
   * the reason permanently blank.
   *
   * Used by both the first analysis and by retry, so a retry never creates a second main
   * record — it only advances the same row's state.
   */
  async requestAnalysis(scope: ConversationReviewScope, recordId: string, options: { isRetry?: boolean } = {}) {
    const record = await this.getScopedRecord(scope, recordId)
    if (record.status === 'processing') {
      throw new BadRequestException('该记录正在分析中，请等待本次分析结束')
    }

    const previousError = record.errorMessage ?? undefined
    record.status = 'processing'
    record.errorMessage = null
    if (options.isRetry) {
      record.retryCount = (record.retryCount ?? 0) + 1
    }
    record.revision = (record.revision ?? 0) + 1
    const saved = await this.repository.save(record)

    return {
      record: saved,
      message: buildAnalysisMessage(saved, { isRetry: options.isRetry, previousError })
    }
  }

  /** Called by the Assistant's tool once it has produced a structured result. */
  async saveAiResult(scope: ConversationReviewScope, input: SaveAnalysisInput) {
    const record = await this.getScopedRecord(scope, input.recordId)
    const analysis = normalizeAnalysis(input)
    if (!analysis.summary && !analysis.nextActions?.length) {
      throw new BadRequestException('分析结果至少需要包含沟通摘要或下一步跟进建议')
    }

    record.aiResult = analysis
    record.intentLevel = analysis.intentLevel
    record.status = 'completed'
    record.errorMessage = null
    record.analyzedAt = new Date()
    // Recorded every run, including a retry, so the tag always reflects the rule set that
    // actually produced the risks currently on the record.
    record.ruleVersion = RULE_VERSION
    record.revision = (record.revision ?? 0) + 1
    return this.repository.save(record)
  }

  /** Called when the model itself reports it cannot analyse, or by the view on a failed run. */
  async markFailed(scope: ConversationReviewScope, recordId: string, reason?: string) {
    const record = await this.getScopedRecord(scope, recordId)
    record.status = 'failed'
    record.errorMessage = trimToUndefined(reason) ?? 'AI 分析失败，原因未知，可以重试。'
    record.revision = (record.revision ?? 0) + 1
    return this.repository.save(record)
  }

  /**
   * Human-in-the-loop close-out. The salesperson's edited version is stored separately from the
   * raw AI output so both remain auditable.
   */
  async confirmResult(scope: ConversationReviewScope, input: ConfirmReviewInput) {
    const record = await this.getScopedRecord(scope, input.recordId)
    if (record.status !== 'completed' && record.status !== 'confirmed') {
      throw new BadRequestException('只有在 AI 分析完成后才能确认结果')
    }
    if (input.expectedRevision !== undefined && input.expectedRevision !== record.revision) {
      throw new BadRequestException('该记录已被其他操作更新，请刷新后重新确认')
    }

    const confirmed = normalizeAnalysis(input)
    if (!confirmed.summary) {
      throw new BadRequestException('确认前请填写沟通摘要')
    }

    record.confirmedResult = confirmed
    record.intentLevel = confirmed.intentLevel ?? record.intentLevel
    record.status = 'confirmed'
    record.confirmedAt = new Date()
    record.revision = (record.revision ?? 0) + 1
    return this.repository.save(record)
  }

  // ------------------------------------------------------------------- reads

  async getRecordForAgent(scope: ConversationReviewScope, recordId: string) {
    const record = await this.getScopedRecord(scope, recordId)
    return {
      id: record.id,
      customerName: record.customerName,
      conversation: record.conversation,
      status: record.status,
      retryCount: record.retryCount ?? 0,
      aiResult: record.aiResult,
      confirmedResult: record.confirmedResult
    }
  }

  /**
   * Previous conversations with the same customer, for the agent to review this one against.
   *
   * This is the lookup a general-purpose chatbot cannot do: the salesperson pastes one
   * conversation, but whether a commitment has now slipped twice is only visible against what was
   * signed off before.
   *
   * Only `confirmed` records are returned, on purpose. A `completed` record holds raw AI output
   * that no human has checked, and feeding unreviewed model output back in as "what we agreed
   * last time" would let one bad analysis propagate through every later one. Human confirmation
   * is therefore what promotes a record into the history the agent may rely on.
   *
   * `recordId` anchors the lookup rather than a customer name from the model, so a typo or an
   * invented name cannot silently return a different customer's history — or nothing at all.
   */
  async getCustomerHistory(scope: ConversationReviewScope, recordId: string, limit?: number) {
    const current = await this.getScopedRecord(scope, recordId)
    const size = clampLimit(limit)

    const rows = await this.repository.find({ where: scopeWhere(scope) })
    const previous = rows
      .filter((row) => row.id !== current.id && row.status === 'confirmed' && row.customerId === current.customerId)
      .sort((a, b) => historyTime(b) - historyTime(a))

    return {
      customerName: current.customerName,
      // Reported before the limit is applied, so the agent can tell "no history" from
      // "older conversations exist that you were not shown".
      totalConfirmed: previous.length,
      records: previous.slice(0, size).map(toHistoryItem)
    }
  }

  /**
   * Team/aggregate-level answer for chat questions like "how many customers" or "what's blocking
   * deals lately" — asked independent of any one record under review. Reuses the same
   * `buildInsights` the dashboard renders, so the chat answer and the workbench charts can never
   * disagree about what the numbers are.
   */
  async getStatsForAgent(scope: ConversationReviewScope): Promise<ConversationReviewStats> {
    const all = await this.repository.find({ where: scopeWhere(scope) })
    const customers = new Set(all.map((row) => row.customerId).filter(Boolean))
    return {
      totalRecords: all.length,
      totalCustomers: customers.size,
      insights: buildInsights(all)
    }
  }

  /**
   * Customer-name lookup for chat questions like "what's going on with 华东精密制造" — asked by
   * name, not by picking a row in the workbench. Matches by substring, on purpose: a search tool
   * that only accepted an exact name would be useless for a half-remembered one. Grouping is then
   * by the same exact identity `getCustomerHistory` uses, so two differently-spelled accounts
   * still surface as two separate matches for the agent to ask the salesperson to disambiguate —
   * search is deliberately looser at finding, never at conflating who is who.
   */
  async searchCustomers(
    scope: ConversationReviewScope,
    query: string,
    limit?: number
  ): Promise<ConversationCustomerSearchResult> {
    const trimmed = trimToUndefined(query) ?? ''
    if (!trimmed) {
      return { query: trimmed, totalMatches: 0, matches: [] }
    }
    const needle = trimmed.toLowerCase()
    const all = await this.repository.find({ where: scopeWhere(scope) })
    const hits = all.filter((row) => (row.customerName ?? '').toLowerCase().includes(needle))

    const groups = new Map<string, ConversationReviewRecord[]>()
    for (const row of hits) {
      const key = row.customerId ?? historyKey(row.customerName)
      const list = groups.get(key) ?? []
      list.push(row)
      groups.set(key, list)
    }

    const size = clampSearchLimit(limit)
    const matches = [...groups.values()]
      .map((records) => records.slice().sort((a, b) => historyTime(b) - historyTime(a)))
      .sort((a, b) => historyTime(b[0]) - historyTime(a[0]))
      .slice(0, size)
      .map((sorted) => {
        const latest = sorted[0]
        return {
          customerName: latest.customerName ?? '',
          recordCount: sorted.length,
          confirmedCount: sorted.filter((row) => row.status === 'confirmed').length,
          latestStatus: (latest.status ?? 'draft') as ConversationReviewStatus,
          latestOccurredAt: latest.occurredAt ?? latest.createdAt ?? undefined,
          recentRecords: sorted.slice(0, 3).map((row) => ({
            recordId: row.id as string,
            status: (row.status ?? 'draft') as ConversationReviewStatus,
            occurredAt: row.occurredAt ?? row.createdAt ?? undefined,
            summary: effectiveResult(row)?.summary
          }))
        }
      })

    return { query: trimmed, totalMatches: groups.size, matches }
  }

  /** Feeds the workbench view: a list on the left, the selected record's detail on the right. */
  async getViewData(scope: ConversationReviewScope, query: ConversationReviewListQuery = {}) {
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 20))

    const all = await this.repository.find({
      where: scopeWhere(scope),
      order: { updatedAt: 'DESC', createdAt: 'DESC' }
    })
    const filtered = filterRecords(all, query)
    const start = (page - 1) * pageSize

    const selected = query.recordId
      ? all.find((row) => row.id === query.recordId) ?? null
      : filtered[0] ?? null

    return {
      items: filtered.slice(start, start + pageSize).map(toListItem),
      total: filtered.length,
      page,
      pageSize,
      item: selected ? toDetailItem(selected) : undefined,
      summary: {
        mode: selected ? 'detail' : 'empty',
        stats: buildStats(all),
        // Aggregated over every record in scope, not only the filtered page — drilling into one
        // category must not silently redraw the dashboard it was launched from.
        insights: buildInsights(all),
        // The version a *new* analysis will be stamped with, shown once in the page header so it
        // does not have to be inferred from any one record. Read from the same constant
        // `saveAiResult` writes, so the header can never drift from what actually gets persisted.
        currentRuleVersion: RULE_VERSION,
        // Backs the rule-details modal opened from any rule-version tag. Always the *current*
        // rule content — a past version's own rule text is not retained, only its version string.
        ruleCatalog: getRuleDisclosure()
      }
    }
  }

  // ------------------------------------------------------------------ private

  private async getScopedRecord(scope: ConversationReviewScope, recordId: string) {
    const id = trimToUndefined(recordId)
    if (!id) {
      throw new BadRequestException('缺少业务记录 id')
    }
    // Scope comes from the host context, so an id supplied by the iframe or by the model can
    // never reach another seller's row.
    const record = await this.repository.findOne({
      where: { ...scopeWhere(scope), id }
    })
    if (!record) {
      throw new NotFoundException(`客户沟通记录 '${id}' 不存在或无权访问`)
    }
    return record
  }
}

// -------------------------------------------------------------------- helpers

/**
 * The message the workbench forwards into the Assistant chat. The plugin never calls a model
 * itself — the Assistant does, and then writes back through the middleware tools.
 *
 * Deliberately minimal, and deliberately free of `recordId`. The full procedure — required tool
 * call order, the six-dimension scorecard, category enums, the evidence requirement, what
 * carriedOver means — lives once in the assistant's system prompt
 * (`xpert-conversation-review-assistant.yaml`), which every analysis run already carries. This
 * text is what the salesperson sees rendered as a chat bubble, so it stays plain language; the
 * record id instead rides silently on `assistant.context.set` (see the remote component and
 * `ConversationReviewMiddleware.wrapToolCall`), which the tools read when a call omits recordId.
 */
export function buildAnalysisMessage(
  record: ConversationReviewRecord,
  options: { isRetry?: boolean; previousError?: string } = {}
) {
  return [
    options.isRetry
      ? `请重新分析这条与「${record.customerName}」的沟通记录。`
      : `请对这条与「${record.customerName}」的沟通记录做一次质检与跟进分析。`,
    options.isRetry ? `本次为第 ${record.retryCount ?? 0} 次重试。` : '',
    options.previousError ? `上次失败原因：${options.previousError}` : ''
  ]
    .filter((line) => line !== '')
    .join('\n')
}

function scopeColumns(scope: ConversationReviewScope) {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    createdById: scope.userId,
    assistantId: scope.assistantId,
    conversationId: scope.conversationId
  }
}

/**
 * Records belong to one salesperson inside one organization. Scoping reads by `createdById` as
 * well as tenant/org is what makes the "permission and data range" acceptance case pass.
 */
export function scopeWhere(scope: ConversationReviewScope) {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? undefined,
    createdById: scope.userId
  }
}

export function normalizeAnalysis(input: ConversationReviewAnalysis): ConversationReviewAnalysis {
  return {
    intentLevel: input.intentLevel ?? 'unknown',
    summary: trimToUndefined(input.summary),
    scores: normalizeScores(input.scores),
    requirements: normalizeList(input.requirements),
    concerns: normalizeIssues(input.concerns, 'concern'),
    risks: normalizeIssues(input.risks, 'risk'),
    missingInformation: normalizeList(input.missingInformation),
    nextActions: normalizeList(input.nextActions),
    carriedOver: normalizeList(input.carriedOver)
  }
}

/** When the conversation happened, for ordering a queue or a history. */
function occurredTime(row: ConversationReviewRecord) {
  const value = row.occurredAt ?? row.createdAt
  const time = value ? new Date(value).getTime() : NaN
  return Number.isNaN(time) ? 0 : time
}

/** Nest exceptions carry the readable text on `message`; anything else is stringified. */
function getMessage(error: unknown) {
  const message = (error as { message?: unknown })?.message
  return typeof message === 'string' && message.trim() ? message.trim() : String(error)
}

/**
 * History is ordered by when the conversation happened, not when it was signed off. Importing a
 * back-catalogue confirms many conversations within minutes of each other, and "the most recent
 * conversation with this customer" has to mean the most recent conversation.
 */
function historyTime(row: ConversationReviewRecord) {
  const value = row.occurredAt ?? row.confirmedAt ?? row.updatedAt
  const time = value ? new Date(value).getTime() : NaN
  return Number.isNaN(time) ? 0 : time
}

function clampLimit(limit: number | undefined) {
  const value = Math.floor(Number(limit))
  if (!Number.isFinite(value) || value < 1) {
    return CUSTOMER_HISTORY_DEFAULT_LIMIT
  }
  return Math.min(CUSTOMER_HISTORY_MAX_LIMIT, value)
}

function clampSearchLimit(limit: number | undefined) {
  const value = Math.floor(Number(limit))
  if (!Number.isFinite(value) || value < 1) {
    return CUSTOMER_SEARCH_DEFAULT_LIMIT
  }
  return Math.min(CUSTOMER_SEARCH_MAX_LIMIT, value)
}

function toHistoryItem(row: ConversationReviewRecord): ConversationHistoryItem {
  // The confirmed result is the signed-off one by construction: only confirmed rows get here.
  const result = normalizeAnalysis(row.confirmedResult ?? row.aiResult ?? {})
  return {
    id: row.id as string,
    // Both are given: the agent cites when the conversation happened, not when it was reviewed.
    occurredAt: row.occurredAt ?? row.createdAt ?? undefined,
    confirmedAt: row.confirmedAt ?? undefined,
    intentLevel: result.intentLevel,
    totalScore: totalScore(result.scores),
    summary: result.summary,
    nextActions: result.nextActions,
    missingInformation: result.missingInformation,
    risks: result.risks?.map((risk) => ({
      category: risk.category,
      severity: risk.severity,
      detail: risk.detail
    })),
    carriedOver: result.carriedOver
  }
}

/**
 * Keep only the six known axes and clamp them into range.
 *
 * Both edges matter: a model can return an extra dimension or a 0-10 scale, and the workbench
 * sends whatever is typed into a number field. An out-of-range value is clamped rather than
 * rejected, because losing the whole scorecard over one bad axis is worse than a capped number —
 * but an unknown axis is dropped, since it has nowhere to be drawn on a six-sided radar.
 *
 * A partial scorecard is kept as-is; the radar shows the missing axis as zero and the average
 * only counts the records that actually scored it.
 */
export function normalizeScores(value: ConversationReviewScores | undefined): ConversationReviewScores | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const scores: ConversationReviewScores = {}
  for (const dimension of SCORE_DIMENSIONS) {
    const raw = Number(value[dimension])
    if (!Number.isFinite(raw)) {
      continue
    }
    scores[dimension] = Math.min(100, Math.max(0, Math.round(raw)))
  }
  return Object.keys(scores).length ? scores : undefined
}

/** Mean of the axes present. Used for the trend line and for ranking conversations. */
export function totalScore(scores: ConversationReviewScores | undefined) {
  if (!scores) {
    return null
  }
  const values = SCORE_DIMENSIONS.map((dimension) => scores[dimension]).filter((value) => typeof value === 'number')
  if (!values.length) {
    return null
  }
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

const ISSUE_CATEGORIES: Record<ConversationIssueKind, readonly string[]> = {
  concern: CONCERN_CATEGORIES,
  risk: RISK_CATEGORIES
}

/**
 * Coerce whatever arrives into the controlled vocabulary.
 *
 * Two inputs have to survive here. The model can return a category outside the enum despite the
 * schema, and rows written before the classification existed hold a plain `string[]`. Both are
 * mapped onto `other` rather than dropped: losing the salesperson's text to enforce a taxonomy
 * would be the wrong trade, and an inflated `other` bucket is visible on the dashboard, which is
 * the correct place for that problem to show up.
 */
export function normalizeIssues(
  value: ConversationIssue[] | string[] | undefined,
  kind: ConversationIssueKind
): ConversationIssue[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const allowed = ISSUE_CATEGORIES[kind]
  const items: ConversationIssue[] = []
  for (const raw of value) {
    // Legacy free-text row, or a model that answered with a bare string.
    if (typeof raw === 'string') {
      const detail = raw.trim()
      if (detail) {
        items.push({ category: 'other', severity: 'medium', detail, source: 'model' })
      }
      continue
    }
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const detail = trimToUndefined(raw.detail)
    const evidence = trimToUndefined(raw.evidence)
    if (!detail && !evidence) {
      continue
    }
    items.push({
      category: allowed.includes(raw.category) ? raw.category : 'other',
      severity: ISSUE_SEVERITIES.includes(raw.severity as ConversationIssueSeverity)
        ? (raw.severity as ConversationIssueSeverity)
        : 'medium',
      detail,
      evidence,
      // Rule-detected risks are merged in server-side after normalization (see
      // mergeDeterministicRisks in the middleware), so anything arriving here already went
      // through the model-facing tool schema and is model output unless explicitly marked.
      source: raw.source === 'rule' ? 'rule' : 'model'
    })
  }
  return items.length ? items : undefined
}

/**
 * Normalize on read as well as on write, so records stored before the taxonomy existed render
 * in the same editor as new ones instead of crashing the view on a `string` where an object is
 * expected. Nothing is written back — the row is migrated the next time it is confirmed.
 */
function readAnalysis(value: ConversationReviewAnalysis | undefined | null) {
  return value ? normalizeAnalysis(value) : undefined
}

export function filterRecords(rows: ConversationReviewRecord[], query: ConversationReviewListQuery) {
  const search = trimToUndefined(query.search)?.toLowerCase()
  const issue = parseIssueFilter(query.issue)
  return rows.filter((row) => {
    if (query.status && row.status !== query.status) {
      return false
    }
    const result = effectiveResult(row)
    if (query.intentLevel && (result?.intentLevel ?? 'unknown') !== query.intentLevel) {
      return false
    }
    // Dashboard drill-down: a bar is only useful if it can open the conversations behind it.
    if (issue) {
      const issues = normalizeIssues(result?.[issue.kind === 'concern' ? 'concerns' : 'risks'], issue.kind) ?? []
      if (!issues.some((item) => item.category === issue.category)) {
        return false
      }
    }
    if (!search) {
      return true
    }
    return [row.customerName, row.conversation, row.aiResult?.summary, row.confirmedResult?.summary]
      .filter((value): value is string => typeof value === 'string')
      .some((value) => value.toLowerCase().includes(search))
  })
}

/** `concern:price` / `risk:over_promise`. Anything else is ignored rather than erroring. */
export function parseIssueFilter(value: string | undefined) {
  const raw = trimToUndefined(value)
  if (!raw) {
    return undefined
  }
  const [kind, category] = raw.split(':')
  if ((kind !== 'concern' && kind !== 'risk') || !category) {
    return undefined
  }
  return { kind: kind as ConversationIssueKind, category }
}

export function buildStats(rows: ConversationReviewRecord[]) {
  const stats: Record<ConversationReviewStatus | 'total', number> = {
    total: rows.length,
    draft: 0,
    processing: 0,
    completed: 0,
    confirmed: 0,
    failed: 0
  }
  for (const row of rows) {
    const status = (row.status ?? 'draft') as ConversationReviewStatus
    stats[status] = (stats[status] ?? 0) + 1
  }
  return stats
}

/**
 * The dashboard.
 *
 * Counting rows by status only says how much work the tool did, which is not a question a sales
 * manager has. What they ask is "what are customers actually pushing back on" and "can I trust
 * these numbers" — so the aggregation is over classified issues and intent, plus the agreement
 * between AI output and human sign-off.
 *
 * Distributions are computed over the *effective* result (confirmed if present, otherwise AI), so
 * a human correction immediately moves the dashboard rather than being shadowed by the raw AI
 * answer. Accuracy is the one place that deliberately reads both sides separately.
 */
export function buildInsights(rows: ConversationReviewRecord[]): ConversationReviewInsights {
  const intentCounts = new Map<ConversationIntentLevel, number>()
  const concerns = new Map<string, ConversationIssueBucket>()
  const risks = new Map<string, ConversationIssueBucket>()
  let analyzed = 0

  for (const row of rows) {
    const result = effectiveResult(row)
    if (!result) {
      continue
    }
    analyzed += 1
    const level = (result.intentLevel ?? 'unknown') as ConversationIntentLevel
    intentCounts.set(level, (intentCounts.get(level) ?? 0) + 1)
    collectIssues(concerns, normalizeIssues(result.concerns, 'concern'), 'concern')
    collectIssues(risks, normalizeIssues(result.risks, 'risk'), 'risk')
  }

  return {
    statusCounts: buildStats(rows),
    analyzed,
    intentDistribution: INTENT_LEVELS.map((level) => ({ level, count: intentCounts.get(level) ?? 0 })),
    concerns: sortBuckets(concerns),
    risks: sortBuckets(risks),
    scoreAverages: buildScoreAverages(rows),
    trend: buildTrend(rows),
    accuracy: buildAccuracy(rows),
    activityToday: buildActivityToday(rows)
  }
}

/**
 * Counts by `createdAt`/`updatedAt` landing on today, local time — see `ConversationActivityToday`
 * for why this has to be separate from `trend`.
 */
export function buildActivityToday(rows: ConversationReviewRecord[], today = new Date()): ConversationActivityToday {
  const todayKey = localDateKey(today) as string
  let createdToday = 0
  let updatedToday = 0
  for (const row of rows) {
    if (localDateKey(row.createdAt) === todayKey) {
      createdToday += 1
    }
    if (localDateKey(row.updatedAt) === todayKey) {
      updatedToday += 1
    }
  }
  return { createdToday, updatedToday }
}

/**
 * Team-level radar: the mean of each axis across every scored conversation.
 *
 * Each axis carries its own `sampleSize` because scorecards can be partial, and an average over
 * two records should not be presented with the same confidence as one over fifty.
 */
export function buildScoreAverages(rows: ConversationReviewRecord[]): ConversationScoreAverage[] {
  const totals = new Map<string, { sum: number; count: number }>()
  for (const row of rows) {
    const scores = normalizeScores(effectiveResult(row)?.scores)
    if (!scores) {
      continue
    }
    for (const dimension of SCORE_DIMENSIONS) {
      const value = scores[dimension]
      if (typeof value !== 'number') {
        continue
      }
      const entry = totals.get(dimension) ?? { sum: 0, count: 0 }
      entry.sum += value
      entry.count += 1
      totals.set(dimension, entry)
    }
  }
  return SCORE_DIMENSIONS.map((dimension) => {
    const entry = totals.get(dimension)
    return {
      dimension,
      average: entry ? Math.round(entry.sum / entry.count) : 0,
      sampleSize: entry ? entry.count : 0
    }
  })
}

/**
 * Daily series over a fixed window, including days with no activity.
 *
 * Empty days are emitted on purpose: dropping them would turn a two-week gap into a straight line
 * between two points and make a stalled pipeline look like a steady one. `avgScore` stays null on
 * those days rather than becoming zero, so the line breaks instead of diving to the floor.
 *
 * Conversations are bucketed by the day they *happened* — `occurredAt` when the source reported
 * it, falling back to when the record was filed. Bucketing by `createdAt` would stack a whole
 * imported back-catalogue onto the afternoon it was imported and turn the trend into a spike that
 * describes the import, not the sales activity.
 */
export function buildTrend(rows: ConversationReviewRecord[], today = new Date()): ConversationTrendPoint[] {
  const buckets = new Map<string, { count: number; scoreSum: number; scored: number; highIntent: number }>()
  for (const row of rows) {
    const date = localDateKey(row.occurredAt ?? row.createdAt)
    if (!date) {
      continue
    }
    const bucket = buckets.get(date) ?? { count: 0, scoreSum: 0, scored: 0, highIntent: 0 }
    bucket.count += 1
    const result = effectiveResult(row)
    const total = totalScore(normalizeScores(result?.scores))
    if (total !== null) {
      bucket.scoreSum += total
      bucket.scored += 1
    }
    if (result?.intentLevel === 'high') {
      bucket.highIntent += 1
    }
    buckets.set(date, bucket)
  }

  const series: ConversationTrendPoint[] = []
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  cursor.setDate(cursor.getDate() - (TREND_DAYS - 1))
  for (let day = 0; day < TREND_DAYS; day += 1) {
    const date = localDateKey(cursor) as string
    const bucket = buckets.get(date)
    series.push({
      date,
      count: bucket?.count ?? 0,
      avgScore: bucket?.scored ? Math.round(bucket.scoreSum / bucket.scored) : null,
      highIntent: bucket?.highIntent ?? 0
    })
    cursor.setDate(cursor.getDate() + 1)
  }
  return series
}

function localDateKey(value: Date | undefined | null) {
  if (!value) {
    return undefined
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function collectIssues(
  target: Map<string, ConversationIssueBucket>,
  issues: ConversationIssue[] | undefined,
  kind: ConversationIssueKind
) {
  if (!issues?.length) {
    return
  }
  // One conversation that raises price three times is three occurrences but one conversation;
  // both numbers are kept because they answer different questions.
  const seen = new Set<string>()
  for (const issue of issues) {
    const bucket = target.get(issue.category) ?? { kind, category: issue.category, count: 0, recordCount: 0, highCount: 0 }
    bucket.count += 1
    if (issue.severity === 'high') {
      bucket.highCount += 1
    }
    if (!seen.has(issue.category)) {
      seen.add(issue.category)
      bucket.recordCount += 1
    }
    target.set(issue.category, bucket)
  }
}

function sortBuckets(buckets: Map<string, ConversationIssueBucket>) {
  return [...buckets.values()].sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
}

/**
 * Every analysis field is compared when deciding whether the salesperson changed the AI's answer.
 * Reusing the declared field list means a field added later is measured automatically instead of
 * silently scoring as "never edited".
 */
const COMPARED_FIELDS = CONVERSATION_REVIEW_ANALYSIS_FIELDS

function buildAccuracy(rows: ConversationReviewRecord[]): ConversationReviewAccuracy {
  const fieldEdits: Record<string, number> = {}
  for (const field of COMPARED_FIELDS) {
    fieldEdits[field] = 0
  }
  let sampleSize = 0
  let intentAgreed = 0
  let acceptedAsIs = 0

  for (const row of rows) {
    // Only a signed-off record says anything about quality; a `completed` row has not been judged.
    if (row.status !== 'confirmed' || !row.aiResult || !row.confirmedResult) {
      continue
    }
    sampleSize += 1
    const ai = normalizeAnalysis(row.aiResult)
    const human = normalizeAnalysis(row.confirmedResult)
    let edited = false
    for (const field of COMPARED_FIELDS) {
      // `source` is provenance bookkeeping (rule vs model), not something the salesperson edits
      // through the workbench form — comparing it here would count an untouched rule-detected
      // risk as "edited" purely because the confirm form does not round-trip that field.
      const aiValue = field === 'concerns' || field === 'risks' ? stripIssueSource(ai[field] as ConversationIssue[] | undefined) : ai[field]
      const humanValue =
        field === 'concerns' || field === 'risks' ? stripIssueSource(human[field] as ConversationIssue[] | undefined) : human[field]
      if (!sameValue(aiValue, humanValue)) {
        fieldEdits[field] += 1
        edited = true
      }
    }
    if ((ai.intentLevel ?? 'unknown') === (human.intentLevel ?? 'unknown')) {
      intentAgreed += 1
    }
    if (!edited) {
      acceptedAsIs += 1
    }
  }

  return { sampleSize, intentAgreed, acceptedAsIs, fieldEdits }
}

function stripIssueSource(issues: ConversationIssue[] | undefined) {
  return issues?.map(({ source: _source, ...rest }) => rest)
}

/** Structural comparison; both sides are already normalized so key order is stable. */
function sameValue(a: unknown, b: unknown) {
  if (a === b) {
    return true
  }
  if (a === undefined || b === undefined) {
    return false
  }
  return JSON.stringify(a) === JSON.stringify(b)
}

function effectiveResult(row: ConversationReviewRecord) {
  return row.confirmedResult ?? row.aiResult ?? undefined
}

function toListItem(row: ConversationReviewRecord): ConversationReviewListItem {
  const result = effectiveResult(row)
  return {
    id: row.id as string,
    customerName: row.customerName ?? '',
    customerId: row.customerId ?? undefined,
    status: (row.status ?? 'draft') as ConversationReviewStatus,
    intentLevel: row.intentLevel,
    summary: result?.summary,
    conversationPreview: (row.conversation ?? '').slice(0, 80),
    errorMessage: row.errorMessage ?? undefined,
    retryCount: row.retryCount ?? 0,
    revision: row.revision ?? 0,
    source: (row.source ?? 'manual') as ConversationSource,
    occurredAt: row.occurredAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ruleVersion: row.ruleVersion ?? undefined
  }
}

function toDetailItem(row: ConversationReviewRecord): ConversationReviewDetailItem {
  return {
    ...toListItem(row),
    conversation: row.conversation ?? '',
    aiResult: readAnalysis(row.aiResult),
    confirmedResult: readAnalysis(row.confirmedResult),
    analyzedAt: row.analyzedAt ?? undefined,
    confirmedAt: row.confirmedAt ?? undefined
  }
}

function requireText(value: string | undefined, label: string, maxLength: number) {
  const text = trimToUndefined(value)
  if (!text) {
    throw new BadRequestException(`${label}不能为空`)
  }
  if (text.length > maxLength) {
    throw new BadRequestException(`${label}长度不能超过 ${maxLength} 个字符`)
  }
  return text
}

function normalizeList(value: string[] | undefined) {
  if (!Array.isArray(value)) {
    return undefined
  }
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length ? items : undefined
}

function trimToUndefined(value: string | undefined | null) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

// -------------------------------------------------------- simulated fetch helpers

/** `examples/` is copied next to `dist/lib` by `copy-assets.mjs`, alongside the remote component. */
async function readBundledExample(fileName: string) {
  return readFile(join(__dirname, '..', 'examples', fileName), 'utf8')
}

/** Exported so `conversation_review_import_conversations` can label per-file the same way when resolving chat attachments. */
export function labelSkipped(items: ConversationImportSkip[], label: string): ConversationImportSkip[] {
  return items.map((item) => ({ ...item, reason: `[${label}] ${item.reason}` }))
}

export function mergeImportResults(results: ConversationImportResult[]): ConversationImportResult {
  return results.reduce(
    (acc, result) => ({
      imported: acc.imported + result.imported,
      duplicates: acc.duplicates + result.duplicates,
      skipped: [...acc.skipped, ...result.skipped],
      recordIds: [...acc.recordIds, ...result.recordIds]
    }),
    { imported: 0, duplicates: 0, skipped: [], recordIds: [] } as ConversationImportResult
  )
}
