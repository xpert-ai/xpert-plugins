import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, MoreThanOrEqual, Repository } from 'typeorm'
import { ScrapeTask, ScrapeTaskLog } from './entities'
import { ScrapeTaskIntakeMockCatalogService } from './scrape-task-intake-mock-catalog.service'
import type {
  ScrapeTaskGeneratedInput,
  ScrapeTaskLogAction,
  ScrapeTaskScope,
  ScrapeTaskSearchInput,
  ScrapeTaskStatus,
  ScrapeTaskSupplementDraftInput,
  ScrapeTaskUpdateInput
} from './types'

const EDITABLE_STATUSES: ScrapeTaskStatus[] = ['pending_confirmation', 'needs_supplement']
const DEDUPE_LOOKBACK_DAYS = 7
const DEDUPE_STATUSES: ScrapeTaskStatus[] = ['pending_confirmation', 'needs_supplement', 'confirmed']

@Injectable()
export class ScrapeTaskIntakeService {
  constructor(
    @InjectRepository(ScrapeTask)
    private readonly taskRepository: Repository<ScrapeTask>,
    @InjectRepository(ScrapeTaskLog)
    private readonly logRepository: Repository<ScrapeTaskLog>,
    private readonly catalogService: ScrapeTaskIntakeMockCatalogService
  ) {}

  async saveGeneratedTask(input: ScrapeTaskGeneratedInput, scope: ScrapeTaskScope) {
    const originalContent = trimToUndefined(input.originalContent)
    if (!originalContent) {
      throw new BadRequestException('originalContent is required')
    }

    const normalizedInput = normalizeGeneratedTaskInput(input)
    const existing = await this.findDuplicateTask(scope, originalContent)
    const now = new Date()
    const completenessTips = normalizeCompletenessTips(normalizedInput)

    if (existing) {
      await this.writeLog(scope, existing, 'dedupe_skipped', {
        remark: 'Duplicate scraping request received. The earlier open task was returned instead of creating a new one.'
      })
      return existing
    }

    return this.taskRepository.manager.transaction(async (manager) => {
      const taskRepository = manager.getRepository(ScrapeTask)
      const logRepository = manager.getRepository(ScrapeTaskLog)
      const task = await taskRepository.save(
        taskRepository.create({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId ?? undefined,
          createdById: scope.userId ?? undefined,
          assistantId: scope.assistantId ?? undefined,
          conversationId: scope.conversationId ?? undefined,
          taskNo: generateTaskNo(now),
          status: completenessTips?.length ? 'needs_supplement' : 'pending_confirmation',
          sourceType: normalizedInput.sourceType ?? 'agent_chat',
          title: trimToUndefined(normalizedInput.title) ?? buildTitle(normalizedInput),
          originalContent,
          requesterName: trimToUndefined(normalizedInput.requesterName),
          requesterDepartment: trimToUndefined(normalizedInput.requesterDepartment),
          requesterContact: trimToUndefined(normalizedInput.requesterContact),
          targetUrl: trimToUndefined(normalizedInput.targetUrl),
          targetSite: trimToUndefined(normalizedInput.targetSite),
          pagesScope: normalizedInput.pagesScope,
          dataFields: normalizeDataFields(normalizedInput.dataFields),
          crawlFrequency: normalizedInput.crawlFrequency,
          deliveryFormat: normalizedInput.deliveryFormat,
          estimatedVolume: trimToUndefined(normalizedInput.estimatedVolume),
          authRequired: normalizedInput.authRequired,
          priority: normalizedInput.priority ?? 'medium',
          antiBotNotes: trimToUndefined(normalizedInput.antiBotNotes),
          complianceNotes: trimToUndefined(normalizedInput.complianceNotes),
          completenessTips,
          aiConfidence: normalizedInput.aiConfidence,
          aiRawResult: normalizedInput.aiRawResult,
          confirmedTitle: trimToUndefined(normalizedInput.title) ?? buildTitle(normalizedInput),
          confirmedTargetUrl: trimToUndefined(normalizedInput.targetUrl),
          confirmedTargetSite: trimToUndefined(normalizedInput.targetSite),
          confirmedPagesScope: normalizedInput.pagesScope,
          confirmedDataFields: normalizeDataFields(normalizedInput.dataFields),
          confirmedCrawlFrequency: normalizedInput.crawlFrequency,
          confirmedDeliveryFormat: normalizedInput.deliveryFormat,
          confirmedPriority: normalizedInput.priority ?? 'medium',
          lastOperatorId: scope.userId ?? undefined,
          lastOperatedAt: now
        })
      )

      await this.writeLogWithRepository(logRepository, scope, task, 'ai_generated', {
        remark: 'AI generated scraping task spec from the natural-language request.',
        snapshot: toTaskSnapshot(task)
      })

      return task
    })
  }

