import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import { In, type FindOptionsWhere, type Repository } from 'typeorm'
import {
  CollaborationRuntimeCapability,
  MANAGED_QUEUE_SERVICE_TOKEN,
  SandboxJobsRuntimeCapability,
  SYSTEM_GLOBAL_SCOPE,
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  isSandboxJobRuntimeError,
  type AgentMiddlewareRuntimeCapabilityRegistry,
  type ArtifactAccessMode,
  type ArtifactLinkVersionMode,
  type ManagedQueueJobContext,
  type ManagedQueueService,
  type WorkspaceFile,
  type WorkspacePortableFileReference
} from '@xpert-ai/plugin-sdk'
import {
  CANVAS_ARTIFACT_EXPORT_JOB,
  CANVAS_ARTIFACT_EXPORT_QUEUE,
  CANVAS_ARTIFACT_SANDBOX_ACTION,
  CANVAS_ARTIFACT_SANDBOX_ACTION_VERSION,
  CANVAS_COLLABORATION_PROVIDER_KEY,
  CANVAS_COLLABORATION_SCHEMA_VERSION,
  CANVAS_PLUGIN_NAME
} from './constants.js'
import { CanvasArtifactExport, CanvasDocument } from './entities/index.js'
import type { CanvasJsonObject, CanvasJsonValue, CanvasRecord, CanvasScope, CanvasSnapshotData } from './types.js'
import { decodeCanvasYDoc, materializeCanvasYDoc } from './canvas-yjs.js'
import {
  CanvasArtifactService,
  resolveCanvasArtifactWorkspaceScope,
  toCanvasWorkspacePortableReference
} from './canvas-artifact.service.js'

const MAX_CANVAS_SNAPSHOT_BYTES = 64 * 1024 * 1024
const CANVAS_EXPORT_MIME_TYPE = 'image/svg+xml'

export type RequestCanvasArtifactExportInput = {
  documentId: string
  accessMode?: ArtifactAccessMode | null
  targetMode?: ArtifactLinkVersionMode | null
  userConfirmedPublicLink?: boolean | null
  baseRevision: number
  baseSnapshotChecksum?: string | null
  pageId?: string | null
}

export type CanvasArtifactExportJobData = { exportId: string }

/** Compatibility extension until every installed Plugin SDK exposes queue ownership fields. */
export type CanvasArtifactExportJobContext = ManagedQueueJobContext & {
  tenantId?: string | null
  organizationId?: string | null
  userId?: string | null
}

export type CanvasArtifactExportCapabilities = {
  available: boolean
  reason?: string
  message?: string
  action: string
  actionVersion: string
  runtimeProfile?: string
  sandboxRuntimeVersion?: string
}

@Injectable()
export class CanvasArtifactExportService {
  private capabilityCache?: { expiresAt: number; value: CanvasArtifactExportCapabilities }

  constructor(
    @InjectRepository(CanvasArtifactExport)
    private readonly exportRepository: Repository<CanvasArtifactExport>,
    @InjectRepository(CanvasDocument)
    private readonly documentRepository: Repository<CanvasDocument>,
    private readonly artifactService: CanvasArtifactService,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: AgentMiddlewareRuntimeCapabilityRegistry,
    @Optional()
    @Inject(MANAGED_QUEUE_SERVICE_TOKEN)
    private readonly queue?: ManagedQueueService
  ) {}

