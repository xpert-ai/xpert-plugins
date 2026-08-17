import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import {
  KnowledgebaseRuntimeCapability,
  MANAGED_QUEUE_SERVICE_TOKEN,
  SYSTEM_GLOBAL_SCOPE,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type ManagedQueueService,
  type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import { In, Repository } from 'typeorm'
import { XPERT_QUOTATION_PLUGIN_NAME } from '../constants.js'
import {
  XpertQuotaEvidence,
  XpertQuotaItem,
  XpertQuotaKnowledgeSourceVersion,
  XpertQuotaKnowledgeSync,
  XpertQuotaKnowledgeSyncJob,
  XpertQuotaResource
} from '../entities/index.js'
import type { XpertScope } from '../types.js'

export const XPERT_QUOTA_SYNC_QUEUE_NAME = 'xpert_quotation_quota_knowledge_sync'
export const XPERT_QUOTA_SYNC_QUEUE_JOB_NAME = 'sync_quota_knowledgebase'

export type XpertQuotaKnowledgeSyncQueuePayload = {
  syncJobId: string
  sourceVersionId: string
  knowledgebaseId: string
  xpertId: string
  agentKey: string
  tenantId: string
  organizationId: string | null
  workspaceId: string | null
  projectId: string | null
  userId: string | null
  assistantId: string | null
}

@Injectable()
export class XpertQuotaKnowledgeSyncService {
  constructor(
    @InjectRepository(XpertQuotaKnowledgeSourceVersion)
    private readonly versions: Repository<XpertQuotaKnowledgeSourceVersion>,
    @InjectRepository(XpertQuotaItem)
    private readonly items: Repository<XpertQuotaItem>,
    @InjectRepository(XpertQuotaResource)
    private readonly resources: Repository<XpertQuotaResource>,
    @InjectRepository(XpertQuotaEvidence)
    private readonly evidence: Repository<XpertQuotaEvidence>,
    @InjectRepository(XpertQuotaKnowledgeSync)
    private readonly syncs: Repository<XpertQuotaKnowledgeSync>,
    @InjectRepository(XpertQuotaKnowledgeSyncJob)
    private readonly jobs: Repository<XpertQuotaKnowledgeSyncJob>,
    @Inject(MANAGED_QUEUE_SERVICE_TOKEN)
    private readonly managedQueue: ManagedQueueService,
    @Optional() @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly capabilities?: RuntimeCapabilityRegistry
  ) {}

  async start(scope: XpertScope, input: {
    sourceVersionId: string
    knowledgebaseId: string
    xpertId: string
    agentKey: string
  }) {
    const isolated = isolation(scope)
    const sourceVersionId = requiredText(input.sourceVersionId, 'Source version id is required.')
    const knowledgebaseId = requiredText(input.knowledgebaseId, 'Knowledgebase id is required.')
    const version = await this.versions.findOne({ where: { ...isolated, id: sourceVersionId } })
    if (!version) throw new NotFoundException('Quota source version was not found.')
    if (version.status !== 'active') throw new ConflictException('Publish the quota source version before knowledgebase synchronization.')
    if (!this.capabilities?.get(KnowledgebaseRuntimeCapability)) throw new BadRequestException('Platform Knowledgebase capability is unavailable.')

    const active = await this.jobs.findOne({
      where: { ...isolated, sourceVersionId, knowledgebaseId, status: In(['queued', 'running']) },
      order: { createdAt: 'DESC' }
    })
    if (active) return { duplicate: true, job: syncJobSummary(active) }

    const job = await this.jobs.save(this.jobs.create({
      ...isolated,
      sourceVersionId,
      knowledgebaseId,
      queueJobId: `xpert-quota-sync-${sourceVersionId}-${randomUUID()}`,
      status: 'queued',
      stage: 'queued',
      progress: 0,
      total: 0,
      processed: 0,
      synced: 0,
      skipped: 0,
      failed: 0,
      attempt: 0,
      createdById: scope.userId ?? null
    }))
    try {
      await this.enqueue(scope, job, input.xpertId, input.agentKey)
    } catch (error) {
      await this.markQueueFailure(job, error)
      throw error
    }
    return { duplicate: false, job: syncJobSummary(job) }
  }

  async retry(scope: XpertScope, input: { syncJobId: string; xpertId: string; agentKey: string }) {
    const job = await this.requireJob(scope, input.syncJobId)
    if (!['failed', 'cancelled', 'completed_with_errors'].includes(job.status)) {
      throw new ConflictException('Only failed, cancelled, or partially completed knowledge synchronization jobs can be retried.')
    }
    job.queueJobId = `xpert-quota-sync-${job.sourceVersionId}-${randomUUID()}`
    job.status = 'queued'
    job.stage = 'queued'
    job.progress = 0
    job.processed = 0
    job.synced = 0
    job.skipped = 0
    job.failed = 0
    job.errorCode = null
    job.errorMessage = null
    job.startedAt = null
    job.finishedAt = null
    await this.jobs.save(job)
    try {
      await this.enqueue(scope, job, input.xpertId, input.agentKey)
    } catch (error) {
      await this.markQueueFailure(job, error)
      throw error
    }
    return syncJobSummary(job)
  }

  async cancel(scope: XpertScope, syncJobId: string) {
    const job = await this.requireJob(scope, syncJobId)
    if (!['queued', 'running'].includes(job.status)) throw new ConflictException('This knowledge synchronization job is not active.')
    job.status = 'cancelled'
    job.stage = 'cancel_requested'
    job.finishedAt = new Date()
    await this.jobs.save(job)
    const queue = await this.managedQueue.cancel({ jobId: job.queueJobId })
    return { job: syncJobSummary(job), queue }
  }

  async listJobs(scope: XpertScope, sourceVersionId?: string | null) {
    const versionId = optionalText(sourceVersionId)
    const jobs = await this.jobs.find({
      where: { ...isolation(scope), ...(versionId ? { sourceVersionId: versionId } : {}) },
      order: { createdAt: 'DESC' },
      take: 50
    })
    return jobs.map(syncJobSummary)
  }

  async processQueueTask(scope: XpertScope, syncJobId: string, runtime: { xpertId: string; agentKey: string }) {
    const isolated = isolation(scope)
    const job = await this.requireJob(scope, syncJobId)
    if (job.status === 'cancelled' || job.status === 'completed') return
    const version = await this.versions.findOne({ where: { ...isolated, id: job.sourceVersionId } })
    if (!version) throw new NotFoundException('Quota source version was not found.')
    if (version.status !== 'active') throw new ConflictException('The quota source version is no longer active.')
    const api = this.capabilities?.get(KnowledgebaseRuntimeCapability)
    if (!api) throw new BadRequestException('Platform Knowledgebase capability is unavailable.')

    job.status = 'running'
    job.stage = 'loading_database'
    job.progress = 0
    job.processed = 0
    job.synced = 0
    job.skipped = 0
    job.failed = 0
    job.attempt += 1
    job.errorCode = null
    job.errorMessage = null
    job.startedAt = job.startedAt ?? new Date()
    job.finishedAt = null
    await this.jobs.save(job)

    try {
      const items = await this.items.find({ where: { ...isolated, sourceVersionId: version.id }, order: { quotaCode: 'ASC' } })
      const itemIds = items.map((item) => item.id)
      const [resources, evidence, existingSyncs] = itemIds.length ? await Promise.all([
        this.resources.find({ where: { ...isolated, quotaItemId: In(itemIds) }, order: { position: 'ASC' } }),
        this.evidence.find({ where: { ...isolated, quotaItemId: In(itemIds) } }),
        this.syncs.find({ where: { ...isolated, sourceVersionId: version.id, knowledgebaseId: job.knowledgebaseId } })
      ]) : [[], [], []]
      const resourcesByItem = groupResources(resources)
      const evidenceByItem = new Map(evidence.map((row) => [row.quotaItemId, row]))
      const syncByItem = new Map(existingSyncs.map((row) => [row.quotaItemId, row]))
      job.total = items.length
      job.stage = 'writing_chunks'
      await this.jobs.save(job)

      for (let index = 0; index < items.length; index += 1) {
        if (index % 10 === 0 && await this.isCancelled(isolated, job.id)) return
        const item = items[index]
        const writeKey = quotaWriteKey(version.id, item.quotaCode)
        const existing = syncByItem.get(item.id)
        if (existing?.status === 'synced' && existing.contentHash === item.contentHash) {
          job.skipped += 1
        } else {
          const sync = this.syncs.create({
            ...(existing ?? {}),
            ...isolated,
            sourceVersionId: version.id,
            quotaItemId: item.id,
            knowledgebaseId: job.knowledgebaseId,
            writeKey,
            contentHash: item.contentHash,
            status: 'pending',
            errorMessage: null
          })
          try {
            const result = await api.writeChunk({
              xpertId: requiredText(runtime.xpertId, 'Xpert id is required for knowledge synchronization.'),
              agentKey: requiredText(runtime.agentKey, 'Agent key is required for knowledge synchronization.'),
              knowledgebaseIds: [job.knowledgebaseId],
              knowledgebaseId: job.knowledgebaseId,
              writeKey,
              title: `江苏省建筑与装饰工程消耗量 ${item.quotaCode} ${item.quotaName}`,
              text: renderKnowledgeText(item, resourcesByItem.get(item.id) ?? [], evidenceByItem.get(item.id)),
              metadata: {
                domain: 'construction_cost',
                documentType: 'quota_item',
                quotaItemId: item.id,
                sourceVersionId: version.id,
                quotaCode: item.quotaCode,
                quotaUnit: item.quotaUnit,
                reviewStatus: item.reviewStatus,
                ingestionReady: item.ingestionReady,
                contentHash: item.contentHash
              }
            })
            sync.status = 'synced'
            sync.chunkId = result.chunkId ?? sync.chunkId
            sync.syncedAt = new Date()
            job.synced += 1
          } catch (error) {
            sync.status = 'failed'
            sync.errorMessage = errorMessage(error)
            job.failed += 1
          }
          await this.syncs.save(sync)
        }
        job.processed = index + 1
        job.progress = job.total ? Math.floor((job.processed / job.total) * 100) : 100
        if (job.processed === job.total || job.processed % 10 === 0) await this.jobs.save(job)
      }

      job.status = job.failed ? 'completed_with_errors' : 'completed'
      job.stage = job.failed ? 'completed_with_errors' : 'completed'
      job.progress = 100
      job.finishedAt = new Date()
      await this.jobs.save(job)
    } catch (error) {
      const current = await this.jobs.findOne({ where: { ...isolated, id: job.id } })
      if (current && current.status !== 'cancelled') {
        current.status = 'failed'
        current.stage = 'failed'
        current.errorCode = stableErrorCode(error)
        current.errorMessage = errorMessage(error)
        current.finishedAt = new Date()
        await this.jobs.save(current)
      }
      throw error
    }
  }

  private async enqueue(scope: XpertScope, job: XpertQuotaKnowledgeSyncJob, xpertId: string, agentKey: string) {
    const payload: XpertQuotaKnowledgeSyncQueuePayload = {
      syncJobId: job.id,
      sourceVersionId: job.sourceVersionId,
      knowledgebaseId: job.knowledgebaseId,
      xpertId: requiredText(xpertId, 'Xpert id is required.'),
      agentKey: requiredText(agentKey, 'Agent key is required.'),
      tenantId: requiredText(scope.tenantId, 'Tenant scope is required.'),
      organizationId: scope.organizationId ?? null,
      workspaceId: scope.workspaceId ?? null,
      projectId: scope.projectId ?? null,
      userId: scope.userId ?? null,
      assistantId: scope.assistantId ?? null
    }
    await this.managedQueue.enqueue({
      pluginName: XPERT_QUOTATION_PLUGIN_NAME,
      queueName: XPERT_QUOTA_SYNC_QUEUE_NAME,
      jobName: XPERT_QUOTA_SYNC_QUEUE_JOB_NAME,
      jobId: job.queueJobId,
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
      scopeKey: SYSTEM_GLOBAL_SCOPE,
      userId: payload.userId,
      attempts: 3,
      backoffMs: { type: 'exponential', delay: 1_000 },
      removeOnComplete: { age: 86_400, count: 1_000 },
      removeOnFail: { age: 604_800, count: 1_000 },
      payload
    })
  }

  private async requireJob(scope: XpertScope, id: string) {
    const job = await this.jobs.findOne({ where: { ...isolation(scope), id: requiredText(id, 'Knowledge synchronization job id is required.') } })
    if (!job) throw new NotFoundException('Knowledge synchronization job was not found.')
    return job
  }

  private async isCancelled(isolated: ReturnType<typeof isolation>, id: string) {
    const current = await this.jobs.findOne({ where: { ...isolated, id }, select: { status: true } })
    return !current || current.status === 'cancelled'
  }

  private async markQueueFailure(job: XpertQuotaKnowledgeSyncJob, error: unknown) {
    job.status = 'failed'
    job.stage = 'queue_failed'
    job.errorCode = 'quota_sync_queue_unavailable'
    job.errorMessage = errorMessage(error)
    job.finishedAt = new Date()
    await this.jobs.save(job)
  }
}

function syncJobSummary(job: XpertQuotaKnowledgeSyncJob) {
  return {
    id: job.id,
    sourceVersionId: job.sourceVersionId,
    knowledgebaseId: job.knowledgebaseId,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    total: job.total,
    processed: job.processed,
    synced: job.synced,
    skipped: job.skipped,
    failed: job.failed,
    attempt: job.attempt,
    errorCode: job.errorCode ?? null,
    errorMessage: job.errorMessage ?? null,
    startedAt: job.startedAt ?? null,
    finishedAt: job.finishedAt ?? null,
    updatedAt: job.updatedAt
  }
}

function renderKnowledgeText(item: XpertQuotaItem, resources: XpertQuotaResource[], evidence?: XpertQuotaEvidence) {
  return [
    `定额编号：${item.quotaCode}`,
    `定额名称：${item.quotaName}`,
    `计量单位：${item.quotaUnit}`,
    item.chapter ? `章节：${item.chapter}` : '',
    `工作内容：${item.workContents.join('；') || '未识别'}`,
    ...(item.formulas?.length ? ['计算公式/调整提示：', ...item.formulas.map((value) => `- ${value}`)] : []),
    '人材机消耗量：',
    ...resources.map((row) => `- ${row.category} | ${row.resourceCode} | ${row.resourceName} | ${row.unit} | ${row.originalConsumption}`),
    evidence ? `来源页：PDF ${evidence.pdfPages.join(', ')}；印刷页 ${evidence.printedPages.join(', ')}` : '',
    `审核状态：${item.reviewStatus}；结构就绪：${item.ingestionReady ? '是' : '否'}`
  ].filter(Boolean).join('\n')
}

function groupResources(resources: XpertQuotaResource[]) {
  const grouped = new Map<string, XpertQuotaResource[]>()
  for (const resource of resources) {
    const rows = grouped.get(resource.quotaItemId) ?? []
    rows.push(resource)
    grouped.set(resource.quotaItemId, rows)
  }
  return grouped
}

function quotaWriteKey(sourceVersionId: string, quotaCode: string) {
  return `quota:jiangsu:building-decoration:2026:${sourceVersionId}:${quotaCode}`
}

function isolation(scope: XpertScope) {
  const tenantId = requiredText(scope.tenantId, 'Tenant scope is required.')
  const organizationId = optionalText(scope.organizationId)
  return { tenantId, organizationId, scopeKey: organizationId ? `organization:${organizationId}` : 'tenant:default' }
}

function optionalText(value?: string | null) { return value?.trim() || null }
function requiredText(value: string | null | undefined, message: string) { const normalized = value?.trim(); if (!normalized) throw new BadRequestException(message); return normalized }
function stableErrorCode(error: unknown) { return typeof error === 'object' && error && typeof Reflect.get(error, 'code') === 'string' ? Reflect.get(error, 'code') : 'quota_knowledge_sync_failed' }
function errorMessage(error: unknown) { return (error instanceof Error ? error.message : String(error)).slice(0, 4_000) }