  async getViewData(
    scope: ScrapeTaskScope,
    input: {
      taskId?: string
      status?: ScrapeTaskStatus
      priority?: string
      search?: string
      page?: number
      pageSize?: number
    } = {}
  ) {
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 20
    const allItems = await this.findScopedTasks(scope)
    const filtered = filterTasks(allItems, input)
    const selected = input.taskId
      ? await this.getTaskDetail(scope, input.taskId)
      : filtered[0]
        ? await this.getTaskDetail(scope, filtered[0].id as string)
        : null
    const start = Math.max(0, (page - 1) * pageSize)

    return {
      items: filtered.slice(start, start + pageSize).map(toTaskListItem),
      total: filtered.length,
      item: selected ? toTaskDetailItem(selected.task, selected.logs) : undefined,
      summary: {
        mode: selected ? 'detail' : 'empty',
        stats: buildStats(allItems),
        latestTask: allItems[0] ? toTaskListItem(allItems[0]) : undefined
      },
      meta: {
        catalog: this.catalogService.getCatalog()
      }
    }
  }

  async searchTasks(scope: ScrapeTaskScope, input: ScrapeTaskSearchInput = {}) {
    const allItems = await this.findScopedTasks(scope)
    const filtered = filterTasks(allItems, input)
    const page = input.page ?? 1
    const pageSize = Math.min(Math.max(input.pageSize ?? 10, 1), 50)
    const start = Math.max(0, (page - 1) * pageSize)
    return {
      total: filtered.length,
      page,
      pageSize,
      items: filtered.slice(start, start + pageSize).map(toTaskListItem)
    }
  }

  async getTaskDetail(scope: ScrapeTaskScope, taskId: string) {
    const task = await this.getScopedTask(scope, taskId)
    const logs = await this.findTaskLogs(scope, taskId)
    return { task, logs }
  }

  async getTaskDetailForAgent(scope: ScrapeTaskScope, taskId: string) {
    const { task, logs } = await this.getTaskDetail(scope, taskId)
    return toTaskDetailItem(task, logs)
  }

  async updateTask(scope: ScrapeTaskScope, taskId: string, input: ScrapeTaskUpdateInput) {
    const task = await this.getScopedTask(scope, taskId)
    this.assertEditable(task)
    const before = toTaskSnapshot(task)
    const normalized = normalizeUpdateInput(input)
    Object.assign(task, {
      title: normalized.title ?? task.title,
      requesterName: normalized.requesterName ?? task.requesterName,
      requesterDepartment: normalized.requesterDepartment ?? task.requesterDepartment,
      requesterContact: normalized.requesterContact ?? task.requesterContact,
      targetUrl: normalized.targetUrl ?? task.targetUrl,
      targetSite: normalized.targetSite ?? task.targetSite,
      pagesScope: normalized.pagesScope ?? task.pagesScope,
      dataFields: normalized.dataFields ?? task.dataFields,
      crawlFrequency: normalized.crawlFrequency ?? task.crawlFrequency,
      deliveryFormat: normalized.deliveryFormat ?? task.deliveryFormat,
      estimatedVolume: normalized.estimatedVolume ?? task.estimatedVolume,
      authRequired: normalized.authRequired ?? task.authRequired,
      priority: normalized.priority ?? task.priority,
      antiBotNotes: normalized.antiBotNotes ?? task.antiBotNotes,
      complianceNotes: normalized.complianceNotes ?? task.complianceNotes,
      lastOperatorId: scope.userId ?? undefined,
      lastOperatedAt: new Date()
    })
    await this.taskRepository.save(task)
    await this.writeLog(scope, task, 'updated', {
      remark: trimToUndefined(input.remark),
      changedFields: collectChangedFields(before, toTaskSnapshot(task))
    })
    return task
  }