  async getCapabilities(force = false): Promise<CanvasArtifactExportCapabilities> {
    if (!force && this.capabilityCache && this.capabilityCache.expiresAt > Date.now()) return this.capabilityCache.value
    let value: CanvasArtifactExportCapabilities
    const unavailable = (reason: string, message: string): CanvasArtifactExportCapabilities => ({
      available: false,
      reason,
      message,
      action: CANVAS_ARTIFACT_SANDBOX_ACTION,
      actionVersion: CANVAS_ARTIFACT_SANDBOX_ACTION_VERSION
    })
    if (!this.artifactService.isAvailable()) {
      value = unavailable('ARTIFACTS_UNAVAILABLE', 'Platform Artifacts or Workspace Files capability is unavailable.')
    } else if (!this.queue) {
      value = unavailable('MANAGED_QUEUE_UNAVAILABLE', 'Platform Managed Queue is unavailable.')
    } else {
      const jobs = this.runtimeCapabilities?.get(SandboxJobsRuntimeCapability)
      if (!jobs) {
        value = unavailable('SANDBOX_JOBS_UNAVAILABLE', 'Platform Sandbox Jobs capability is unavailable.')
      } else {
        const health = await jobs.getActionHealth({
          pluginName: CANVAS_PLUGIN_NAME,
          action: CANVAS_ARTIFACT_SANDBOX_ACTION,
          actionVersion: CANVAS_ARTIFACT_SANDBOX_ACTION_VERSION
        }).catch((error) => ({
          available: false as const,
          reason: 'PROFILE_UNHEALTHY' as const,
          message: errorMessage(error)
        }))
        if (!health.available) {
          value = unavailable(health.reason ?? 'SANDBOX_ACTION_UNAVAILABLE', health.message ?? 'Canvas export Sandbox Action is unavailable.')
        } else {
          const pool = await this.queue.getExecutionPoolHealth({ executionPool: 'sandbox-browser' }).catch((error) => ({
            executionPool: 'sandbox-browser' as const,
            available: false,
            workerCount: 0,
            warning: errorMessage(error)
          }))
          value = pool.available
            ? {
                available: true,
                action: CANVAS_ARTIFACT_SANDBOX_ACTION,
                actionVersion: CANVAS_ARTIFACT_SANDBOX_ACTION_VERSION,
                runtimeProfile: health.runtimeProfile,
                sandboxRuntimeVersion: health.sandboxRuntimeVersion
              }
            : unavailable('SANDBOX_BROWSER_WORKER_UNAVAILABLE', pool.warning ?? 'No sandbox-browser worker is available.')
        }
      }
    }
    this.capabilityCache = { expiresAt: Date.now() + 30_000, value }
    return value
  }

