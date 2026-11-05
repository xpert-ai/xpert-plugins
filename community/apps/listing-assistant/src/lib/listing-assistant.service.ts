import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, In, IsNull, Repository } from 'typeorm'
import { ListingAiRun } from './entities/listing-ai-run.entity.js'
import { ListingDraft } from './entities/listing-draft.entity.js'
import { ListingSpec } from './entities/listing-spec.entity.js'
import { ListingTask } from './entities/listing-task.entity.js'
import { LISTING_SIMULATED_FAILURE_MARKER } from './constants.js'
import { ListingAiService } from './listing-ai.service.js'
import {
  buildFieldFlags,
  cleanText,
  mergeFieldFlags,
  normalizeAttributes,
  normalizeDraftInput,
  splitBatchSource
} from './listing-assistant.mapper.js'
import {
  ListingAiError,
  ListingError,
  type ListingDraftInput,
  type ListingScope,
  type ListingTaskDetail,
  type ListingTaskSummary
} from './types.js'

export type ListingWorkbenchQuery = {
  taskId?: string
  search?: string
  page?: number
  pageSize?: number
}

export type ListingParseOutcome = {
  detail: ListingTaskDetail
  outcome: 'parsed' | 'already_parsed'
}

@Injectable()
export class ListingAssistantService {
  constructor(
    @InjectRepository(ListingTask)
    private readonly tasks: Repository<ListingTask>,
    @InjectRepository(ListingDraft)
    private readonly drafts: Repository<ListingDraft>,
    @InjectRepository(ListingSpec)
    private readonly specs: Repository<ListingSpec>,
    @InjectRepository(ListingAiRun)
    private readonly runs: Repository<ListingAiRun>,
    private readonly dataSource: DataSource,
    private readonly ai: ListingAiService
  ) {}

  async getWorkbenchData(scope: ListingScope, query: ListingWorkbenchQuery) {
    await this.recoverStaleParsing(scope)
    const tasks = await this.listTasks(scope, query)
    const selectedId = query.taskId ?? tasks[0]?.id
    const selectedTask = selectedId ? await this.getTask(scope, selectedId) : null
    return { tasks, selectedTask }
  }