  async markNeedsSupplement(scope: ScrapeTaskScope, taskId: string, input: { reason?: string; remark?: string }) {
    const task = await this.getScopedTask(scope, taskId)
    this.assertEditable(task)
    task.status = 'needs_supplement'
    task.lastOperatorId = scope.userId ?? undefined
    task.lastOperatedAt = new Date()
    await this.taskRepository.save(task)
    await this.writeLog(scope, task, 'needs_supplement', {
      reason: trimToUndefined(input.reason),
      remark: trimToUndefined(input.remark)
    })
    return task
  }

  async prepareSupplementDraft(scope: ScrapeTaskScope, taskId: string, input: ScrapeTaskSupplementDraftInput) {
    const task = await this.getScopedTask(scope, taskId)
    this.assertEditable(task)
    const draft = {
      supplementContent: trimToUndefined(input.supplementContent),
      title: trimToUndefined(input.title),
      targetUrl: trimToUndefined(input.targetUrl),
      targetSite: trimToUndefined(input.targetSite),
      pagesScope: input.pagesScope,
      dataFields: normalizeDataFields(input.dataFields),
      crawlFrequency: input.crawlFrequency,
      deliveryFormat: input.deliveryFormat,
      estimatedVolume: trimToUndefined(input.estimatedVolume),
      authRequired: input.authRequired,
      priority: input.priority,
      antiBotNotes: trimToUndefined(input.antiBotNotes),
      complianceNotes: trimToUndefined(input.complianceNotes),
      confidence: input.confidence,
      rationale: trimToUndefined(input.rationale)
    }
    task.aiSupplementDraft = draft
    task.aiSupplementDraftedAt = new Date()
    task.lastOperatorId = scope.userId ?? undefined
    task.lastOperatedAt = new Date()
    await this.taskRepository.save(task)
    await this.writeLog(scope, task, 'supplement_draft', {
      remark: 'AI supplement draft was prepared for human one-click fill.'
    })
    return task
  }

  async saveSupplement(scope: ScrapeTaskScope, taskId: string, input: ScrapeTaskUpdateInput & { remark?: string }) {
    const task = await this.getScopedTask(scope, taskId)
    this.assertEditable(task)
    const before = toTaskSnapshot(task)
    const normalized = normalizeUpdateInput(input)
    Object.assign(task, {
      title: normalized.title ?? task.title,
      targetUrl: normalized.targetUrl ?? task.targetUrl,
      targetSite: normalized.targetSite ?? task.targetSite,
      pagesScope: normalized.pagesScope ?? task.pagesScope,
      dataFields: normalized.dataFields ?? task.dataFields,
      crawlFrequency: normalized.crawlFrequency ?? task.crawlFrequency,
      deliveryFormat: normalized.deliveryFormat ?? task.deliveryFormat,
      estimatedVolume: normalized.estimatedVolume ?? task.estimatedVolume,
      authRequired: normalized.authRequired ?? task.authRequired,
      priority: normalized.priority ?? task.priority,
      antiBotNotes: normalized.antiBotNotes ?? task.antiBotNotes,
      complianceNotes: normalized.complianceNotes ?? task.complianceNotes,
      aiSupplementDraft: null,
      aiSupplementDraftedAt: null,
      status: 'pending_confirmation',
      lastOperatorId: scope.userId ?? undefined,
      lastOperatedAt: new Date()
    })
    await this.taskRepository.save(task)
    await this.writeLog(scope, task, 'supplement_saved', {
      remark: trimToUndefined(input.remark),
      changedFields: collectChangedFields(before, toTaskSnapshot(task))
    })
    return task
  }

  async confirmTask(scope: ScrapeTaskScope, taskId: string, input: ScrapeTaskUpdateInput) {
    const task = await this.getScopedTask(scope, taskId)
    this.assertEditable(task)
    const normalized = normalizeUpdateInput(input)
    const now = new Date()
    Object.assign(task, {
      confirmedTitle: normalized.title ?? task.title,
      confirmedTargetUrl: normalized.targetUrl ?? task.targetUrl,
      confirmedTargetSite: normalized.targetSite ?? task.targetSite,
      confirmedPagesScope: normalized.pagesScope ?? task.pagesScope,
      confirmedDataFields: normalized.dataFields ?? task.dataFields,
      confirmedCrawlFrequency: normalized.crawlFrequency ?? task.crawlFrequency,
      confirmedDeliveryFormat: normalized.deliveryFormat ?? task.deliveryFormat,
      confirmedPriority: normalized.priority ?? task.priority,
      assigneeName: normalized.assigneeName ?? task.assigneeName,
      status: 'confirmed' as const,
      confirmedAt: now,
      lastOperatorId: scope.userId ?? undefined,
      lastOperatedAt: now
    })
    await this.taskRepository.save(task)
    await this.writeLog(scope, task, 'confirmed', {
      remark: trimToUndefined(input.remark),
      snapshot: toTaskSnapshot(task)
    })
    return task
  }

