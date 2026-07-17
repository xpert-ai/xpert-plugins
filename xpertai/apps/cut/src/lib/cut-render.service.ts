import { ConflictException, Inject, Injectable, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import {
  MANAGED_QUEUE_SERVICE_TOKEN,
  SANDBOX_JOB_ERROR_CODES,
  SYSTEM_GLOBAL_SCOPE,
  SandboxJobsRuntimeCapability,
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type ManagedQueueJob,
  type ManagedQueueService,
  type RuntimeCapabilityRegistry,
  type SandboxJobErrorCode,
  type SandboxJobOutput,
  type SandboxJobsApi,
  type WorkspaceFilesApi,
  type WorkspaceFileScope
} from '@xpert-ai/plugin-sdk'
import type { FindOptionsWhere, Repository } from 'typeorm'
import {
  CUT_ANALYSIS_QUEUE_NAME,
  CUT_PLUGIN_NAME,
  CUT_RENDER_JOB_NAME,
  CUT_RENDER_SANDBOX_ACTION,
  CUT_RENDER_SANDBOX_ACTION_VERSION
} from './constants.js'
import { reconcileCutAnalysisJobWithQueue } from './cut-analysis-job-reconciliation.js'
import { cutExportProfile, normalizeCutExportSettings, type CutExportSettings } from './cut-export-settings.js'
import { validateCutProjectDocument } from './cut-project.js'
import { CutService } from './cut.service.js'
import { CutActionLog, CutAnalysisJob, CutExport, CutMediaAsset } from './entities/index.js'
import type {
  CutActionType,
  CutJsonValue,
  CutProjectDocument,
  CutRenderQueueJobData,
  CutRenderVariantInput,
  CutScope,
  StartCutHeadlessRenderInput
} from './types.js'

const MAX_VARIANTS = 5
const MAX_TEMPLATE_VARIABLES = 50
const MAX_TEMPLATE_VALUE_LENGTH = 5_000
const MAX_MEDIA_MAPPINGS = 100
const MAX_RENDER_DURATION_SECONDS = 600
const MAX_RENDER_FRAMES = 18_000
// Workspace-backed media is exposed to the Sandbox as a read-only seekable
// input, so Chromium reads only requested byte ranges instead of materializing
// the complete file through API memory. Keep this Action-level safety bound in
// sync with the Cut Runner's staged-media validation.
const MAX_RENDER_MEDIA_BYTES = 4 * 1024 * 1024 * 1024

type RenderScopedEntity = {
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  platformProjectId?: string | null
}

type RenderMetadata = {
  stage: string
  variantName: string
  outputName: string
  changeSummary: string
  documentChecksum: string
  renderDocument: CutProjectDocument
  assetIds: string[]
  exportSettings: CutExportSettings
  sandboxReport?: Record<string, unknown>
  reportFile?: Record<string, unknown>
  errorCode?: string | null
  attempt?: number
  willRetry?: boolean
}

@Injectable()
export class CutRenderService {
  private healthCache?: { expiresAt: number; value: ReturnType<typeof unavailableCapability> | RenderCapability }

  constructor(
    private readonly cut: CutService,
    @InjectRepository(CutAnalysisJob) private readonly jobs: Repository<CutAnalysisJob>,
    @InjectRepository(CutMediaAsset) private readonly media: Repository<CutMediaAsset>,
    @InjectRepository(CutExport) private readonly exports: Repository<CutExport>,
    @InjectRepository(CutActionLog) private readonly logs: Repository<CutActionLog>,
    @Optional() @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly queue?: ManagedQueueService,
    @Optional() @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities?: RuntimeCapabilityRegistry
  ) {}

  async getCapability(force = false) {
    if (!force && this.healthCache && this.healthCache.expiresAt > Date.now()) return this.healthCache.value
    const sandbox = this.capabilities?.get(SandboxJobsRuntimeCapability)
    let value: RenderCapability | ReturnType<typeof unavailableCapability>
    if (!sandbox) {
      value = unavailableCapability('PROVIDER_UNAVAILABLE', 'Platform Sandbox Jobs capability is unavailable.')
    } else {
      const action = await sandbox.getActionHealth({
        pluginName: CUT_PLUGIN_NAME,
        action: CUT_RENDER_SANDBOX_ACTION,
        actionVersion: CUT_RENDER_SANDBOX_ACTION_VERSION
      }).catch((error) => ({ available: false as const, reason: 'PROFILE_UNHEALTHY' as const, message: errorMessage(error) }))
      if (!action.available) {
        value = unavailableCapability(action.reason ?? 'PROFILE_UNHEALTHY', action.message ?? 'Cut render Sandbox Action is unavailable.')
      } else if (!this.queue) {
        value = unavailableCapability('WORKER_UNAVAILABLE', 'Managed Queue is unavailable for Cut headless rendering.')
      } else {
        const pool = await this.queue.getExecutionPoolHealth({ executionPool: 'sandbox-browser' }).catch((error) => ({
          executionPool: 'sandbox-browser' as const,
          available: false,
          workerCount: 0,
          warning: errorMessage(error)
        }))
        value = pool.available ? {
          available: true,
          backend: 'sandbox-job' as const,
          action: CUT_RENDER_SANDBOX_ACTION,
          actionVersion: CUT_RENDER_SANDBOX_ACTION_VERSION,
          runtimeProfile: action.runtimeProfile ?? null,
          sandboxRuntimeVersion: action.sandboxRuntimeVersion ?? null,
          workerCount: pool.workerCount,
          limits: renderLimits()
        } : unavailableCapability('WORKER_UNAVAILABLE', pool.warning ?? 'No worker is consuming sandbox-browser.')
      }
    }
    this.healthCache = { expiresAt: Date.now() + 30_000, value }
    return value
  }

  async start(scope: CutScope, input: StartCutHeadlessRenderInput) {
    const capability = await this.getCapability()
    if ('reason' in capability) throw new ServiceUnavailableException(`${capability.reason}: ${capability.message}`)
    if (!this.queue) throw new ServiceUnavailableException('Managed Queue is required for Cut headless rendering.')
    const detail = await this.cut.getProject(scope, input.projectId)
    if (detail.item.revision !== input.baseRevision) {
      throw new ConflictException(`Cut project revision changed from ${input.baseRevision} to ${detail.item.revision}; reload before rendering.`)
    }
    const variants = normalizeVariants(input.variants, detail.document)
    const exportSettings = normalizeCutExportSettings(input.exportSettings)
    const exportProfile = cutExportProfile(exportSettings)
    const assets = new Map(detail.media.map((asset) => [asset.id?.toLowerCase(), asset]))
    // Validate every requested variant before any database row or queue job is created.
    const plans = variants.map((variant) => {
      const renderDocument = prepareRenderDocument(detail.document, variant, assets)
      assertRenderBounds(renderDocument)
      const assetIds = [...new Set(renderDocument.tracks.flatMap((track) => track.clips.map((clip) => clip.mediaAssetId).filter(isString)))]
      const referencedAssets = assetIds.map((id) => requireAsset(assets, id))
      const mediaBytes = referencedAssets.reduce((sum, asset) => sum + asset.size, 0)
      if (mediaBytes > MAX_RENDER_MEDIA_BYTES) {
        throw new Error(`Cut headless render media exceeds the ${MAX_RENDER_MEDIA_BYTES}-byte seekable renderer safety limit.`)
      }
      const documentChecksum = hashJson({
        sourceRevision: input.baseRevision,
        exportSettings,
        document: renderDocument,
        assets: referencedAssets.map((asset) => ({ id: asset.id, checksum: asset.checksum, size: asset.size }))
      })
      const idempotencyKey = boundedIdempotencyKey(input.idempotencyKey
        ? `${input.idempotencyKey}:${input.baseRevision}:${variant.name}:${documentChecksum}`
        : `render:${input.projectId}:${input.baseRevision}:${variant.name}:${documentChecksum}`)
      return { variant, renderDocument, assetIds, documentChecksum, idempotencyKey }
    })
    const results = []
    const newlyQueuedRows: CutAnalysisJob[] = []
    for (const plan of plans) {
      const { variant, renderDocument, assetIds, documentChecksum, idempotencyKey } = plan
      const existing = await this.jobs.findOne({ where: renderWhere<CutAnalysisJob>(scope, {
        cutProjectId: input.projectId,
        type: 'render',
        executionMode: 'server',
        idempotencyKey
      }) })
      if (existing && !['failed', 'cancelled'].includes(existing.status)) {
        const reconciliation = await reconcileCutAnalysisJobWithQueue(this.queue, existing)
        if (reconciliation.changed) await this.jobs.save(existing)
        if (!['failed', 'cancelled'].includes(existing.status)) {
          results.push({ ...compactRenderJob(existing), idempotentReplay: true })
          continue
        }
      }
      const metadata: RenderMetadata = {
        stage: 'queued',
        variantName: variant.name,
        outputName: `${safeName(detail.item.title)}-${safeName(variant.name)}-r${input.baseRevision}-${documentChecksum.slice(0, 8)}.${exportProfile.extension}`,
        changeSummary: input.changeSummary,
        documentChecksum,
        renderDocument,
        assetIds,
        exportSettings
      }
      const row = await this.jobs.save(this.jobs.create({
        ...renderCreate(scope),
        cutProjectId: input.projectId,
        type: 'render',
        executionMode: 'server',
        status: 'queued',
        progress: 0,
        inputRevision: input.baseRevision,
        idempotencyKey,
        cancellationRequested: false,
        metadata: metadata as unknown as CutJsonValue,
        createdById: scope.userId ?? null,
        assistantId: scope.assistantId ?? null
      }))
      const jobId = requireId(row.id, 'render job')
      const payload: CutRenderQueueJobData = {
        jobId,
        projectId: input.projectId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? null,
        workspaceId: scope.workspaceId ?? null,
        platformProjectId: scope.projectId ?? null,
        userId: scope.userId ?? null,
        assistantId: scope.assistantId ?? null
      }
      try {
        const queued = await this.queue.enqueue({
          pluginName: CUT_PLUGIN_NAME,
          queueName: CUT_ANALYSIS_QUEUE_NAME,
          jobName: CUT_RENDER_JOB_NAME,
          payload,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId ?? null,
          userId: scope.userId ?? null,
          // Cut is a system plugin, so its processor is registered in this
          // installation scope; business tenancy remains in the envelope.
          scopeKey: SYSTEM_GLOBAL_SCOPE,
          jobId,
          attempts: 3,
          backoffMs: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { age: 7 * 24 * 60 * 60, count: 10_000 },
          removeOnFail: { age: 30 * 24 * 60 * 60, count: 10_000 },
          executionPool: 'sandbox-browser'
        })
        row.queueJobId = queued.jobId
        await this.jobs.save(row)
        newlyQueuedRows.push(row)
      } catch (error) {
        row.status = 'failed'
        row.errorMessage = errorMessage(error)
        row.completedAt = new Date()
        row.metadata = { ...metadata, stage: 'queue-failed', errorCode: 'QUEUE_UNAVAILABLE' } as unknown as CutJsonValue
        await this.jobs.save(row)
        await this.abortNewBatchRows(newlyQueuedRows)
        throw error
      }
      await this.writeLog(scope, input.projectId, 'cut_render_started', input.changeSummary, {
        jobId,
        variantName: variant.name,
        sourceRevision: input.baseRevision,
        documentChecksum,
        width: renderDocument.settings.width,
        height: renderDocument.settings.height,
        fps: renderDocument.settings.fps,
        durationSeconds: renderDocument.settings.durationSeconds
      })
      results.push({ ...compactRenderJob(row), idempotentReplay: false })
    }
    return { success: true, projectId: input.projectId, sourceRevision: input.baseRevision, jobs: results, capability }
  }

  async process(job: ManagedQueueJob<CutRenderQueueJobData>) {
    const input = requireQueuePayload(job.data)
    const scope = scopeFromPayload(input)
    const row = await this.requireJob(scope, input.projectId, input.jobId)
    if (row.status === 'succeeded' || row.status === 'cancelled' || row.cancellationRequested) return
    const metadata = requireRenderMetadata(row.metadata)
    const exportProfile = cutExportProfile(metadata.exportSettings)
    const outputPath = `cut.${exportProfile.extension}`
    row.status = 'running'
    row.progress = 10
    row.startedAt ??= new Date()
    row.completedAt = null
    row.errorMessage = null
    row.sandboxJobId = requireId(row.id, 'render job')
    row.metadata = { ...metadata, stage: 'sandbox-starting' } as unknown as CutJsonValue
    await this.jobs.save(row)
    try {
      const assets = await this.loadAssets(scope, input.projectId, metadata.assetIds)
      const destination = renderDestination(scope, input.projectId)
      const sandbox = this.sandboxJobs()
      row.progress = 20
      row.metadata = { ...metadata, stage: 'rendering' } as unknown as CutJsonValue
      await this.jobs.save(row)
      const files = assets.map((asset) => ({
        reference: asset.fileReference,
        targetPath: `media/${asset.id}/${safeMediaName(asset.originalName, asset.mimeType)}`,
        size: asset.size,
        sha256: asset.checksum,
        access: 'read-only-seekable' as const
      }))
      const result = await sandbox.run({
        jobId: requireId(row.id, 'render job'),
        action: CUT_RENDER_SANDBOX_ACTION,
        actionVersion: CUT_RENDER_SANDBOX_ACTION_VERSION,
        idempotencyKey: `cut-render:${row.id}:${metadata.documentChecksum}`,
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId ?? null,
          userId: scope.userId ?? null,
          pluginName: CUT_PLUGIN_NAME,
          businessResourceType: 'cut-render',
          businessResourceId: requireId(row.id, 'render job')
        },
        payload: {
          sourceRevision: row.inputRevision,
          timeoutMs: 15 * 60_000,
          document: metadata.renderDocument,
          exportSettings: metadata.exportSettings
        } as never,
        files,
        outputs: [
          { path: outputPath, originalName: metadata.outputName, mimeType: exportProfile.mimeType, destination: { ...destination, folder: `files/cut/${input.projectId}/exports` } },
          { path: 'report.json', originalName: `${metadata.outputName}.report.json`, mimeType: 'application/json', destination: { ...destination, folder: `files/cut/${input.projectId}/exports/reports` } }
        ],
        timeoutMs: 16 * 60_000
      })
      const current = await this.requireJob(scope, input.projectId, input.jobId)
      if (current.status === 'cancelled' || current.cancellationRequested) return
      const video = requireOutput(result.outputs, outputPath)
      const reportFile = requireOutput(result.outputs, 'report.json')
      let exported = await this.exports.findOne({ where: renderWhere<CutExport>(scope, { analysisJobId: input.jobId }) })
      if (!exported) {
        exported = await this.exports.save(this.exports.create({
          ...renderCreate(scope),
          cutProjectId: input.projectId,
          analysisJobId: input.jobId,
          sourceRevision: row.inputRevision,
          kind: metadata.exportSettings.format,
          mimeType: video.mimeType,
          size: video.size,
          checksum: video.sha256,
          fileReference: video.reference,
          fileUrl: video.fileUrl ?? null,
          changeSummary: metadata.changeSummary,
          renderer: `sandbox-job:${CUT_RENDER_SANDBOX_ACTION}@${CUT_RENDER_SANDBOX_ACTION_VERSION}`,
          report: {
            action: result.action,
            actionVersion: result.actionVersion,
            runtimeProfile: result.runtimeProfile,
            sandboxRuntimeVersion: result.sandboxRuntimeVersion,
            sandboxJobId: result.id,
            attempt: result.attempt,
            sourceRevision: row.inputRevision,
            documentChecksum: metadata.documentChecksum,
            variantName: metadata.variantName,
            exportSettings: metadata.exportSettings,
            reportFile: portableOutput(reportFile)
          }
        }))
      }
      current.status = 'succeeded'
      current.progress = 100
      current.resultExportId = requireId(exported.id, 'export')
      current.sandboxJobId = result.id
      current.completedAt = new Date()
      current.errorMessage = null
      current.metadata = {
        ...metadata,
        stage: 'complete',
        sandboxReport: {
          action: result.action,
          actionVersion: result.actionVersion,
          runtimeProfile: result.runtimeProfile,
          sandboxRuntimeVersion: result.sandboxRuntimeVersion,
          attempt: result.attempt
        },
        reportFile: portableOutput(reportFile)
      } as unknown as CutJsonValue
      await this.jobs.save(current)
      await this.writeLog(scope, input.projectId, 'cut_render_completed', metadata.changeSummary, {
        jobId: input.jobId,
        exportId: exported.id ?? null,
        sandboxJobId: result.id,
        variantName: metadata.variantName,
        format: metadata.exportSettings.format,
        quality: metadata.exportSettings.quality,
        includeAudio: metadata.exportSettings.includeAudio,
        sourceRevision: row.inputRevision,
        size: video.size,
        checksum: video.sha256
      })
    } catch (error) {
      const current = await this.requireJob(scope, input.projectId, input.jobId)
      const sandboxFailure = readSandboxJobFailure(error)
      if (current.cancellationRequested || sandboxFailure?.code === 'SANDBOX_CANCELLED') {
        current.status = 'cancelled'
        current.progress = 0
        current.completedAt = new Date()
        current.errorMessage = null
        current.metadata = { ...metadata, stage: 'cancelled' } as unknown as CutJsonValue
        await this.jobs.save(current)
        return
      }
      const attempt = job.attemptsMade + 1
      const attempts = readAttempts(job.opts)
      const retryable = sandboxFailure?.retryable ?? true
      const willRetry = retryable && attempt < attempts
      current.status = willRetry ? 'queued' : 'failed'
      current.progress = 0
      current.errorMessage = errorMessage(error)
      current.completedAt = willRetry ? null : new Date()
      current.metadata = {
        ...metadata,
        stage: willRetry ? 'retrying' : 'failed',
        errorCode: sandboxFailure?.code ?? 'RENDER_FAILED',
        attempt,
        willRetry
      } as unknown as CutJsonValue
      await this.jobs.save(current)
      if (!willRetry) {
        await this.writeLog(scope, input.projectId, 'cut_render_failed', 'Cut headless render failed.', {
          jobId: input.jobId,
          variantName: metadata.variantName,
          attempt,
          errorCode: sandboxFailure?.code ?? 'RENDER_FAILED',
          errorMessage: current.errorMessage ?? 'Unknown render failure.'
        })
        return
      }
      throw error
    }
  }

  async cancel(scope: CutScope, projectId: string, jobId: string, changeSummary: string) {
    const row = await this.requireJob(scope, projectId, jobId)
    if (row.type !== 'render') throw new Error('Cut render cancellation requires a render analysis job.')
    if (row.status === 'cancelled') return { success: true, projectId, jobId, status: row.status, idempotentReplay: true }
    if (['succeeded', 'failed'].includes(row.status)) return { success: false, projectId, jobId, status: row.status, reason: 'terminal' }
    row.cancellationRequested = true
    await this.jobs.save(row)
    if (row.sandboxJobId) await this.sandboxJobs().cancel({ jobId: row.sandboxJobId }).catch(() => undefined)
    if (!this.queue || !row.queueJobId) throw new ServiceUnavailableException('Managed Queue job is unavailable for Cut render cancellation.')
    const result = await this.queue.cancel({ jobId: row.queueJobId, executionPool: 'sandbox-browser' })
    if (result.success || result.reason === 'not_found') {
      row.status = 'cancelled'
      row.progress = 0
      row.completedAt = new Date()
      const metadata = optionalRenderMetadata(row.metadata)
      row.metadata = { ...metadata, stage: 'cancelled' } as unknown as CutJsonValue
      await this.jobs.save(row)
    }
    await this.writeLog(scope, projectId, 'cut_analysis_job_cancelled', changeSummary, {
      jobId,
      queueJobId: row.queueJobId,
      sandboxJobId: row.sandboxJobId ?? null,
      status: row.status,
      queueState: result.state ?? null,
      cooperative: !result.success && result.reason !== 'not_found'
    })
    return {
      success: true,
      projectId,
      jobId,
      status: row.status,
      cancellationRequested: true,
      cooperative: !result.success && result.reason !== 'not_found',
      queueState: result.state ?? null
    }
  }

  private async abortNewBatchRows(rows: CutAnalysisJob[]) {
    if (!this.queue) return
    for (const row of rows) {
      row.cancellationRequested = true
      if (row.queueJobId) await this.queue.cancel({ jobId: row.queueJobId, executionPool: 'sandbox-browser' }).catch(() => undefined)
      row.status = 'cancelled'
      row.progress = 0
      row.completedAt = new Date()
      row.metadata = { ...optionalRenderMetadata(row.metadata), stage: 'batch-aborted' } as unknown as CutJsonValue
      await this.jobs.save(row)
    }
  }

  private async loadAssets(scope: CutScope, projectId: string, assetIds: string[]) {
    const workspaceFiles = this.workspaceFiles()
    const assets = []
    for (const id of assetIds) {
      const asset = await this.media.findOne({ where: renderWhere<CutMediaAsset>(scope, { id, cutProjectId: projectId }) })
      if (!asset) throw new NotFoundException(`Cut render media asset ${id} was not found in the current scope.`)
      const previousReference = asset.fileReference
      const reference = await workspaceFiles.resolveRuntimeReference({
        ...previousReference,
        tenantId: previousReference.tenantId ?? scope.tenantId,
        userId: previousReference.userId ?? scope.userId ?? null
      })
      if (reference.tenantId !== scope.tenantId) {
        throw new Error(`Cut render media asset ${id} belongs to another tenant.`)
      }
      asset.fileReference = reference
      if (JSON.stringify(previousReference) !== JSON.stringify(reference)) await this.media.save(asset)
      assets.push(asset)
    }
    return assets
  }

  private async requireJob(scope: CutScope, projectId: string, jobId: string) {
    const row = await this.jobs.findOne({ where: renderWhere<CutAnalysisJob>(scope, { id: jobId, cutProjectId: projectId }) })
    if (!row) throw new NotFoundException('Cut render job was not found in the current tenant and organization.')
    return row
  }

  private sandboxJobs(): SandboxJobsApi {
    const sandbox = this.capabilities?.get(SandboxJobsRuntimeCapability)
    if (!sandbox) throw new ServiceUnavailableException('Platform Sandbox Jobs capability is unavailable for Cut rendering.')
    return sandbox
  }

  private workspaceFiles(): WorkspaceFilesApi {
    const files = this.capabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!files) throw new ServiceUnavailableException('Workspace Files capability is unavailable for Cut rendering.')
    return files
  }

  private async writeLog(scope: CutScope, projectId: string, action: CutActionType, message: string, snapshot: CutJsonValue) {
    await this.logs.save(this.logs.create({
      ...renderCreate(scope),
      cutProjectId: projectId,
      action,
      actorType: scope.assistantId ? 'agent' : scope.userId ? 'user' : 'system',
      actorId: scope.userId ?? scope.assistantId ?? null,
      message,
      errorMessage: null,
      snapshot
    }))
  }
}