  async requestPublish(scope: CanvasScope, input: RequestCanvasArtifactExportInput) {
    const tenantId = requireText(scope.tenantId, 'Canvas tenantId is required before an Artifact export can be queued.')
    const capability = await this.getCapabilities()
    if (!capability.available) throw new ServiceUnavailableException(`${capability.reason}: ${capability.message}`)
    if (!this.queue) throw new ServiceUnavailableException('Platform Managed Queue is unavailable.')
    const document = await this.requireDocument(scope, input.documentId)
    if (document.status === 'archived') throw new BadRequestException('Archived Canvas documents cannot be shared.')
    const accessMode = normalizeAccessMode(input.accessMode)
    const targetMode: ArtifactLinkVersionMode = input.targetMode === 'latest' ? 'latest' : 'version'
    validateShareScope(document, scope, accessMode, input.userConfirmedPublicLink === true)
    const requestedRevision = normalizeRevision(input.baseRevision)
    const collaboration = this.runtimeCapabilities?.get(CollaborationRuntimeCapability)
    if (!collaboration) throw new ServiceUnavailableException('Platform Collaboration capability is unavailable.')
    const collaborationDocument = await collaboration.ensureDocument({
      providerKey: CANVAS_COLLABORATION_PROVIDER_KEY,
      resourceId: requireText(document.id, 'Canvas document id is required.'),
      schemaVersion: CANVAS_COLLABORATION_SCHEMA_VERSION
    })
    const state = await collaboration.getDocumentState({ documentId: collaborationDocument.id })
    if (requestedRevision !== state.sequenceNumber) {
      throw new ConflictException(`Canvas working copy has changed: expected revision ${requestedRevision}, current revision ${state.sequenceNumber}. Synchronize and try again.`)
    }
    const snapshot = materializeCanvasYDoc(decodeCanvasYDoc(state.updateBase64))
    const snapshotJson = stableStringify(snapshot)
    const snapshotChecksum = sha256(Buffer.from(snapshotJson, 'utf8'))
    const expectedChecksum = optionalText(input.baseSnapshotChecksum)
    if (expectedChecksum && expectedChecksum !== snapshotChecksum) {
      throw new ConflictException('Canvas working copy checksum changed before the export was queued. Synchronize and try again.')
    }
    validateSnapshotAssets(snapshot)
    const page = resolvePage(snapshot, input.pageId)
    const pending = await this.exportRepository.findOne({
      where: scopedExportWhere(scope, {
        documentId: document.id,
        revision: requestedRevision,
        snapshotChecksum,
        pageId: page.id,
        accessMode,
        targetMode,
        userConfirmedPublicLink: input.userConfirmedPublicLink === true,
        status: In(['queued', 'running'])
      }) as FindOptionsWhere<CanvasArtifactExport>,
      order: { createdAt: 'DESC' }
    })
    if (pending) return compactExport(pending)
    const completed = await this.exportRepository.findOne({
      where: scopedExportWhere(scope, {
        documentId: document.id,
        revision: requestedRevision,
        snapshotChecksum,
        pageId: page.id,
        status: 'succeeded'
      }) as FindOptionsWhere<CanvasArtifactExport>,
      order: { createdAt: 'DESC' }
    })
    if (completed?.outputFileReference && completed.outputSize && completed.outputSha256) {
      completed.accessMode = accessMode
      completed.targetMode = targetMode
      completed.userConfirmedPublicLink = input.userConfirmedPublicLink === true
      await this.finalizeShare(scope, document, completed)
      return compactExport(completed)
    }

    const record = await this.exportRepository.save(this.exportRepository.create({
      ...scopeFields(scope),
      tenantId,
      userId: scope.userId ?? null,
      assistantId: scope.assistantId ?? document.assistantId ?? null,
      documentId: requireText(document.id, 'Canvas document id is required.'),
      status: 'queued',
      stage: 'staging-input',
      revision: requestedRevision,
      snapshotChecksum,
      pageId: page.id,
      pageName: page.name,
      accessMode,
      targetMode,
      userConfirmedPublicLink: input.userConfirmedPublicLink === true
    }))
    const exportId = requireText(record.id, 'Canvas Artifact export id is required.')
    try {
      const inputBuffer = Buffer.from(`${snapshotJson}\n`, 'utf8')
      if (inputBuffer.byteLength > MAX_CANVAS_SNAPSHOT_BYTES) {
        throw new BadRequestException('Canvas snapshot exceeds the 64 MiB backend export limit.')
      }
      const workspaceScope = resolveCanvasArtifactWorkspaceScope(document, scope)
      const file = await this.workspaceFiles().uploadBuffer({
        ...workspaceScope,
        buffer: inputBuffer,
        originalName: 'snapshot.json',
        fileName: 'snapshot.json',
        mimeType: 'application/json',
        size: inputBuffer.byteLength,
        folder: `files/canvas/artifacts/${document.id}/exports/${exportId}/input`,
        metadata: { documentType: 'canvas-artifact-export-input', documentId: document.id, exportId, revision: requestedRevision }
      })
      record.inputFileReference = portableReference(file, workspaceScope, 'snapshot.json', 'application/json', inputBuffer.byteLength)
      record.inputSize = inputBuffer.byteLength
      record.inputSha256 = sha256(inputBuffer)
      record.stage = 'queued'
      await this.exportRepository.save(record)
      const queued = await this.queue.enqueue<CanvasArtifactExportJobData>({
        pluginName: CANVAS_PLUGIN_NAME,
        queueName: CANVAS_ARTIFACT_EXPORT_QUEUE,
        jobName: CANVAS_ARTIFACT_EXPORT_JOB,
        payload: { exportId },
        tenantId: requireText(record.tenantId, 'Canvas Artifact export tenantId was not persisted.'),
        organizationId: record.organizationId ?? null,
        scopeKey: SYSTEM_GLOBAL_SCOPE,
        userId: record.userId ?? null,
        jobId: `canvas-artifact-export-${exportId}`,
        attempts: 3,
        backoffMs: { type: 'exponential', delay: 1_500 },
        executionPool: 'sandbox-browser',
        removeOnComplete: { age: 24 * 60 * 60, count: 100 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 100 }
      })
      record.queueJobId = queued.jobId
      await this.exportRepository.save(record)
      return compactExport(record)
    } catch (error) {
      record.status = 'failed'
      record.stage = 'queueing-failed'
      record.errorMessage = errorMessage(error)
      await this.exportRepository.save(record)
      throw error
    }
  }