  async startProcessing(scope: ScrapeTaskScope, taskId: string) {
    const task = await this.getScopedTask(scope, taskId)
    if (task.status !== 'confirmed') {
      throw new BadRequestException('Only confirmed tasks can be started')
    }
    task.status = 'in_progress'
    task.startedAt = new Date()
    task.lastOperatorId = scope.userId ?? undefined
    task.lastOperatedAt = new Date()
    await this.taskRepository.save(task)
    await this.writeLog(scope, task, 'started', { remark: 'Scraping task processing started.' })
    return task
  }

  async completeTask(scope: ScrapeTaskScope, taskId: string, input: { completedSummary?: string }) {
    const task = await this.getScopedTask(scope, taskId)
    if (task.status !== 'in_progress') {
      throw new BadRequestException('Only in-progress tasks can be completed')
    }
    task.status = 'completed'
    task.completedAt = new Date()
    task.completedSummary = trimToUndefined(input.completedSummary)
    task.lastOperatorId = scope.userId ?? undefined
    task.lastOperatedAt = new Date()
    await this.taskRepository.save(task)
    await this.writeLog(scope, task, 'completed', {
      remark: trimToUndefined(input.completedSummary),
      snapshot: toTaskSnapshot(task)
    })
    return task
  }

  async rejectAndClose(scope: ScrapeTaskScope, taskId: string, input: { reason?: string }) {
    const task = await this.getScopedTask(scope, taskId)
    this.assertEditable(task)
    task.status = 'rejected'
    task.rejectionReason = trimToUndefined(input.reason)
    task.rejectedAt = new Date()
    task.lastOperatorId = scope.userId ?? undefined
    task.lastOperatedAt = new Date()
    await this.taskRepository.save(task)
    await this.writeLog(scope, task, 'rejected', { reason: trimToUndefined(input.reason) })
    return task
  }

  getCatalog() {
    return this.catalogService.getCatalog()
  }

  private async findDuplicateTask(scope: ScrapeTaskScope, originalContent: string) {
    if (!scope.conversationId) {
      return null
    }
    const since = new Date()
    since.setDate(since.getDate() - DEDUPE_LOOKBACK_DAYS)
    const candidates = await this.taskRepository.find({
      where: {
        ...this.scopeWhere(scope),
        conversationId: scope.conversationId,
        originalContent,
        status: In(DEDUPE_STATUSES),
        createdAt: MoreThanOrEqual(since)
      },
      order: { createdAt: 'DESC' },
      take: 1
    })
    return candidates[0] ?? null
  }

  private async findScopedTasks(scope: ScrapeTaskScope) {
    return this.taskRepository.find({
      where: this.scopeWhere(scope),
      order: { createdAt: 'DESC' }
    })
  }

  private async findTaskLogs(scope: ScrapeTaskScope, taskId: string) {
    return this.logRepository.find({
      where: { ...this.scopeWhere(scope), taskId },
      order: { createdAt: 'ASC' }
    })
  }

  private async getScopedTask(scope: ScrapeTaskScope, taskId: string) {
    const task = await this.taskRepository.findOne({
      where: {
        ...this.scopeWhere(scope),
        id: taskId
      }
    })
    if (!task) {
      throw new NotFoundException(`Scrape task '${taskId}' was not found`)
    }
    return task
  }

  private scopeWhere(scope: ScrapeTaskScope) {
    return {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId ?? undefined
    }
  }

  private assertEditable(task: ScrapeTask) {
    if (!task.status || !EDITABLE_STATUSES.includes(task.status)) {
      throw new BadRequestException('Only pending confirmation or needs supplement tasks can be edited')
    }
  }

  private async writeLog(
    scope: ScrapeTaskScope,
    task: ScrapeTask,
    action: ScrapeTaskLogAction,
    input: {
      reason?: string
      remark?: string
      changedFields?: Array<{ field: string; before?: unknown; after?: unknown }>
      snapshot?: unknown
    } = {}
  ) {
    await this.writeLogWithRepository(this.logRepository, scope, task, action, input)
  }