  async listTasks(scope: ListingScope, query: ListingWorkbenchQuery = {}): Promise<ListingTaskSummary[]> {
    const pageSize = Math.min(Math.max(query.pageSize ?? 50, 1), 100)
    const page = Math.max(query.page ?? 1, 1)
    const builder = this.tasks
      .createQueryBuilder('task')
      .where('task.tenantId = :tenantId', { tenantId: scope.tenantId })
      .andWhere(this.organizationClause(scope), this.organizationParams(scope))
      .orderBy('task.updatedAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)

    if (query.search?.trim()) {
      builder.andWhere('task.sourceText ILIKE :search', { search: `%${query.search.trim()}%` })
    }

    const rows = await builder.getMany()
    if (!rows.length) return []

    const ids = rows.map((row) => row.id as string)
    const drafts = await this.drafts.find({ where: { taskId: In(ids) } })
    const draftByTask = new Map(drafts.map((draft) => [draft.taskId, draft]))

    return rows.map((task) => {
      const draft = draftByTask.get(task.id as string)
      return {
        id: task.id as string,
        status: task.status,
        title: draft?.title ?? null,
        price: draft?.price ?? null,
        sourcePreview: task.sourceText.slice(0, 120),
        attemptCount: task.attemptCount,
        lastErrorMessage: task.lastErrorMessage ?? null,
        parsedAt: toIso(task.parsedAt),
        savedAt: toIso(task.savedAt),
        createdAt: toIso(task.createdAt),
        updatedAt: toIso(task.updatedAt)
      }
    })
  }

  async getTask(scope: ListingScope, taskId: string): Promise<ListingTaskDetail> {
    const task = await this.requireTask(scope, taskId)
    const draft = await this.drafts.findOne({ where: { taskId: task.id as string } })
    const specs = await this.specs.find({
      where: { taskId: task.id as string },
      order: { sortOrder: 'ASC' }
    })
    const runs = await this.runs.find({
      where: { taskId: task.id as string },
      order: { attempt: 'DESC' },
      take: 10
    })

    return {
      id: task.id as string,
      status: task.status,
      sourceText: task.sourceText,
      attemptCount: task.attemptCount,
      lastErrorCode: task.lastErrorCode ?? null,
      lastErrorMessage: task.lastErrorMessage ?? null,
      parsedAt: toIso(task.parsedAt),
      savedAt: toIso(task.savedAt),
      draft: draft
        ? {
            title: draft.title ?? null,
            description: draft.description ?? null,
            price: draft.price ?? null,
            currency: draft.currency ?? null,
            category: draft.category ?? null,
            attributes: draft.attributes ?? null,
            fieldFlags: draft.fieldFlags ?? null,
            specs: specs.map((spec) => ({
              name: spec.name,
              price: spec.price ?? null,
              stock: spec.stock ?? null
            }))
          }
        : null,
      runs: runs.map((run) => ({
        attempt: run.attempt,
        status: run.status,
        errorCode: run.errorCode ?? null,
        errorMessage: run.errorMessage ?? null,
        startedAt: toIso(run.startedAt),
        finishedAt: toIso(run.finishedAt)
      }))
    }
  }

  async createTask(scope: ListingScope, input: { sourceText: string }) {
    const sourceText = input.sourceText?.trim()
    if (!sourceText) {
      throw new ListingError('SOURCE_REQUIRED', 'Supplier copy is required.')
    }
    if (sourceText.length > 20000) {
      throw new ListingError('SOURCE_TOO_LONG', 'Supplier copy exceeds 20000 characters.')
    }

    const task = await this.tasks.save(
      this.tasks.create({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? null,
        createdById: scope.userId ?? null,
        xpertId: scope.xpertId ?? null,
        sourceText,
        status: 'draft',
        attemptCount: 0
      })
    )

    return this.getTask(scope, task.id as string)
  }

  async createTasksBatch(scope: ListingScope, input: { sourceText: string }) {
    const parts = splitBatchSource(input.sourceText ?? '')
    if (!parts.length) {
      throw new ListingError('SOURCE_REQUIRED', 'Supplier copy is required.')
    }
    if (parts.length > 20) {
      throw new ListingError('BATCH_TOO_LARGE', 'A batch can contain at most 20 listings.')
    }

    const taskIds: string[] = []
    for (const part of parts) {
      const detail = await this.createTask(scope, { sourceText: part })
      taskIds.push(detail.id)
    }
    return { taskIds, count: taskIds.length }
  }

  async parseTask(scope: ListingScope, taskId: string): Promise<ListingParseOutcome> {
    const task = await this.requireTask(scope, taskId)

    if (task.status === 'saved') {
      return { detail: await this.getTask(scope, taskId), outcome: 'already_parsed' }
    }

    const succeeded = await this.runs.findOne({
      where: { taskId: task.id as string, status: 'succeeded' }
    })
    if (succeeded && task.status === 'review') {
      return { detail: await this.getTask(scope, taskId), outcome: 'already_parsed' }
    }

    // Claim the task atomically: only one parser may move it into `parsing`.
    const claim = await this.claimForParsing(task)
    if (!claim) {
      const current = await this.getTask(scope, taskId)
      if (current.status === 'review' || current.status === 'saved') {
        return { detail: current, outcome: 'already_parsed' }
      }
      throw new ListingError('BUSY_PARSING', 'This task is already being parsed.')
    }
    const attempt = claim.attempt

    // A previous attempt that never finished must not stay `running` forever.
    await this.runs.update(
      { taskId: task.id as string, status: 'running' },
      {
        status: 'failed',
        errorCode: 'AI_RUN_INTERRUPTED',
        errorMessage: 'A previous extraction did not finish and was reclaimed.',
        finishedAt: new Date()
      }
    )

    const run = await this.runs.save(
      this.runs.create({
        taskId: task.id as string,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? null,
        attempt,
        status: 'running',
        startedAt: new Date()
      })
    )

    try {
      // Fail only the first attempt so the same-task retry path stays exercisable.
      if (task.sourceText.includes(LISTING_SIMULATED_FAILURE_MARKER) && (task.attemptCount ?? 0) === 0) {
        throw new ListingAiError('AI_SIMULATED_FAILURE', 'Simulated model failure for the demo path.')
      }
      const { extraction, raw } = await this.ai.extract(scope, task.sourceText)
      await this.applyExtraction(scope, task.id as string, extraction, raw, run.id as string)
      return { detail: await this.getTask(scope, taskId), outcome: 'parsed' }
    } catch (error) {
      const aiError = toListingAiError(error)
      await this.dataSource.transaction(async (manager) => {
        await manager.update(
          ListingTask,
          { id: task.id, tenantId: scope.tenantId },
          {
            status: 'failed',
            lastErrorCode: aiError.code,
            lastErrorMessage: aiError.message
          }
        )
        await manager.update(
          ListingAiRun,
          { id: run.id },
          {
            status: 'failed',
            errorCode: aiError.code,
            errorMessage: aiError.message,
            finishedAt: new Date()
          }
        )
      })
      throw aiError
    }
  }

  async retryParse(scope: ListingScope, taskId: string): Promise<ListingParseOutcome> {
    const task = await this.requireTask(scope, taskId)
    if (task.status === 'saved') {
      return { detail: await this.getTask(scope, taskId), outcome: 'already_parsed' }
    }
    const succeeded = await this.runs.findOne({
      where: { taskId: task.id as string, status: 'succeeded' }
    })
    if (succeeded) {
      // Retrying a task that already produced a draft must not create a second business result.
      return { detail: await this.getTask(scope, taskId), outcome: 'already_parsed' }
    }
    return this.parseTask(scope, taskId)
  }

  async saveDraft(scope: ListingScope, taskId: string, input: ListingDraftInput) {
    const task = await this.requireTask(scope, taskId)
    const existing = await this.drafts.findOne({ where: { taskId: task.id as string } })

    const normalized = normalizeDraftInput(input)
    if (!normalized.title && !normalized.description && !normalized.price) {
      throw new ListingError('DRAFT_REQUIRED', 'Provide at least a title, description or price before saving.')
    }

    await this.dataSource.transaction(async (manager) => {
      const now = new Date()
      const flags = mergeFieldFlags(existing?.fieldFlags ?? null, normalized)
      const draft = existing ?? manager.create(ListingDraft, {
        taskId: task.id as string,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? null
      })

      draft.title = normalized.title
      draft.description = normalized.description
      draft.price = normalized.price
      draft.currency = normalized.currency ?? existing?.currency ?? 'CNY'
      draft.category = normalized.category
      draft.attributes = normalized.attributes ?? existing?.attributes ?? null
      draft.fieldFlags = Object.keys(flags).length ? flags : null
      await manager.save(ListingDraft, draft)

      if (normalized.specs) {
        await manager.delete(ListingSpec, { taskId: task.id as string })
        if (normalized.specs.length) {
          await manager.save(
            ListingSpec,
            normalized.specs.map((spec, index) =>
              manager.create(ListingSpec, {
                taskId: task.id as string,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId ?? null,
                name: spec.name,
                price: spec.price ?? null,
                stock: spec.stock ?? null,
                sortOrder: index
              })
            )
          )
        }
      }

      await manager.update(
        ListingTask,
        { id: task.id, tenantId: scope.tenantId },
        { status: 'saved', savedAt: now, lastErrorCode: null, lastErrorMessage: null }
      )
    })

    return this.getTask(scope, taskId)
  }

  private async applyExtraction(
    scope: ListingScope,
    taskId: string,
    extraction: Awaited<ReturnType<ListingAiService['extract']>>['extraction'],
    raw: string,
    runId: string
  ) {
    const flags = buildFieldFlags(extraction)

    await this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(ListingDraft, { where: { taskId } })
      const draft = existing ?? manager.create(ListingDraft, {
        taskId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? null
      })

      draft.title = cleanText(extraction.title, 200)
      draft.description = cleanText(extraction.description, 20000)
      draft.price = cleanText(extraction.price, 40)
      draft.currency = cleanText(extraction.currency, 10) ?? 'CNY'
      draft.category = cleanText(extraction.category, 120)
      draft.attributes = normalizeAttributes(extraction.attributes)
      draft.fieldFlags = Object.keys(flags).length ? flags : null
      await manager.save(ListingDraft, draft)

      await manager.delete(ListingSpec, { taskId })
      const specs = (extraction.specs ?? []).filter((spec) => spec.name?.trim())
      if (specs.length) {
        await manager.save(
          ListingSpec,
          specs.map((spec, index) =>
            manager.create(ListingSpec, {
              taskId,
              tenantId: scope.tenantId,
              organizationId: scope.organizationId ?? null,
              name: spec.name.trim(),
              price: spec.price ?? null,
              stock: spec.stock ?? null,
              sortOrder: index
            })
          )
        )
      }

      await manager.update(
        ListingTask,
        { id: taskId, tenantId: scope.tenantId },
        {
          status: 'review',
          parsedAt: new Date(),
          lastErrorCode: null,
          lastErrorMessage: null
        }
      )
      await manager.update(
        ListingAiRun,
        { id: runId },
        { status: 'succeeded', rawOutput: raw.slice(0, 50000), finishedAt: new Date() }
      )
    })
  }

  /**
   * Lazily repairs extractions that were interrupted (for example, the API
   * process stopped mid-call). Runs when the workbench loads so operators see a
   * failed task with a retry action instead of an endless "parsing" row.
   */
  private async recoverStaleParsing(scope: ListingScope) {
    const cutoff = new Date(Date.now() - 10 * 60_000)
    const stale = await this.tasks
      .createQueryBuilder('task')
      .select('task.id', 'id')
      .where('task.tenantId = :tenantId', { tenantId: scope.tenantId })
      .andWhere(this.organizationClause(scope), this.organizationParams(scope))
      .andWhere(`task.status = 'parsing' AND task."updatedAt" < :cutoff`, { cutoff })
      .getRawMany<{ id: string }>()
    if (!stale.length) return

    const taskIds = stale.map((row) => row.id)
    await this.tasks.update(
      { id: In(taskIds) },
      {
        status: 'failed',
        lastErrorCode: 'AI_RUN_INTERRUPTED',
        lastErrorMessage: 'A previous extraction did not finish.'
      }
    )
    await this.runs.update(
      { taskId: In(taskIds), status: 'running' },
      {
        status: 'failed',
        errorCode: 'AI_RUN_INTERRUPTED',
        errorMessage: 'A previous extraction did not finish.',
        finishedAt: new Date()
      }
    )
  }

  /**
   * Atomically moves a task into `parsing` and increments its attempt counter.
   * A stale `parsing` task (abandoned run) becomes claimable after five minutes.
   * Returns null when another operation already owns the task.
   */
  private async claimForParsing(task: ListingTask): Promise<{ attempt: number } | null> {
    const staleBefore = new Date(Date.now() - 5 * 60_000)
    const result = await this.tasks
      .createQueryBuilder()
      .update(ListingTask)
      .set({
        status: 'parsing',
        attemptCount: () => `"attemptCount" + 1`,
        lastErrorCode: null,
        lastErrorMessage: null
      })
      .where('id = :id', { id: task.id })
      .andWhere('"tenantId" = :tenantId', { tenantId: task.tenantId })
      .andWhere(
        `("status" IN ('draft', 'failed') OR ("status" = 'parsing' AND "updatedAt" < :staleBefore))`,
        { staleBefore }
      )
      .execute()
    if (!result.affected) return null

    const claimed = await this.tasks.findOne({ where: { id: task.id, tenantId: task.tenantId } })
    return claimed ? { attempt: claimed.attemptCount } : null
  }

  private async requireTask(scope: ListingScope, taskId: string) {
    const task = await this.tasks.findOne({
      where: {
        id: taskId,
        tenantId: scope.tenantId,
        ...(scope.organizationId ? { organizationId: scope.organizationId } : { organizationId: IsNull() })
      }
    })
    if (!task) {
      throw new ListingError('TASK_NOT_FOUND', 'Listing task not found or not accessible.')
    }
    return task
  }

  private organizationClause(scope: ListingScope) {
    return scope.organizationId ? 'task.organizationId = :organizationId' : 'task.organizationId IS NULL'
  }

  private organizationParams(scope: ListingScope) {
    return scope.organizationId ? { organizationId: scope.organizationId } : {}
  }
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toListingAiError(error: unknown): ListingAiError {
  if (error instanceof ListingAiError) return error
  if (error instanceof Error && error.message) {
    return new ListingAiError('AI_CALL_FAILED', error.message.slice(0, 1000))
  }
  return new ListingAiError('AI_CALL_FAILED', '模型调用失败，请稍后重试。')
}