  async getExport(scope: CanvasScope, exportId: string) {
    const record = await this.requireExport(scope, exportId)
    if (this.queue && record.queueJobId && (record.status === 'queued' || record.status === 'running')) {
      const job = await this.queue.getJob({ jobId: record.queueJobId, executionPool: 'sandbox-browser' }).catch(() => null)
      if (job?.state === 'failed') {
        record.status = 'failed'
        record.stage = 'queue-failed'
        record.errorMessage = job.failedReason ?? record.errorMessage ?? 'Canvas Artifact export queue job failed.'
        await this.exportRepository.save(record)
      }
    }
    return compactExport(record)
  }

  async deleteForDocument(scope: CanvasScope, documentId: string) {
    const records = await this.exportRepository.find({
      where: scopedExportWhere(scope, { documentId }) as FindOptionsWhere<CanvasArtifactExport>
    })
    const files = this.runtimeCapabilities?.get(WorkspaceFilesRuntimeCapability)
    for (const record of records) {
      if (record.sandboxJobId) await this.runtimeCapabilities?.get(SandboxJobsRuntimeCapability)?.cancel({ jobId: record.sandboxJobId }).catch(() => undefined)
      if (record.queueJobId && this.queue) await this.queue.cancel({ jobId: record.queueJobId, executionPool: 'sandbox-browser' }).catch(() => undefined)
      if (record.inputFileReference && files) await files.deleteFile(record.inputFileReference).catch(() => undefined)
      if (record.outputFileReference && files) await files.deleteFile(record.outputFileReference).catch(() => undefined)
    }
    await this.exportRepository.delete(scopedExportWhere(scope, { documentId }))
  }