  private async writeLogWithRepository(
    logRepository: Repository<ScrapeTaskLog>,
    scope: ScrapeTaskScope,
    task: ScrapeTask,
    action: ScrapeTaskLogAction,
    input: {
      reason?: string
      remark?: string
      changedFields?: Array<{ field: string; before?: unknown; after?: unknown }>
      snapshot?: unknown
    } = {}
  ) {
    await logRepository.save(
      logRepository.create({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? undefined,
        taskId: task.id,
        action,
        operatorId: scope.userId ?? undefined,
        detail: {
          reason: input.reason,
          remark: input.remark,
          changedFields: input.changedFields,
          snapshot: input.snapshot
        }
      })
    )
  }
}

function trimToUndefined(value: string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeStringArray(value: string[] | null | undefined) {
  const items = (value ?? []).filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
  return items.length ? items : undefined
}

function normalizeDataFields(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const fields = value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      name: typeof item['name'] === 'string' ? item['name'].trim() : '',
      description: typeof item['description'] === 'string' ? item['description'].trim() : undefined,
      example: typeof item['example'] === 'string' ? item['example'].trim() : undefined,
      required: typeof item['required'] === 'boolean' ? item['required'] : undefined
    }))
    .filter((item) => item.name)
  return fields.length ? fields : undefined
}

function normalizeCompletenessTips(input: ScrapeTaskGeneratedInput) {
  const tips = normalizeStringArray(input.completenessTips)
  if (!tips?.length) {
    return undefined
  }
  const hasCoreFields = Boolean(trimToUndefined(input.targetUrl) && normalizeDataFields(input.dataFields)?.length)
  const normalized = hasCoreFields ? tips.filter((tip) => !isResolvedCoreFieldsTip(tip)) : tips
  return normalized.length ? normalized : undefined
}

function isResolvedCoreFieldsTip(tip: string) {
  return /目标(站点|网址)|采集字段/.test(tip)
}

function generateTaskNo(date: Date) {
  const yyyy = String(date.getFullYear())
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  return `ST-${yyyy}${mm}${dd}-${random}`
}

function buildTitle(input: ScrapeTaskGeneratedInput) {
  const site = trimToUndefined(input.targetSite) || trimToUndefined(input.targetUrl)
  const fieldCount = normalizeDataFields(input.dataFields)?.length ?? 0
  if (site) {
    return fieldCount ? `${site}采集(约 ${fieldCount} 个字段)` : `${site}采集`
  }
  return '采集需求'
}

function normalizeGeneratedTaskInput(input: ScrapeTaskGeneratedInput): ScrapeTaskGeneratedInput {
  return {
    ...input,
    originalContent: trimToUndefined(input.originalContent) ?? '',
    title: trimToUndefined(input.title),
    requesterName: trimToUndefined(input.requesterName),
    requesterDepartment: trimToUndefined(input.requesterDepartment),
    requesterContact: trimToUndefined(input.requesterContact),
    targetUrl: trimToUndefined(input.targetUrl),
    targetSite: trimToUndefined(input.targetSite),
    antiBotNotes: trimToUndefined(input.antiBotNotes),
    complianceNotes: trimToUndefined(input.complianceNotes),
    estimatedVolume: trimToUndefined(input.estimatedVolume),
    dataFields: normalizeDataFields(input.dataFields),
    completenessTips: normalizeStringArray(input.completenessTips)
  }
}

function normalizeUpdateInput(input: ScrapeTaskUpdateInput) {
  return {
    ...input,
    title: trimToUndefined(input.title),
    requesterName: trimToUndefined(input.requesterName),
    requesterDepartment: trimToUndefined(input.requesterDepartment),
    requesterContact: trimToUndefined(input.requesterContact),
    targetUrl: trimToUndefined(input.targetUrl),
    targetSite: trimToUndefined(input.targetSite),
    antiBotNotes: trimToUndefined(input.antiBotNotes),
    complianceNotes: trimToUndefined(input.complianceNotes),
    estimatedVolume: trimToUndefined(input.estimatedVolume),
    dataFields: normalizeDataFields(input.dataFields),
    assigneeName: trimToUndefined(input.assigneeName)
  }
}

