import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import {
  MANAGED_QUEUE_SERVICE_TOKEN,
  SYSTEM_GLOBAL_SCOPE,
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type ManagedQueueService,
  type KnowledgebaseDocument,
  type RuntimeCapabilityRegistry,
  type WorkspaceFileCatalog,
  type WorkspaceFileScope,
  type WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'
import { ILike, In, Repository, type EntityManager } from 'typeorm'
import { XPERT_QUOTATION_PLUGIN_NAME } from '../constants.js'
import {
  XpertQuotaEvidence,
  XpertQuotaIngestionJob,
  XpertQuotaItem,
  XpertQuotaKnowledgeSource,
  XpertQuotaKnowledgeSourceVersion,
  XpertQuotaKnowledgeSync,
  XpertQuotaResource,
  XpertQuotaReview,
  type XpertQuotaReviewDecision
} from '../entities/index.js'
import type { QuotaKnowledgeCandidate, XpertScope } from '../types.js'
import { validateQuotaNormalization } from './quota-ingestion-validation.js'

export const XPERT_QUOTA_QUEUE_NAME = 'xpert_quotation_quota_ingestion'
export const XPERT_QUOTA_QUEUE_JOB_NAME = 'normalize_quota_pdf'
export const XPERT_QUOTA_PARSER_VERSION = '1.0.0'
const DEFAULT_SOURCE_KEY = 'jiangsu-building-decoration-2026'
const PDF_MIME = 'application/pdf'
const MAX_PDF_SIZE = 100 * 1024 * 1024

export type XpertQuotaQueuePayload = {
  ingestionJobId: string
  sourceVersionId: string
  tenantId: string
  organizationId: string | null
  workspaceId: string | null
  projectId: string | null
  userId: string | null
  assistantId: string | null
}

type NormalizedResource = {
  category: string
  code: string
  name: string
  unit: string
  consumption: string
  consumptionKind?: string
}

type NormalizedChunk = {
  writeKey: string
  title: string
  text: string
  metadata: {
    ingestionReady: boolean
    contentHash: string
    [key: string]: unknown
  }
  data: {
    quotaCode: string
    quotaName: string
    quotaUnit: string
    chapter?: string | null
    sectionCode?: string | null
    sectionTitle?: string | null
    workContents: string[]
    resources: NormalizedResource[]
    adjustments: string[]
    formulas?: string[]
    source: {
      pdfPages: number[]
      printedPages: string[]
      excerpt: string
    }
  }
  warnings: Array<Record<string, unknown>>
}

type NormalizationResult = {
  pageCount: number
  tableCount: number
  resourceRowCount: number
  chunks: NormalizedChunk[]
  warnings: Array<Record<string, unknown>>
}

@Injectable()
export class XpertQuotaKnowledgeService {
  constructor(
    @InjectRepository(XpertQuotaKnowledgeSource)
    private readonly sources: Repository<XpertQuotaKnowledgeSource>,
    @InjectRepository(XpertQuotaKnowledgeSourceVersion)
    private readonly versions: Repository<XpertQuotaKnowledgeSourceVersion>,
    @InjectRepository(XpertQuotaIngestionJob)
    private readonly jobs: Repository<XpertQuotaIngestionJob>,
    @InjectRepository(XpertQuotaItem)
    private readonly items: Repository<XpertQuotaItem>,
    @InjectRepository(XpertQuotaResource)
    private readonly resources: Repository<XpertQuotaResource>,
    @InjectRepository(XpertQuotaEvidence)
    private readonly evidence: Repository<XpertQuotaEvidence>,
    @InjectRepository(XpertQuotaReview)
    private readonly reviews: Repository<XpertQuotaReview>,
    @Inject(MANAGED_QUEUE_SERVICE_TOKEN)
    private readonly managedQueue: ManagedQueueService,
    @Optional() @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly capabilities?: RuntimeCapabilityRegistry
  ) {}

  async importPdf(scope: XpertScope, input: {
    fileName: string
    mimeType?: string | null
    buffer: Buffer
    sourceKey?: string | null
    displayName?: string | null
  }) {
    const tenantId = requiredText(scope.tenantId, 'Tenant scope is required.')
    const fileName = normalizePdfFileName(input.fileName)
    validatePdf(input.buffer, fileName, input.mimeType)
    const sha256 = digest(input.buffer)
    const isolated = isolation(scope)
    const duplicate = await this.versions.findOne({
      where: { tenantId, scopeKey: isolated.scopeKey, sha256 },
      order: { createdAt: 'DESC' }
    })
    if (duplicate) {
      const [source, job] = await Promise.all([
        this.sources.findOne({ where: { tenantId, scopeKey: isolated.scopeKey, id: duplicate.sourceId } }),
        this.jobs.findOne({ where: { tenantId, scopeKey: isolated.scopeKey, sourceVersionId: duplicate.id } })
      ])
      return { duplicate: true, source: sourceSummary(source), version: versionSummary(duplicate), job: jobSummary(job) }
    }

    const sourceKey = normalizeSourceKey(input.sourceKey ?? DEFAULT_SOURCE_KEY)
    const workspaceScope = resolveWorkspaceScope(scope)
    const existingSource = await this.sources.findOne({ where: { tenantId, scopeKey: isolated.scopeKey, sourceKey } })
    const sourceId = existingSource?.id ?? randomUUID()
    const versionId = randomUUID()
    const versionNumber = (existingSource?.currentVersionNumber ?? 0) + 1
    const queueJobId = `xpert-quota-${versionId}`
    const workspaceFiles = this.workspaceFiles()
    const uploaded = await workspaceFiles.uploadBuffer({
      tenantId,
      userId: scope.userId ?? null,
      ...workspaceScope,
      buffer: input.buffer,
      originalName: fileName,
      mimeType: PDF_MIME,
      size: input.buffer.byteLength,
      folder: `files/xpert-quotation/knowledge/${sourceId}`,
      fileName: `v${versionNumber}-${sha256.slice(0, 12)}.pdf`,
      metadata: { source: 'xpert_quotation_quota_pdf', sourceId, sourceVersionId: versionId, sha256 }
    })

    let saved: { source: XpertQuotaKnowledgeSource; version: XpertQuotaKnowledgeSourceVersion; job: XpertQuotaIngestionJob }
    try {
      saved = await this.sources.manager.transaction(async (manager) => {
        const sourceRepository = manager.getRepository(XpertQuotaKnowledgeSource)
        const versionRepository = manager.getRepository(XpertQuotaKnowledgeSourceVersion)
        const jobRepository = manager.getRepository(XpertQuotaIngestionJob)
        const source = await sourceRepository.save(sourceRepository.create({
          ...(existingSource ?? {}),
          id: sourceId,
          tenantId,
          organizationId: isolated.organizationId,
          scopeKey: isolated.scopeKey,
          sourceKey,
          displayName: input.displayName?.trim() || fileName.replace(/\.pdf$/i, ''),
          kind: 'quota_pdf',
          currentVersionNumber: versionNumber,
          revision: (existingSource?.revision ?? 0) + 1,
          createdById: existingSource?.createdById ?? scope.userId ?? null
        }))
        const version = await versionRepository.save(versionRepository.create({
          id: versionId,
          tenantId,
          organizationId: isolated.organizationId,
          scopeKey: isolated.scopeKey,
          sourceId,
          versionNumber,
          originalFileName: fileName,
          mimeType: PDF_MIME,
          size: input.buffer.byteLength,
          sha256,
          parserVersion: XPERT_QUOTA_PARSER_VERSION,
          workspaceCatalog: uploaded.catalog,
          workspaceScopeId: uploaded.scopeId ?? workspaceScope.scopeId,
          workspaceFilePath: uploaded.filePath,
          workspacePath: uploaded.workspacePath,
          status: 'draft',
          warnings: [],
          createdById: scope.userId ?? null
        }))
        const job = await jobRepository.save(jobRepository.create({
          tenantId,
          organizationId: isolated.organizationId,
          scopeKey: isolated.scopeKey,
          sourceId,
          sourceVersionId: versionId,
          queueJobId,
          status: 'queued',
          stage: 'queued',
          progress: 0,
          attempt: 0
        }))
        return { source, version, job }
      })
    } catch (error) {
      await deleteUploadedBestEffort(workspaceFiles, scope, workspaceScope, uploaded.filePath)
      throw error
    }

    try {
      await this.enqueue(scope, saved.job)
    } catch (error) {
      saved.job.status = 'failed'
      saved.job.stage = 'queue_failed'
      saved.job.errorCode = 'quota_queue_unavailable'
      saved.job.errorMessage = errorMessage(error)
      saved.job.finishedAt = new Date()
      await this.jobs.save(saved.job)
      throw error
    }
    return { duplicate: false, source: sourceSummary(saved.source), version: versionSummary(saved.version), job: jobSummary(saved.job) }
  }

  async retry(scope: XpertScope, ingestionJobId: string) {
    const job = await this.requireJob(scope, ingestionJobId)
    if (!['failed', 'cancelled'].includes(job.status)) throw new ConflictException('Only failed or cancelled ingestion jobs can be retried.')
    job.status = 'queued'
    job.stage = 'queued'
    job.progress = 0
    job.currentPage = 0
    job.errorCode = null
    job.errorMessage = null
    job.finishedAt = null
    job.queueJobId = `xpert-quota-${job.sourceVersionId}-retry-${randomUUID()}`
    await this.jobs.save(job)
    await this.enqueue(scope, job)
    return jobSummary(job)
  }

  async cancel(scope: XpertScope, ingestionJobId: string) {
    const job = await this.requireJob(scope, ingestionJobId)
    if (!['queued', 'running'].includes(job.status)) throw new ConflictException('This ingestion job is not active.')
    job.status = 'cancelled'
    job.stage = 'cancel_requested'
    job.finishedAt = new Date()
    await this.jobs.save(job)
    const queue = await this.managedQueue.cancel({ jobId: job.queueJobId })
    return { job: jobSummary(job), queue }
  }

  async processQueueTask(scope: XpertScope, ingestionJobId: string) {
    const job = await this.requireJob(scope, ingestionJobId)
    if (job.status === 'cancelled' || job.status === 'ready_for_review') return
    const version = await this.requireVersion(scope, job.sourceVersionId)
    job.status = 'running'
    job.stage = 'reading_source'
    job.startedAt = job.startedAt ?? new Date()
    job.finishedAt = null
    job.attempt += 1
    job.errorCode = null
    job.errorMessage = null
    await this.jobs.save(job)
    try {
      const stored = await this.workspaceFiles().readBuffer(versionFileReference(scope, version))
      if (stored.buffer.byteLength !== version.size) throw codedError('quota_source_size_mismatch', 'Stored PDF size no longer matches the uploaded version.')
      if (digest(stored.buffer) !== version.sha256) throw codedError('quota_source_hash_mismatch', 'Stored PDF checksum no longer matches the uploaded version.')
      job.stage = 'parsing_pdf'
      await this.jobs.save(job)
      const normalizeQuotaPdf = await loadNormalizer()
      const result = await normalizeQuotaPdf({
        data: stored.buffer,
        sourceFile: version.originalFileName,
        sourceHash: version.sha256,
        onProgress: async ({ pageNumber, pageCount, itemCount }: { pageNumber: number; pageCount: number; itemCount: number }) => {
          if (pageNumber !== 1 && pageNumber !== pageCount && pageNumber % 10 !== 0) return
          const current = await this.jobs.findOne({ where: { id: job.id } })
          if (!current || current.status === 'cancelled') throw codedError('quota_ingestion_cancelled', 'Quota ingestion was cancelled.')
          current.currentPage = pageNumber
          current.totalPages = pageCount
          current.itemCount = itemCount
          current.progress = Math.min(80, Math.max(1, Math.round((pageNumber / pageCount) * 80)))
          await this.jobs.save(current)
        }
      }) as NormalizationResult
      validateQuotaNormalization(result)
      job.stage = 'persisting_database'
      job.progress = 85
      job.totalPages = result.pageCount
      job.currentPage = result.pageCount
      await this.jobs.save(job)
      await this.persistNormalization(scope, version, job, result)
    } catch (error) {
      const current = await this.jobs.findOne({ where: { id: job.id } })
      if (current && current.status !== 'cancelled') {
        current.status = 'failed'
        current.stage = 'failed'
        current.errorCode = errorCode(error)
        current.errorMessage = errorMessage(error)
        current.finishedAt = new Date()
        await this.jobs.save(current)
      }
      if (current?.status !== 'cancelled') {
        version.status = 'failed'
        await this.versions.save(version)
      }
      throw error
    }
  }

  async getWorkspace(scope: XpertScope, input: {
    sourceVersionId?: string | null
    page?: number
    pageSize?: number
    search?: string | null
    reviewStatus?: string | null
    readiness?: string | null
  } = {}) {
    const isolated = isolation(scope)
    const [sources, versions, jobs] = await Promise.all([
      this.sources.find({ where: isolated, order: { updatedAt: 'DESC' } }),
      this.versions.find({ where: isolated, order: { createdAt: 'DESC' } }),
      this.jobs.find({ where: isolated, order: { updatedAt: 'DESC' } })
    ])
    const requested = input.sourceVersionId
      ? versions.find((version) => version.id === input.sourceVersionId)
      : versions.find((version) => version.status === 'active') ?? versions[0]
    if (!requested) {
      return { sources: [], versions: [], jobs: [], selectedVersionId: null, items: [], total: 0, page: 1, pageSize: 20 }
    }
    const pageSize = clamp(input.pageSize ?? 20, 1, 100)
    const page = Math.max(1, Math.floor(input.page ?? 1))
    const where: Record<string, unknown> = { ...isolated, sourceVersionId: requested.id }
    if (input.reviewStatus && ['unreviewed', 'approved', 'rejected'].includes(input.reviewStatus)) where.reviewStatus = input.reviewStatus
    if (input.readiness === 'ready') where.ingestionReady = true
    if (input.readiness === 'review_required') where.ingestionReady = false
    const search = input.search?.trim().slice(0, 200)
    const whereClause = search
      ? [
          { ...where, quotaCode: ILike(`%${escapeLike(search)}%`) },
          { ...where, quotaName: ILike(`%${escapeLike(search)}%`) }
        ]
      : where
    const [quotaItems, total] = await this.items.findAndCount({
      where: whereClause as never,
      order: { quotaCode: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
    const itemIds = quotaItems.map((item) => item.id)
    const [resources, evidence] = itemIds.length ? await Promise.all([
      this.resources.find({ where: { ...isolated, quotaItemId: In(itemIds) }, order: { position: 'ASC' } }),
      this.evidence.find({ where: { ...isolated, quotaItemId: In(itemIds) } })
    ]) : [[], []]
    return {
      sources: sources.map(sourceSummary),
      versions: versions.map(versionSummary),
      jobs: jobs.map(jobSummary),
      selectedVersionId: requested.id,
      items: quotaItems.map((item) => itemSummary(item, resources, evidence)),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total
    }
  }

  async reviewItem(scope: XpertScope, input: {
    quotaItemId: string
    decision: XpertQuotaReviewDecision
    comment: string
    expectedRevision: number
  }) {
    if (!['approve', 'reject'].includes(input.decision)) throw new BadRequestException('Review decision must be approve or reject.')
    const comment = requiredText(input.comment, 'Review comment is required.')
    const isolated = isolation(scope)
    return this.items.manager.transaction(async (manager) => {
      const repository = manager.getRepository(XpertQuotaItem)
      const item = await repository.findOne({ where: { ...isolated, id: input.quotaItemId } })
      if (!item) throw new NotFoundException('Quota item was not found.')
      if (item.revision !== input.expectedRevision) throw new ConflictException({ errorCode: 'quota_review_revision_conflict', currentRevision: item.revision })
      const baseRevision = item.revision
      item.reviewStatus = input.decision === 'approve' ? 'approved' : 'rejected'
      item.revision += 1
      item.reviewedAt = new Date()
      item.reviewedById = scope.userId ?? null
      const saved = await repository.save(item)
      await manager.getRepository(XpertQuotaReview).save({
        tenantId: isolated.tenantId,
        organizationId: isolated.organizationId,
        scopeKey: isolated.scopeKey,
        sourceVersionId: item.sourceVersionId,
        quotaItemId: item.id,
        decision: input.decision,
        comment,
        baseRevision,
        resultingRevision: saved.revision,
        reviewerId: scope.userId ?? null
      })
      return itemSummary(saved, [], [])
    })
  }

  async publishVersion(scope: XpertScope, sourceVersionId: string) {
    const isolated = isolation(scope)
    return this.versions.manager.transaction(async (manager) => {
      const versionRepository = manager.getRepository(XpertQuotaKnowledgeSourceVersion)
      const sourceRepository = manager.getRepository(XpertQuotaKnowledgeSource)
      const version = await versionRepository.findOne({ where: { ...isolated, id: sourceVersionId } })
      if (!version) throw new NotFoundException('Quota source version was not found.')
      if (!['ready_for_review', 'active'].includes(version.status)) throw new ConflictException('Only a successfully ingested version can be published.')
      const source = await sourceRepository.findOne({ where: { ...isolated, id: version.sourceId } })
      if (!source) throw new NotFoundException('Quota source was not found.')
      const prior = await versionRepository.find({ where: { ...isolated, sourceId: source.id, status: 'active' } })
      for (const item of prior.filter((item) => item.id !== version.id)) item.status = 'superseded'
      if (prior.length) await versionRepository.save(prior)
      version.status = 'active'
      version.publishedAt = new Date()
      version.publishedById = scope.userId ?? null
      version.revision += 1
      await versionRepository.save(version)
      source.activeVersionId = version.id
      source.revision += 1
      await sourceRepository.save(source)
      return { source: sourceSummary(source), version: versionSummary(version) }
    })
  }

  async getPreferredVersionId(scope: XpertScope) {
    const version = await this.versions.findOne({
      where: { ...isolation(scope), status: 'active' },
      order: { publishedAt: 'DESC', createdAt: 'DESC' }
    })
    return version?.id ?? null
  }

  async searchActiveQuota(scope: XpertScope, input: { query: string; limit?: number; quotaCode?: string | null; sourceVersionId?: string | null }): Promise<QuotaKnowledgeCandidate[]> {
    const query = requiredText(input.query, 'Quota search query is required.').slice(0, 300)
    const isolated = isolation(scope)
    const activeVersions = await this.versions.find({
      where: input.sourceVersionId
        ? { ...isolated, id: input.sourceVersionId }
        : { ...isolated, status: 'active' }
    })
    const activeIds = activeVersions.map((version) => version.id)
    if (!activeIds.length) return []
    const code = input.quotaCode?.trim()
    const terms = searchTerms(query)
    const matches = await this.items.find({
      where: code
        ? { ...isolated, sourceVersionId: In(activeIds), quotaCode: code }
        : terms.flatMap((term) => [
            { ...isolated, sourceVersionId: In(activeIds), quotaCode: ILike(`%${escapeLike(term)}%`) },
            { ...isolated, sourceVersionId: In(activeIds), quotaName: ILike(`%${escapeLike(term)}%`) },
            { ...isolated, sourceVersionId: In(activeIds), chapter: ILike(`%${escapeLike(term)}%`) }
          ]),
      order: { quotaCode: 'ASC' },
      take: clamp(input.limit ?? 12, 1, 30)
    })
    const ids = matches.map((item) => item.id)
    const [resources, evidence] = ids.length ? await Promise.all([
      this.resources.find({ where: { ...isolated, quotaItemId: In(ids) }, order: { position: 'ASC' } }),
      this.evidence.find({ where: { ...isolated, quotaItemId: In(ids) } })
    ]) : [[], []]
    return matches.map((item) => quotaCandidate(
      item,
      resources.filter((row) => row.quotaItemId === item.id),
      evidence.find((row) => row.quotaItemId === item.id),
      activeVersions.find((version) => version.id === item.sourceVersionId),
      query,
      'xpert-quotation-database'
    ))
  }

  async hydrateKnowledgeCandidates(
    scope: XpertScope,
    documents: KnowledgebaseDocument[],
    allowedKnowledgebaseIds: string[],
    query: string,
    limit = 12,
    pinnedSourceVersionId?: string | null
  ): Promise<QuotaKnowledgeCandidate[]> {
    const isolated = isolation(scope)
    const allowed = new Set(allowedKnowledgebaseIds)
    const fallbackKnowledgebaseId = allowed.size === 1 ? allowedKnowledgebaseIds[0] : null
    const references = documents.flatMap((document) => {
      const metadata = asRecord(document.metadata)
      const quotaItemId = metadataString(metadata, 'quotaItemId')
      const sourceVersionId = metadataString(metadata, 'sourceVersionId')
      const contentHash = metadataString(metadata, 'contentHash')
      const knowledgebaseId = metadataString(metadata, 'knowledgebaseId') ?? metadataString(metadata, 'knowledgeBaseId') ?? fallbackKnowledgebaseId
      return quotaItemId && sourceVersionId && contentHash && knowledgebaseId && allowed.has(knowledgebaseId)
        ? [{ quotaItemId, sourceVersionId, contentHash, knowledgebaseId }]
        : []
    })
    if (!references.length) return []
    const referencedVersionIds = [...new Set(references.map((item) => item.sourceVersionId))]
    const activeVersions = await this.versions.find({
      where: pinnedSourceVersionId
        ? { ...isolated, id: pinnedSourceVersionId }
        : { ...isolated, status: 'active', id: In(referencedVersionIds) }
    })
    const activeIds = new Set(activeVersions.map((version) => version.id))
    const items = await this.items.find({ where: { ...isolated, id: In([...new Set(references.map((item) => item.quotaItemId))]) } })
    const validated = items.filter((item) => references.some((reference) =>
      reference.quotaItemId === item.id && reference.sourceVersionId === item.sourceVersionId &&
      reference.contentHash === item.contentHash && activeIds.has(item.sourceVersionId)
    )).slice(0, clamp(limit, 1, 30))
    const ids = validated.map((item) => item.id)
    const [resources, evidence] = ids.length ? await Promise.all([
      this.resources.find({ where: { ...isolated, quotaItemId: In(ids) }, order: { position: 'ASC' } }),
      this.evidence.find({ where: { ...isolated, quotaItemId: In(ids) } })
    ]) : [[], []]
    return validated.map((item) => quotaCandidate(
      item,
      resources.filter((row) => row.quotaItemId === item.id),
      evidence.find((row) => row.quotaItemId === item.id),
      activeVersions.find((version) => version.id === item.sourceVersionId),
      query,
      references.find((reference) => reference.quotaItemId === item.id)?.knowledgebaseId ?? 'xpert-quotation-database'
    ))
  }

  private async persistNormalization(scope: XpertScope, version: XpertQuotaKnowledgeSourceVersion, job: XpertQuotaIngestionJob, result: NormalizationResult) {
    const isolated = isolation(scope)
    await this.items.manager.transaction(async (manager) => {
      await clearVersionRows(manager, version.id)
      const itemRows: XpertQuotaItem[] = []
      const resourceRows: XpertQuotaResource[] = []
      const evidenceRows: XpertQuotaEvidence[] = []
      for (const chunk of result.chunks) {
        const itemId = randomUUID()
        itemRows.push(manager.getRepository(XpertQuotaItem).create({
          id: itemId,
          ...isolated,
          sourceId: version.sourceId,
          sourceVersionId: version.id,
          quotaCode: chunk.data.quotaCode,
          quotaName: chunk.data.quotaName,
          quotaUnit: chunk.data.quotaUnit,
          chapter: chunk.data.chapter ?? null,
          sectionCode: chunk.data.sectionCode ?? null,
          sectionTitle: chunk.data.sectionTitle ?? null,
          workContents: chunk.data.workContents,
          adjustments: chunk.data.adjustments,
          formulas: chunk.data.formulas ?? extractFormulaHints(chunk.data.adjustments),
          reviewStatus: 'unreviewed',
          ingestionReady: Boolean(chunk.metadata.ingestionReady),
          contentHash: chunk.metadata.contentHash,
          revision: 1
        }))
        chunk.data.resources.forEach((resource, position) => resourceRows.push(manager.getRepository(XpertQuotaResource).create({
          id: randomUUID(),
          ...isolated,
          sourceVersionId: version.id,
          quotaItemId: itemId,
          position,
          category: resource.category,
          resourceCode: resource.code,
          resourceName: resource.name,
          unit: resource.unit,
          consumption: numericOrNull(resource.consumption),
          originalConsumption: resource.consumption,
          consumptionKind: resource.consumptionKind ?? 'quantity'
        })))
        evidenceRows.push(manager.getRepository(XpertQuotaEvidence).create({
          id: randomUUID(),
          ...isolated,
          sourceVersionId: version.id,
          quotaItemId: itemId,
          pdfPages: chunk.data.source.pdfPages,
          printedPages: chunk.data.source.printedPages,
          excerpt: chunk.data.source.excerpt,
          sourceSha256: version.sha256
        }))
      }
      await insertBatches(manager, XpertQuotaItem, itemRows)
      await insertBatches(manager, XpertQuotaResource, resourceRows)
      await insertBatches(manager, XpertQuotaEvidence, evidenceRows)
      const versionRepository = manager.getRepository(XpertQuotaKnowledgeSourceVersion)
      const currentVersion = await versionRepository.findOneByOrFail({ id: version.id })
      currentVersion.status = 'ready_for_review'
      currentVersion.pageCount = result.pageCount
      currentVersion.quotaItemCount = result.chunks.length
      currentVersion.resourceCount = result.resourceRowCount
      currentVersion.warningCount = result.warnings.length
      currentVersion.readyCount = result.chunks.filter((chunk) => chunk.metadata.ingestionReady).length
      currentVersion.reviewRequiredCount = result.chunks.length - currentVersion.readyCount
      currentVersion.warnings = result.warnings
      currentVersion.revision += 1
      await versionRepository.save(currentVersion)
      const jobRepository = manager.getRepository(XpertQuotaIngestionJob)
      const currentJob = await jobRepository.findOneByOrFail({ id: job.id })
      currentJob.status = 'ready_for_review'
      currentJob.stage = 'ready_for_review'
      currentJob.progress = 100
      currentJob.currentPage = result.pageCount
      currentJob.totalPages = result.pageCount
      currentJob.itemCount = result.chunks.length
      currentJob.resourceCount = result.resourceRowCount
      currentJob.warningCount = result.warnings.length
      currentJob.finishedAt = new Date()
      await jobRepository.save(currentJob)
    })
  }

  private async enqueue(scope: XpertScope, job: XpertQuotaIngestionJob) {
    await this.managedQueue.enqueue<XpertQuotaQueuePayload>({
      pluginName: XPERT_QUOTATION_PLUGIN_NAME,
      queueName: XPERT_QUOTA_QUEUE_NAME,
      jobName: XPERT_QUOTA_QUEUE_JOB_NAME,
      jobId: job.queueJobId,
      tenantId: requiredText(scope.tenantId, 'Tenant scope is required.'),
      organizationId: scope.organizationId ?? null,
      scopeKey: SYSTEM_GLOBAL_SCOPE,
      userId: scope.userId ?? null,
      attempts: 3,
      backoffMs: { type: 'exponential', delay: 1_000 },
      removeOnComplete: { age: 86_400, count: 1_000 },
      removeOnFail: { age: 604_800, count: 1_000 },
      payload: {
        ingestionJobId: job.id,
        sourceVersionId: job.sourceVersionId,
        tenantId: requiredText(scope.tenantId, 'Tenant scope is required.'),
        organizationId: scope.organizationId ?? null,
        workspaceId: scope.workspaceId ?? null,
        projectId: scope.projectId ?? null,
        userId: scope.userId ?? null,
        assistantId: scope.assistantId ?? null
      }
    })
  }

  private async requireJob(scope: XpertScope, id: string) {
    const job = await this.jobs.findOne({ where: { ...isolation(scope), id: requiredText(id, 'Ingestion job id is required.') } })
    if (!job) throw new NotFoundException('Quota ingestion job was not found.')
    return job
  }

  private async requireVersion(scope: XpertScope, id: string) {
    const version = await this.versions.findOne({ where: { ...isolation(scope), id: requiredText(id, 'Source version id is required.') } })
    if (!version) throw new NotFoundException('Quota source version was not found.')
    return version
  }

  private workspaceFiles(): WorkspaceFilesApi {
    const api = this.capabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!api) throw new BadRequestException('Platform Workspace Files capability is required for quota PDF storage.')
    return api
  }
}

async function clearVersionRows(manager: EntityManager, sourceVersionId: string) {
  const itemIds = (await manager.getRepository(XpertQuotaItem).find({ where: { sourceVersionId }, select: { id: true } })).map((item) => item.id)
  await manager.getRepository(XpertQuotaKnowledgeSync).delete({ sourceVersionId })
  await manager.getRepository(XpertQuotaReview).delete({ sourceVersionId })
  await manager.getRepository(XpertQuotaResource).delete({ sourceVersionId })
  await manager.getRepository(XpertQuotaEvidence).delete({ sourceVersionId })
  if (itemIds.length) await manager.getRepository(XpertQuotaItem).delete({ id: In(itemIds) })
}

async function insertBatches<T extends object>(manager: EntityManager, target: { new(): T }, rows: T[]) {
  for (let index = 0; index < rows.length; index += 500) await manager.getRepository(target).insert(rows.slice(index, index + 500))
}

async function loadNormalizer(): Promise<(input: Record<string, unknown>) => Promise<NormalizationResult>> {
  const modulePath = new URL('../../../scripts/quota-normalizer.mjs', import.meta.url)
  const loaded = await import(pathToFileURL(modulePath.pathname).href)
  if (typeof loaded.normalizeQuotaPdf !== 'function') throw codedError('quota_parser_unavailable', 'Quota PDF normalizer is unavailable.')
  return loaded.normalizeQuotaPdf
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

function quotaCandidate(
  item: XpertQuotaItem,
  resources: XpertQuotaResource[],
  evidence: XpertQuotaEvidence | undefined,
  version: XpertQuotaKnowledgeSourceVersion | undefined,
  query: string,
  knowledgebaseId: string
): QuotaKnowledgeCandidate {
  return {
    id: item.id,
    knowledgebaseId,
    documentId: item.sourceVersionId,
    chunkId: item.id,
    documentName: version?.originalFileName ?? 'Xpert报价定额数据库',
    pageContent: renderKnowledgeText(item, resources, evidence),
    quotaCode: item.quotaCode,
    quotaName: item.quotaName,
    quotaUnit: item.quotaUnit,
    region: '江苏省',
    edition: '2026',
    discipline: '建筑与装饰工程',
    extractionStatus: 'structured',
    extractedQuotaCodes: [item.quotaCode],
    reviewStatus: item.reviewStatus,
    ingestionReady: item.ingestionReady,
    workContents: item.workContents,
    resources: resources.map((row) => ({
      category: normalizeCategory(row.category),
      code: row.resourceCode,
      name: row.resourceName,
      unit: row.unit,
      consumption: row.originalConsumption
    })),
    adjustments: item.adjustments,
    formulas: item.formulas ?? [],
    sourceFile: version?.originalFileName,
    sourcePages: evidence?.pdfPages ?? [],
    query,
    retrievedAt: new Date().toISOString()
  }
}

function itemSummary(item: XpertQuotaItem, resources: XpertQuotaResource[], evidence: XpertQuotaEvidence[]) {
  const proof = evidence.find((row) => row.quotaItemId === item.id)
  return {
    id: item.id,
    sourceVersionId: item.sourceVersionId,
    quotaCode: item.quotaCode,
    quotaName: item.quotaName,
    quotaUnit: item.quotaUnit,
    chapter: item.chapter ?? null,
    sectionCode: item.sectionCode ?? null,
    workContents: item.workContents,
    adjustments: item.adjustments,
    formulas: item.formulas ?? [],
    reviewStatus: item.reviewStatus,
    ingestionReady: item.ingestionReady,
    revision: item.revision,
    resources: resources.filter((row) => row.quotaItemId === item.id).map((row) => ({
      category: row.category,
      code: row.resourceCode,
      name: row.resourceName,
      unit: row.unit,
      consumption: row.originalConsumption
    })),
    evidence: proof ? { pdfPages: proof.pdfPages, printedPages: proof.printedPages, excerpt: proof.excerpt } : null
  }
}

function sourceSummary(source?: XpertQuotaKnowledgeSource | null) {
  return source ? {
    id: source.id,
    sourceKey: source.sourceKey,
    displayName: source.displayName,
    activeVersionId: source.activeVersionId ?? null,
    currentVersionNumber: source.currentVersionNumber,
    revision: source.revision,
    updatedAt: source.updatedAt
  } : null
}

function versionSummary(version?: XpertQuotaKnowledgeSourceVersion | null) {
  return version ? {
    id: version.id,
    sourceId: version.sourceId,
    versionNumber: version.versionNumber,
    originalFileName: version.originalFileName,
    mimeType: version.mimeType,
    size: version.size,
    sha256: version.sha256,
    parserVersion: version.parserVersion,
    status: version.status,
    pageCount: version.pageCount,
    quotaItemCount: version.quotaItemCount,
    resourceCount: version.resourceCount,
    warningCount: version.warningCount,
    readyCount: version.readyCount,
    reviewRequiredCount: version.reviewRequiredCount,
    revision: version.revision,
    publishedAt: version.publishedAt ?? null,
    createdAt: version.createdAt
  } : null
}

function jobSummary(job?: XpertQuotaIngestionJob | null) {
  return job ? {
    id: job.id,
    sourceId: job.sourceId,
    sourceVersionId: job.sourceVersionId,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    currentPage: job.currentPage,
    totalPages: job.totalPages,
    itemCount: job.itemCount,
    resourceCount: job.resourceCount,
    warningCount: job.warningCount,
    errorCode: job.errorCode ?? null,
    errorMessage: job.errorMessage ?? null,
    attempt: job.attempt,
    startedAt: job.startedAt ?? null,
    finishedAt: job.finishedAt ?? null,
    updatedAt: job.updatedAt
  } : null
}

function resolveWorkspaceScope(scope: XpertScope): WorkspaceFileScope & { catalog: WorkspaceFileCatalog; scopeId: string } {
  const projectId = optionalText(scope.projectId)
  if (projectId) return { catalog: 'projects', scopeId: projectId, projectId }
  const xpertId = optionalText(scope.assistantId) ?? optionalText(scope.workspaceId)
  if (!xpertId) throw new BadRequestException('Quota PDF storage requires an assistant, workspace, or project scope.')
  return { catalog: 'xperts', scopeId: xpertId, xpertId, isolateByUser: false }
}

function versionFileReference(scope: XpertScope, version: XpertQuotaKnowledgeSourceVersion) {
  const common = {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    userId: scope.userId ?? null,
    catalog: version.workspaceCatalog,
    scopeId: version.workspaceScopeId,
    filePath: version.workspaceFilePath
  }
  return version.workspaceCatalog === 'projects'
    ? { ...common, projectId: version.workspaceScopeId }
    : { ...common, xpertId: version.workspaceScopeId, isolateByUser: false }
}

async function deleteUploadedBestEffort(files: WorkspaceFilesApi, scope: XpertScope, workspace: WorkspaceFileScope, filePath: string) {
  try { await files.deleteFile({ tenantId: scope.tenantId, userId: scope.userId ?? null, ...workspace, filePath }) } catch {}
}

function isolation(scope: XpertScope) {
  const tenantId = requiredText(scope.tenantId, 'Tenant scope is required.')
  const organizationId = optionalText(scope.organizationId)
  return { tenantId, organizationId, scopeKey: organizationId ? `organization:${organizationId}` : 'tenant:default' }
}

function validatePdf(buffer: Buffer, fileName: string, mimeType?: string | null) {
  if (!buffer.length) throw new BadRequestException('PDF file is empty.')
  if (buffer.byteLength > MAX_PDF_SIZE) throw new BadRequestException('PDF file exceeds the 100 MB limit.')
  if (!fileName.toLowerCase().endsWith('.pdf')) throw new BadRequestException('Only PDF quota documents are supported.')
  const declared = mimeType?.trim().toLowerCase()
  if (declared && ![PDF_MIME, 'application/octet-stream'].includes(declared)) throw new BadRequestException('Uploaded file MIME type is not PDF.')
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') throw new BadRequestException('Uploaded file does not contain a valid PDF signature.')
}

function normalizePdfFileName(value: string) {
  const normalized = value.trim().replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 260)
  return normalized || 'quota-source.pdf'
}

function normalizeSourceKey(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 128)
  if (!normalized) throw new BadRequestException('Knowledge source key is invalid.')
  return normalized
}

function searchTerms(value: string) {
  const terms = value.split(/[\s\n,，。；;:：、/（）()]+/).map((item) => item.trim()).filter((item) => item.length >= 2)
  const unique = [...new Set(terms)].sort((left, right) => right.length - left.length).slice(0, 12)
  return unique.length ? unique : [value]
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numericOrNull(value: string) {
  const normalized = value.trim().replace(/^\((.+)\)$/, '$1')
  return /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized) ? normalized : null
}

function extractFormulaHints(adjustments: string[]) {
  return adjustments.filter((value) => /按\s*\d+(?:\.\d+)?%|乘以|×|换算|调整系数|掺入比|按.*计算/.test(value)).slice(0, 16)
}

function normalizeCategory(value: string): '人工' | '材料' | '机械' | '未分类' {
  return value === '人工' || value === '材料' || value === '机械' ? value : '未分类'
}

function digest(buffer: Buffer) { return createHash('sha256').update(buffer).digest('hex') }
function optionalText(value?: string | null) { return value?.trim() || null }
function requiredText(value: string | null | undefined, message: string) { const normalized = value?.trim(); if (!normalized) throw new BadRequestException(message); return normalized }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, Math.floor(value))) }
function escapeLike(value: string) { return value.replace(/[\\%_]/g, (character) => `\\${character}`) }
function codedError(code: string, message: string) { return Object.assign(new Error(message), { code }) }
function errorCode(error: unknown) { return typeof error === 'object' && error && typeof Reflect.get(error, 'code') === 'string' ? Reflect.get(error, 'code') : 'quota_ingestion_failed' }
function errorMessage(error: unknown) { return (error instanceof Error ? error.message : String(error)).slice(0, 4_000) }