  async processExportJob(data: CanvasArtifactExportJobData, jobContext: CanvasArtifactExportJobContext) {
    const tenantId = requireText(
      jobContext?.tenantId,
      'Managed Queue job context tenantId is required for Canvas Artifact export.'
    )
    const organizationId = optionalText(jobContext?.organizationId) ?? null
    const record = await this.exportRepository.findOne({
      where: { id: data.exportId, tenantId, ...(organizationId ? { organizationId } : {}) }
    })
    if (!record) {
      throw new BadRequestException('Canvas Artifact export was not found in the Managed Queue job scope.')
    }
    const recordTenantId = requireText(record.tenantId, 'Canvas Artifact export record tenantId is missing.')
    const recordOrganizationId = optionalText(record.organizationId) ?? null
    if (recordTenantId !== tenantId || recordOrganizationId !== organizationId) {
      throw new BadRequestException('Canvas Artifact export ownership does not match the Managed Queue job scope.')
    }
    if (record.status === 'cancelled' || record.status === 'succeeded') return
    const scope: CanvasScope = {
      tenantId: recordTenantId,
      organizationId: recordOrganizationId,
      workspaceId: record.workspaceId,
      projectId: record.projectId,
      userId: record.userId,
      assistantId: record.assistantId
    }
    const document = await this.requireDocument(scope, record.documentId)
    try {
      const capability = await this.getCapabilities(true)
      if (!capability.available) throw new ServiceUnavailableException(`${capability.reason}: ${capability.message}`)
      if (!record.inputFileReference || !record.inputSize || !record.inputSha256) {
        throw new Error('Canvas Artifact export input reference is missing.')
      }
      record.status = 'running'
      record.stage = 'sandbox-rendering'
      record.sandboxJobId = requireText(record.id, 'Canvas Artifact export id is required.')
      await this.exportRepository.save(record)
      const destination = resolveCanvasArtifactWorkspaceScope(document, scope)
      const jobs = this.sandboxJobs()
      const result = await jobs.run({
        jobId: record.sandboxJobId,
        action: CANVAS_ARTIFACT_SANDBOX_ACTION,
        actionVersion: CANVAS_ARTIFACT_SANDBOX_ACTION_VERSION,
        idempotencyKey: `canvas-export:${record.id}:${record.snapshotChecksum}:${record.pageId}`,
        scope: {
          tenantId: recordTenantId,
          organizationId: recordOrganizationId,
          userId: record.userId,
          pluginName: CANVAS_PLUGIN_NAME,
          businessResourceType: 'canvas-artifact-export',
          businessResourceId: requireText(record.id, 'Canvas Artifact export id is required.')
        },
        payload: {
          title: document.title,
          description: document.description ?? null,
          revision: record.revision,
          pageId: record.pageId,
          pageName: record.pageName ?? 'Canvas',
          emptyLabel: 'This Canvas page is empty.'
        },
        files: [{
          reference: record.inputFileReference,
          targetPath: 'canvas/snapshot.json',
          size: record.inputSize,
          sha256: record.inputSha256
        }],
        outputs: [{
          path: 'canvas.svg',
          originalName: normalizeFileName(document.title, 'svg'),
          mimeType: CANVAS_EXPORT_MIME_TYPE,
          destination: { ...destination, folder: `files/canvas/artifacts/${document.id}/exports/${record.id}/rendered` }
        }],
        timeoutMs: 300_000
      })
      const output = result.outputs.find((candidate) => candidate.path === 'canvas.svg')
      if (!output) throw new Error('Canvas Sandbox Action did not return canvas.svg.')
      const outputFile = await this.workspaceFiles().readBuffer(output.reference)
      if (outputFile.buffer.byteLength !== output.size || sha256(outputFile.buffer) !== output.sha256) {
        throw new Error('Canvas Sandbox Action output integrity check failed.')
      }
      record.outputFileReference = output.reference
      record.outputSize = output.size
      record.outputSha256 = output.sha256
      record.outputMimeType = output.mimeType
      record.report = {
        action: CANVAS_ARTIFACT_SANDBOX_ACTION,
        actionVersion: CANVAS_ARTIFACT_SANDBOX_ACTION_VERSION,
        runtimeProfile: result.runtimeProfile,
        sandboxRuntimeVersion: result.sandboxRuntimeVersion,
        sandboxJobId: result.id,
        attempt: result.attempt
      }
      record.stage = 'publishing-artifact'
      await this.exportRepository.save(record)
      await this.finalizeShare(scope, document, record, outputFile.buffer.toString('utf8'))
      record.status = 'succeeded'
      record.stage = 'complete'
      record.errorCode = null
      record.errorMessage = null
      await this.exportRepository.save(record)
      if (record.inputFileReference) {
        await this.workspaceFiles().deleteFile(record.inputFileReference).catch(() => undefined)
        record.inputFileReference = null
        await this.exportRepository.save(record)
      }
    } catch (error) {
      const sandboxError = isSandboxJobRuntimeError(error) ? error : null
      const retryable = sandboxError ? sandboxError.retryable : !(error instanceof BadRequestException || error instanceof ConflictException)
      record.status = retryable ? 'queued' : sandboxError?.code === 'SANDBOX_CANCELLED' ? 'cancelled' : 'failed'
      record.stage = retryable ? 'retrying' : 'failed'
      record.errorCode = sandboxError?.code ?? (error instanceof ServiceUnavailableException ? 'EXPORT_BACKEND_UNAVAILABLE' : 'CANVAS_EXPORT_FAILED')
      record.errorMessage = errorMessage(error)
      await this.exportRepository.save(record)
      if (retryable) throw error
    }
  }