function toTaskSnapshot(task: ScrapeTask) {
  return {
    taskNo: task.taskNo,
    status: task.status,
    title: task.title,
    requesterName: task.requesterName,
    requesterDepartment: task.requesterDepartment,
    targetUrl: task.targetUrl,
    targetSite: task.targetSite,
    pagesScope: task.pagesScope,
    dataFields: task.dataFields,
    crawlFrequency: task.crawlFrequency,
    deliveryFormat: task.deliveryFormat,
    estimatedVolume: task.estimatedVolume,
    authRequired: task.authRequired,
    priority: task.priority,
    antiBotNotes: task.antiBotNotes,
    complianceNotes: task.complianceNotes,
    completenessTips: task.completenessTips,
    aiConfidence: task.aiConfidence
  }
}

function collectChangedFields(before: ReturnType<typeof toTaskSnapshot>, after: ReturnType<typeof toTaskSnapshot>) {
  const fields: Array<{ field: string; before?: unknown; after?: unknown }> = []
  for (const key of Object.keys(after) as Array<keyof typeof after>) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      fields.push({ field: key, before: before[key], after: after[key] })
    }
  }
  return fields
}

function filterTasks(
  allItems: ScrapeTask[],
  input: { status?: string; priority?: string; search?: string }
) {
  const status = trimToUndefined(input.status)
  const priority = trimToUndefined(input.priority)
  const search = trimToUndefined(input.search)?.toLowerCase()
  return allItems.filter((item) => {
    if (status && item.status !== status) return false
    if (priority && item.priority !== priority) return false
    if (search) {
      const haystack = [item.taskNo, item.title, item.originalContent, item.targetSite, item.targetUrl, item.requesterName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(search)) return false
    }
    return true
  })
}

function buildStats(items: ScrapeTask[]) {
  const stats: Record<ScrapeTaskStatus, number> = {
    pending_confirmation: 0,
    needs_supplement: 0,
    confirmed: 0,
    in_progress: 0,
    completed: 0,
    rejected: 0
  }
  for (const item of items) {
    if (item.status && item.status in stats) {
      stats[item.status] += 1
    }
  }
  return stats
}

function toTaskListItem(task: ScrapeTask) {
  return {
    id: task.id,
    taskNo: task.taskNo,
    status: task.status,
    title: task.title,
    targetSite: task.targetSite,
    targetUrl: task.targetUrl,
    priority: task.priority,
    requesterName: task.requesterName,
    aiConfidence: task.aiConfidence,
    dataFieldsCount: task.dataFields?.length ?? 0,
    completenessTipsCount: task.completenessTips?.length ?? 0,
    createdAt: task.createdAt
  }
}

function toTaskDetailItem(task: ScrapeTask, logs: ScrapeTaskLog[]) {
  return {
    id: task.id,
    taskNo: task.taskNo,
    status: task.status,
    sourceType: task.sourceType,
    title: task.title,
    originalContent: task.originalContent,
    requesterName: task.requesterName,
    requesterDepartment: task.requesterDepartment,
    requesterContact: task.requesterContact,
    targetUrl: task.targetUrl,
    targetSite: task.targetSite,
    pagesScope: task.pagesScope,
    dataFields: task.dataFields,
    crawlFrequency: task.crawlFrequency,
    deliveryFormat: task.deliveryFormat,
    estimatedVolume: task.estimatedVolume,
    authRequired: task.authRequired,
    priority: task.priority,
    antiBotNotes: task.antiBotNotes,
    complianceNotes: task.complianceNotes,
    completenessTips: task.completenessTips,
    aiConfidence: task.aiConfidence,
    confirmed: {
      title: task.confirmedTitle,
      targetUrl: task.confirmedTargetUrl,
      targetSite: task.confirmedTargetSite,
      pagesScope: task.confirmedPagesScope,
      dataFields: task.confirmedDataFields,
      crawlFrequency: task.confirmedCrawlFrequency,
      deliveryFormat: task.confirmedDeliveryFormat,
      priority: task.confirmedPriority,
      assigneeName: task.assigneeName,
      confirmedAt: task.confirmedAt
    },
    aiSupplementDraft: task.aiSupplementDraft,
    aiSupplementDraftedAt: task.aiSupplementDraftedAt,
    rejectionReason: task.rejectionReason,
    rejectedAt: task.rejectedAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    completedSummary: task.completedSummary,
    lastOperatorId: task.lastOperatorId,
    lastOperatedAt: task.lastOperatedAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    logs: logs.map((log) => ({
      id: log.id,
      action: log.action,
      operatorId: log.operatorId,
      detail: log.detail,
      createdAt: log.createdAt
    }))
  }
}