type RenderCapability = {
  available: true
  backend: 'sandbox-job'
  action: string
  actionVersion: string
  runtimeProfile: string | null
  sandboxRuntimeVersion: string | null
  workerCount: number
  limits: ReturnType<typeof renderLimits>
}

function unavailableCapability(reason: string, message: string) {
  return { available: false as const, backend: 'sandbox-job' as const, reason, message, limits: renderLimits() }
}
function renderLimits() {
  return { maxVariants: MAX_VARIANTS, maxDurationSeconds: MAX_RENDER_DURATION_SECONDS, maxFrames: MAX_RENDER_FRAMES, maxWidth: 3840, maxHeight: 2160, maxFps: 60, maxMediaBytes: MAX_RENDER_MEDIA_BYTES }
}
function normalizeVariants(value: CutRenderVariantInput[] | undefined, document: CutProjectDocument) {
  const variants = value?.length ? value : [{ name: `${document.settings.width}x${document.settings.height}` }]
  if (variants.length > MAX_VARIANTS) throw new Error(`Cut headless export supports at most ${MAX_VARIANTS} variants per request.`)
  const names = new Set<string>()
  return variants.map((variant) => {
    const name = boundedText(variant.name, 80, 'variant name')
    if (names.has(name.toLowerCase())) throw new Error(`Duplicate Cut render variant name: ${name}.`)
    names.add(name.toLowerCase())
    const width = variant.width ?? document.settings.width
    const height = variant.height ?? document.settings.height
    if (!Number.isInteger(width) || width < 16 || width > 3840 || !Number.isInteger(height) || height < 16 || height > 2160 || width * height > 3840 * 2160) {
      throw new Error('Cut render variant dimensions must fit within 3840x2160 and the 4K pixel limit.')
    }
    const variables = normalizeVariables(variant.variables)
    const mediaAssetMap = normalizeMediaAssetMap(variant.mediaAssetMap)
    return { name, width, height, variables, mediaAssetMap }
  })
}
function normalizeVariables(value: Record<string, string> | undefined) {
  const entries = Object.entries(value ?? {})
  if (entries.length > MAX_TEMPLATE_VARIABLES) throw new Error(`Cut render supports at most ${MAX_TEMPLATE_VARIABLES} template variables.`)
  return Object.fromEntries(entries.map(([key, item]) => {
    if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(key)) throw new Error(`Invalid Cut template variable name: ${key}.`)
    if (typeof item !== 'string' || item.length > MAX_TEMPLATE_VALUE_LENGTH) throw new Error(`Cut template variable ${key} exceeds ${MAX_TEMPLATE_VALUE_LENGTH} characters.`)
    return [key, item]
  }))
}
function normalizeMediaAssetMap(value: Record<string, string> | undefined) {
  const entries = Object.entries(value ?? {})
  if (entries.length > MAX_MEDIA_MAPPINGS) throw new Error(`Cut render supports at most ${MAX_MEDIA_MAPPINGS} media mappings per variant.`)
  return Object.fromEntries(entries.map(([sourceId, replacementId]) => {
    if (!isUuid(sourceId) || !isUuid(replacementId)) throw new Error('Cut render media mappings require UUID media asset ids.')
    return [sourceId.toLowerCase(), replacementId.toLowerCase()]
  }))
}
function prepareRenderDocument(
  source: CutProjectDocument,
  variant: { name: string; width: number; height: number; variables: Record<string, string>; mediaAssetMap: Record<string, string> },
  assets: Map<string | undefined, ReturnType<CutService['getProject']> extends Promise<infer R> ? R extends { media: Array<infer M> } ? M : never : never>
) {
  const scaleX = variant.width / source.settings.width
  const scaleY = variant.height / source.settings.height
  const fontScale = Math.min(scaleX, scaleY)
  const sourceMediaIds = new Set(source.tracks.flatMap((track) => track.clips.map((clip) => clip.mediaAssetId?.toLowerCase()).filter(isString)))
  for (const sourceId of Object.keys(variant.mediaAssetMap)) {
    if (!sourceMediaIds.has(sourceId)) throw new Error(`Cut render media mapping source ${sourceId} is not used by the project.`)
  }
  const document: CutProjectDocument = structuredClone(source)
  document.settings.width = variant.width
  document.settings.height = variant.height
  for (const track of document.tracks) {
    for (const clip of track.clips) {
      delete clip.source
      if (clip.transform) clip.transform = {
        ...clip.transform,
        x: clip.transform.x * scaleX,
        y: clip.transform.y * scaleY,
        width: clip.transform.width * scaleX,
        height: clip.transform.height * scaleY
      }
      if (clip.fontSize) clip.fontSize *= fontScale
      if (clip.type === 'text' && clip.text) clip.text = applyVariables(clip.text, variant.variables)
      if (['video', 'image', 'audio'].includes(clip.type)) {
        if (!clip.mediaAssetId) throw new Error(`Cut headless rendering requires mediaAssetId on clip ${clip.id}.`)
        clip.mediaAssetId = variant.mediaAssetMap[clip.mediaAssetId.toLowerCase()] ?? clip.mediaAssetId
        const asset = requireAsset(assets, clip.mediaAssetId)
        assertAssetCompatibility(clip.type, asset.mimeType, clip.id)
        clip.previewUrl = `/media/${asset.id}/${safeMediaName(asset.originalName, asset.mimeType)}`
      } else delete clip.previewUrl
    }
  }
  return validateCutProjectDocument(document)
}
function applyVariables(value: string, variables: Record<string, string>) {
  return value.replace(/\{\{\s*([a-zA-Z0-9_.-]{1,64})\s*\}\}/g, (match, key: string) => Object.hasOwn(variables, key) ? variables[key] : match)
}
function assertRenderBounds(document: CutProjectDocument) {
  const { width, height, fps, durationSeconds } = document.settings
  if (width > 3840 || height > 2160 || width * height > 3840 * 2160) throw new Error('Cut render exceeds the 4K pixel limit.')
  if (fps > 60) throw new Error('Cut render exceeds 60 fps.')
  if (durationSeconds > MAX_RENDER_DURATION_SECONDS) throw new Error(`Cut render exceeds ${MAX_RENDER_DURATION_SECONDS} seconds.`)
  if (Math.round(durationSeconds * fps) > MAX_RENDER_FRAMES) throw new Error(`Cut render exceeds ${MAX_RENDER_FRAMES} frames.`)
}
function requireAsset<T extends { id?: string }>(assets: Map<string | undefined, T>, id: string) {
  const asset = assets.get(id) ?? assets.get(id.toLowerCase())
  if (!asset) throw new NotFoundException(`Cut render media asset ${id} is missing from the project.`)
  return asset
}
function assertAssetCompatibility(clipType: 'video' | 'image' | 'audio' | 'text' | 'color', mimeType: string, clipId: string) {
  const compatible = clipType === 'video' ? mimeType.startsWith('video/')
    : clipType === 'image' ? mimeType.startsWith('image/')
      : clipType === 'audio' ? mimeType.startsWith('audio/') || mimeType.startsWith('video/')
        : true
  if (!compatible) throw new Error(`Cut render replacement asset is incompatible with ${clipType} clip ${clipId}.`)
}
function requireRenderMetadata(value: CutJsonValue | null | undefined): RenderMetadata {
  const metadata = optionalRenderMetadata(value)
  if (!metadata.renderDocument || !metadata.documentChecksum || !metadata.outputName || !metadata.variantName || !Array.isArray(metadata.assetIds)) {
    throw new Error('Cut render job metadata is incomplete.')
  }
  return { ...metadata, exportSettings: normalizeCutExportSettings(metadata.exportSettings) } as RenderMetadata
}
function optionalRenderMetadata(value: CutJsonValue | null | undefined) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as unknown as Partial<RenderMetadata> : {}
}
function compactRenderJob(row: CutAnalysisJob) {
  const metadata = optionalRenderMetadata(row.metadata)
  return {
    jobId: row.id,
    projectId: row.cutProjectId,
    type: row.type,
    status: row.status,
    progress: row.progress,
    sourceRevision: row.inputRevision,
    variantName: metadata.variantName ?? null,
    exportSettings: normalizeCutExportSettings(metadata.exportSettings),
    width: metadata.renderDocument?.settings.width ?? null,
    height: metadata.renderDocument?.settings.height ?? null,
    fps: metadata.renderDocument?.settings.fps ?? null,
    durationSeconds: metadata.renderDocument?.settings.durationSeconds ?? null,
    resultExportId: row.resultExportId ?? null,
    errorMessage: row.errorMessage ?? null
  }
}
function requireQueuePayload(value: CutRenderQueueJobData) {
  if (!value?.jobId || !value.projectId || !value.tenantId) throw new Error('Cut render queue payload is incomplete.')
  return value
}
function scopeFromPayload(input: CutRenderQueueJobData): CutScope {
  return { tenantId: input.tenantId, organizationId: input.organizationId ?? null, workspaceId: input.workspaceId ?? null, projectId: input.platformProjectId ?? null, userId: input.userId ?? null, assistantId: input.assistantId ?? null }
}
function renderDestination(scope: CutScope, cutProjectId: string): WorkspaceFileScope {
  if (scope.projectId) return { tenantId: scope.tenantId, userId: scope.userId, catalog: 'projects', scopeId: scope.projectId, projectId: scope.projectId }
  const scopeId = scope.assistantId ?? cutProjectId
  return { tenantId: scope.tenantId, userId: scope.userId, catalog: 'xperts', scopeId, xpertId: scopeId }
}
function renderCreate(scope: CutScope): RenderScopedEntity {
  return { tenantId: scope.tenantId, organizationId: scope.organizationId ?? null, workspaceId: scope.workspaceId ?? null, platformProjectId: scope.projectId ?? null }
}
function renderWhere<T extends RenderScopedEntity>(scope: CutScope, where: Partial<T>): FindOptionsWhere<T> {
  return { ...where, tenantId: scope.tenantId, organizationId: (scope.organizationId ?? null) as T['organizationId'] } as FindOptionsWhere<T>
}
function requireOutput(outputs: SandboxJobOutput[], path: string) {
  const output = outputs.find((candidate) => candidate.path === path)
  if (!output) throw new Error(`Cut Sandbox Job did not return ${path}.`)
  return output
}
function portableOutput(output: SandboxJobOutput) {
  return { path: output.path, originalName: output.originalName, mimeType: output.mimeType, size: output.size, sha256: output.sha256, reference: output.reference, fileUrl: output.fileUrl ?? null, workspacePath: output.workspacePath ?? null }
}
function safeMediaName(name: string, mimeType: string) {
  const base = safeName(name)
  if (base.includes('.')) return base
  const extension = ({ 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mp4': 'm4a', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' } as Record<string, string>)[mimeType]
  return extension ? `${base}.${extension}` : base
}
function safeName(value: string) { return value.normalize('NFKC').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 160) || 'cut' }
function boundedText(value: string, max: number, label: string) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized || normalized.length > max) throw new Error(`Cut ${label} must contain 1-${max} characters.`)
  return normalized
}
function boundedIdempotencyKey(value: string) { return value.length <= 240 ? value : `render:${createHash('sha256').update(value).digest('hex')}` }
function hashJson(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
function requireId(value: string | undefined, label: string) { if (!value) throw new Error(`Cut persistence did not return a ${label} id.`); return value }
function readAttempts(options: Record<string, unknown> | undefined) { const value = options?.attempts; return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 1 }
function readSandboxJobFailure(error: unknown): { code: SandboxJobErrorCode; retryable: boolean } | null {
  if (!error || typeof error !== 'object') return null
  const candidate = error as { code?: unknown; retryable?: unknown }
  const code = SANDBOX_JOB_ERROR_CODES.find((value) => value === candidate.code)
  return code && typeof candidate.retryable === 'boolean' ? { code, retryable: candidate.retryable } : null
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error) }
function isString(value: string | undefined): value is string { return typeof value === 'string' && Boolean(value) }
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) }