  private async finalizeShare(scope: CanvasScope, document: CanvasDocument, record: CanvasArtifactExport, svg?: string) {
    let sourceSvg = svg
    if (!sourceSvg) {
      if (!record.outputFileReference || !record.outputSize || !record.outputSha256) throw new Error('Canvas export output is missing.')
      const output = await this.workspaceFiles().readBuffer(record.outputFileReference)
      if (output.buffer.byteLength !== record.outputSize || sha256(output.buffer) !== record.outputSha256) {
        throw new Error('Stored Canvas export output integrity check failed.')
      }
      sourceSvg = output.buffer.toString('utf8')
    }
    const dimensions = readSvgDimensions(sourceSvg)
    const share = await this.artifactService.publishBoundExport(scope, {
      documentId: record.documentId,
      accessMode: record.accessMode,
      targetMode: record.targetMode,
      userConfirmedPublicLink: record.userConfirmedPublicLink,
      baseRevision: record.revision,
      baseSnapshotChecksum: record.snapshotChecksum,
      pageId: record.pageId,
      pageName: record.pageName,
      svg: sourceSvg,
      width: dimensions.width,
      height: dimensions.height
    })
    record.artifactId = share.artifactId
    record.artifactVersionId = share.artifactVersionId
    record.artifactLinkId = share.artifactLinkId
    record.publicUrl = share.publicUrl
    record.accessMode = share.accessMode
    record.targetMode = share.versionMode
    record.status = 'succeeded'
    record.stage = 'complete'
    await this.exportRepository.save(record)
  }

  private workspaceFiles() {
    const files = this.runtimeCapabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!files) throw new ServiceUnavailableException('Platform Workspace Files capability is unavailable.')
    return files
  }

  private sandboxJobs() {
    const jobs = this.runtimeCapabilities?.get(SandboxJobsRuntimeCapability)
    if (!jobs) throw new ServiceUnavailableException('Platform Sandbox Jobs capability is unavailable.')
    return jobs
  }

  private async requireDocument(scope: CanvasScope, documentId: string) {
    const document = await this.documentRepository.findOne({
      where: scopedExportWhere(scope, { id: requireText(documentId, 'Canvas document id is required.') }) as FindOptionsWhere<CanvasDocument>
    })
    if (!document) throw new NotFoundException('Canvas document was not found.')
    return document
  }

  private async requireExport(scope: CanvasScope, exportId: string) {
    const record = await this.exportRepository.findOne({
      where: scopedExportWhere(scope, { id: requireText(exportId, 'Canvas Artifact export id is required.') }) as FindOptionsWhere<CanvasArtifactExport>
    })
    if (!record) throw new NotFoundException('Canvas Artifact export was not found.')
    return record
  }
}

function compactExport(record: CanvasArtifactExport) {
  const share = record.status === 'succeeded' && record.artifactId && record.artifactLinkId && record.publicUrl
    ? {
        documentId: record.documentId,
        artifactId: record.artifactId,
        artifactVersionId: record.artifactVersionId ?? null,
        artifactLinkId: record.artifactLinkId,
        shareUrl: record.publicUrl,
        publicUrl: record.publicUrl,
        accessMode: record.accessMode,
        versionMode: record.targetMode,
        revision: record.revision,
        snapshotChecksum: record.snapshotChecksum,
        pageId: record.pageId,
        reused: false
      }
    : null
  return {
    exportId: record.id,
    documentId: record.documentId,
    status: record.status,
    stage: record.stage,
    revision: record.revision,
    snapshotChecksum: record.snapshotChecksum,
    pageId: record.pageId,
    pageName: record.pageName ?? null,
    errorCode: record.errorCode ?? null,
    errorMessage: record.errorMessage ?? null,
    share
  }
}

function resolvePage(snapshot: CanvasSnapshotData, requestedPageId?: string | null) {
  const pages = Object.values(snapshot.store)
    .filter((record): record is CanvasRecord => record.typeName === 'page' && typeof record.id === 'string')
    .sort((left, right) => String(left.index ?? '').localeCompare(String(right.index ?? '')))
  if (!pages.length) throw new BadRequestException('Canvas snapshot contains no page.')
  const requested = optionalText(requestedPageId)
  const page = requested ? pages.find((candidate) => candidate.id === requested) : pages[0]
  if (!page) throw new BadRequestException(`Canvas page was not found: ${requested}`)
  return { id: page.id, name: optionalText(page.name as string | undefined) ?? 'Canvas' }
}

function validateSnapshotAssets(snapshot: CanvasSnapshotData) {
  for (const record of Object.values(snapshot.store)) {
    if (record.typeName !== 'asset' || !record.props) continue
    for (const key of ['src', 'image']) {
      const value = record.props[key]
      if (typeof value !== 'string' || !value.trim()) continue
      if (!/^data:image\/(?:png|jpeg|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i.test(value.trim())) {
        throw new BadRequestException(
          `Canvas asset ${record.id} uses an external or unsupported ${key} reference. Backend sharing accepts embedded PNG, JPEG, WebP, GIF, or AVIF data only.`
        )
      }
    }
  }
}

function readSvgDimensions(svg: string) {
  const start = svg.match(/^\s*(?:<\?xml[^>]*>\s*)?<svg\b[^>]*>/i)?.[0]
  if (!start) throw new BadRequestException('Canvas Sandbox Action returned invalid SVG content.')
  const width = Number(start.match(/\bwidth=["']([0-9.]+)(?:px)?["']/i)?.[1])
  const height = Number(start.match(/\bheight=["']([0-9.]+)(?:px)?["']/i)?.[1])
  const viewBox = start.match(/\bviewBox=["']\s*-?[0-9.]+[ ,]+-?[0-9.]+[ ,]+([0-9.]+)[ ,]+([0-9.]+)\s*["']/i)
  const resolvedWidth = Number.isFinite(width) && width > 0 ? width : Number(viewBox?.[1])
  const resolvedHeight = Number.isFinite(height) && height > 0 ? height : Number(viewBox?.[2])
  if (!Number.isFinite(resolvedWidth) || !Number.isFinite(resolvedHeight) || resolvedWidth <= 0 || resolvedHeight <= 0) {
    throw new BadRequestException('Canvas Sandbox Action SVG dimensions are invalid.')
  }
  return { width: Math.round(resolvedWidth), height: Math.round(resolvedHeight) }
}

function validateShareScope(document: CanvasDocument, scope: CanvasScope, mode: ArtifactAccessMode, confirmed: boolean) {
  if (mode === 'public_link' && !confirmed) throw new BadRequestException('Public Artifact sharing requires explicit user confirmation.')
  if (mode === 'organization_all' && !document.organizationId && !scope.organizationId) {
    throw new BadRequestException('Organization sharing requires an organization-scoped Canvas document.')
  }
  if (mode === 'workspace_all' && !document.workspaceId && !scope.workspaceId && !document.projectId && !scope.projectId) {
    throw new BadRequestException('Workspace sharing requires a workspace- or project-scoped Canvas document.')
  }
}

function normalizeAccessMode(value?: ArtifactAccessMode | null): ArtifactAccessMode {
  const normalized = value ?? 'public_link'
  if (normalized === 'public_link' || normalized === 'organization_all' || normalized === 'workspace_all') return normalized
  throw new BadRequestException(`Unsupported Canvas Artifact access mode: ${String(value)}`)
}

function portableReference(
  file: WorkspaceFile,
  scope: ReturnType<typeof resolveCanvasArtifactWorkspaceScope>,
  originalName: string,
  mimeType: string,
  size: number
): WorkspacePortableFileReference {
  return toCanvasWorkspacePortableReference(file, scope, originalName, { mimeType, size })
}

function scopedExportWhere<T extends object>(scope: CanvasScope, extra: T) {
  return {
    tenantId: scope.tenantId,
    ...(scope.organizationId != null ? { organizationId: scope.organizationId } : {}),
    ...(scope.projectId != null ? { projectId: scope.projectId } : scope.workspaceId != null ? { workspaceId: scope.workspaceId } : {}),
    ...extra
  }
}

function scopeFields(scope: CanvasScope) {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null,
    projectId: scope.projectId ?? null
  }
}

function stableStringify(value: CanvasJsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as CanvasJsonObject)[key])}`).join(',')}}`
}

function sha256(value: Buffer) {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeRevision(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new BadRequestException('Canvas Artifact baseRevision must be a non-negative integer.')
  return value
}

function requireText(value: string | null | undefined, message: string) {
  const normalized = value?.trim()
  if (!normalized) throw new BadRequestException(message)
  return normalized
}

function optionalText(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized || undefined
}

function normalizeFileName(value: string, extension: string) {
  const base = value.replace(/[\u0000-\u001f<>:"/\\|?*\u007f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'canvas'
  return `${base}.${extension}`
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
