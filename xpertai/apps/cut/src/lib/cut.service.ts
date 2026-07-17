import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { type FindOptionsWhere, Repository } from 'typeorm'
import {
  WORKSPACE_FILES_SOURCE,
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type AgentMiddlewareRuntimeCapabilityRegistry,
  type WorkspaceFile,
  type WorkspaceFileReference,
  type WorkspacePortableFileReference,
  type WorkspaceRuntimeFileBuffer
} from '@xpert-ai/plugin-sdk'
import { appendCutMediaClip, applyCutEdit, createStarterCutProject, validateCutProjectDocument } from './cut-project.js'
import { normalizeCutFileName } from './cut-file-name.js'
import { probeCutMediaMetadata } from './cut-media-metadata.js'
import { cutExportProfile, normalizeCutExportSettings, type CutExportFormat } from './cut-export-settings.js'
import {
  CutActionLog,
  CutAnalysisJob,
  CutCaptionDraft,
  CutEditProposal,
  CutExport,
  CutMediaAsset,
  CutMediaSegment,
  CutProject,
  CutProjectVersion,
  CutTranscript,
  CutTranscriptSegment
} from './entities/index.js'
import type {
  ApplyCutEditInput,
  ApplyCutEditBatchInput,
  CreateCutProjectInput,
  CutActionType,
  CutActorType,
  CutClipType,
  CutJsonValue,
  CutMediaMetadata,
  CutProjectDocument,
  CutScope,
  SaveCutProjectInput,
  SearchCutProjectsInput
} from './types.js'

type ScopedEntity = {
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  platformProjectId?: string | null
}

@Injectable()
export class CutService {
  constructor(
    @InjectRepository(CutProject) private readonly projects: Repository<CutProject>,
    @InjectRepository(CutProjectVersion) private readonly versions: Repository<CutProjectVersion>,
    @InjectRepository(CutMediaAsset) private readonly media: Repository<CutMediaAsset>,
    @InjectRepository(CutExport) private readonly exports: Repository<CutExport>,
    @InjectRepository(CutActionLog) private readonly logs: Repository<CutActionLog>,
    @Optional() @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: AgentMiddlewareRuntimeCapabilityRegistry
  ) {}

  async searchProjects(scope: CutScope, input: SearchCutProjectsInput = {}) {
    const page = Math.max(1, Math.floor(input.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(input.pageSize ?? 20)))
    const rows = await this.projects.find({
      where: scopedWhere<CutProject>(scope, input.status ? { status: input.status } : {}),
      order: { updatedAt: 'DESC' }
    })
    const query = normalizeOptional(input.search)?.toLowerCase()
    const filtered = query ? rows.filter((row) => `${row.title} ${row.brief ?? ''}`.toLowerCase().includes(query)) : rows
    const start = (page - 1) * pageSize
    return { items: filtered.slice(start, start + pageSize).map(compactProject), total: filtered.length, page, pageSize }
  }

  async createProject(scope: CutScope, input: CreateCutProjectInput) {
    const title = normalizeRequired(input.title, 'Cut project title is required.')
    const document = createStarterCutProject(input)
    const project = await this.projects.save(
      this.projects.create({
        ...scopedCreate(scope),
        assistantId: scope.assistantId ?? null,
        conversationId: scope.conversationId ?? null,
        createdById: scope.userId ?? null,
        title,
        brief: normalizeOptional(input.brief),
        status: 'draft',
        document,
        revision: 1,
        currentVersionNumber: 0
      })
    )
    await this.writeLog(scope, {
      cutProjectId: requireId(project.id),
      action: 'cut_project_created',
      actorType: actorType(scope),
      message: input.changeSummary ?? `Created Cut project "${title}".`,
      snapshot: { width: document.settings.width, height: document.settings.height, fps: document.settings.fps }
    })
    return this.getProject(scope, requireId(project.id))
  }

  async getProject(scope: CutScope, projectId: string) {
    const project = await this.requireProject(scope, projectId)
    const [media, versions, exports, logs] = await Promise.all([
      this.media.find({ where: scopedWhere<CutMediaAsset>(scope, { cutProjectId: projectId }), order: { createdAt: 'ASC' } }),
      this.versions.find({ where: scopedWhere<CutProjectVersion>(scope, { cutProjectId: projectId }), order: { versionNumber: 'DESC' }, take: 30 }),
      this.exports.find({ where: scopedWhere<CutExport>(scope, { cutProjectId: projectId }), order: { createdAt: 'DESC' }, take: 30 }),
      this.logs.find({ where: scopedWhere<CutActionLog>(scope, { cutProjectId: projectId }), order: { createdAt: 'DESC' }, take: 30 })
    ])
    return {
      item: compactProject(project),
      document: stripWorkspacePreviewUrls(validateCutProjectDocument(project.document)),
      media: media.map(compactMedia),
      versions: versions.map(compactVersion),
      exports: exports.map(compactExport),
      logs: logs.map(compactLog)
    }
  }

  async deleteProject(scope: CutScope, projectId: string, baseRevision: number | undefined) {
    const project = await this.requireProject(scope, projectId)
    assertRevision(project, baseRevision)
    const [media, exports] = await Promise.all([
      this.media.find({ where: scopedWhere<CutMediaAsset>(scope, { cutProjectId: projectId }) }),
      this.exports.find({ where: scopedWhere<CutExport>(scope, { cutProjectId: projectId }) })
    ])
    const workspaceFolders = projectWorkspaceFolders(scope, project, media, exports)
    const deletedRows = await this.projects.manager.transaction(async (manager) => {
      const jobs = await manager.getRepository(CutAnalysisJob).find({
        where: scopedWhere<CutAnalysisJob>(scope, { cutProjectId: projectId })
      })
      if (jobs.some((job) => job.status === 'queued' || job.status === 'running')) {
        throw new ConflictException('Cancel active Cut tasks before permanently deleting this project.')
      }

      const counts: Record<string, number> = {}
      const deleteRows = async <T extends ScopedEntity>(name: string, entity: new () => T, where: Partial<T>) => {
        const result = await manager.getRepository(entity).delete(scopedWhere<T>(scope, where))
        counts[name] = result.affected ?? 0
      }

      await deleteRows('transcriptSegments', CutTranscriptSegment, { cutProjectId: projectId } as Partial<CutTranscriptSegment>)
      await deleteRows('captionDrafts', CutCaptionDraft, { cutProjectId: projectId } as Partial<CutCaptionDraft>)
      await deleteRows('transcripts', CutTranscript, { cutProjectId: projectId } as Partial<CutTranscript>)
      await deleteRows('mediaSegments', CutMediaSegment, { cutProjectId: projectId } as Partial<CutMediaSegment>)
      await deleteRows('editProposals', CutEditProposal, { cutProjectId: projectId } as Partial<CutEditProposal>)
      await deleteRows('exports', CutExport, { cutProjectId: projectId } as Partial<CutExport>)
      await deleteRows('analysisJobs', CutAnalysisJob, { cutProjectId: projectId } as Partial<CutAnalysisJob>)
      await deleteRows('versions', CutProjectVersion, { cutProjectId: projectId } as Partial<CutProjectVersion>)
      await deleteRows('media', CutMediaAsset, { cutProjectId: projectId } as Partial<CutMediaAsset>)
      await deleteRows('logs', CutActionLog, { cutProjectId: projectId } as Partial<CutActionLog>)
      const projectResult = await manager.getRepository(CutProject).delete(scopedWhere<CutProject>(scope, {
        id: projectId,
        revision: baseRevision
      }))
      if (projectResult.affected !== 1) {
        throw new ConflictException(`Cut project revision changed from ${baseRevision}; reload before deleting.`)
      }
      counts.projects = 1
      return counts
    })

    let workspaceFilesDeleted = true
    try {
      const workspaceFiles = this.workspaceFiles()
      for (const folder of workspaceFolders) await workspaceFiles.deleteFile(folder)
    } catch (error) {
      workspaceFilesDeleted = false
      console.warn(`Cut project ${projectId} was deleted, but its Workspace files could not be removed: ${errorMessage(error)}`)
    }
    return {
      success: true,
      deleted: true,
      projectId,
      deletedRows,
      workspaceFilesDeleted,
      ...(workspaceFilesDeleted ? {} : { warning: 'The project was deleted, but some Workspace files could not be removed automatically.' })
    }
  }

  async saveProject(scope: CutScope, input: SaveCutProjectInput) {
    const project = await this.requireProject(scope, input.projectId)
    assertRevision(project, input.baseRevision)
    const previousDocument = project.document
    const nextDocument = validateCutProjectDocument(restorePortableSources(input.document, project.document))
    const saved = await this.persistDocumentAtRevision(scope, project, input.baseRevision, nextDocument, true)
    await this.writeLog(scope, {
      cutProjectId: requireId(saved.id),
      action: 'cut_project_saved',
      actorType: actorType(scope),
      message: input.changeSummary ?? 'Saved Cut timeline.',
      snapshot: { revision: saved.revision, tracks: saved.document.tracks.length }
    })
    return {
      success: true,
      project: compactProject(saved),
      document: saved.document,
      changedClipIds: findChangedClipIds(previousDocument, saved.document),
      changedTrackIds: findChangedTrackIds(previousDocument, saved.document)
    }
  }

  async applyEdit(scope: CutScope, input: ApplyCutEditInput) {
    const project = await this.requireProject(scope, input.projectId)
    assertRevision(project, input.baseRevision)
    const previousDocument = project.document
    const nextDocument = applyCutEdit(project.document, input.operation)
    const saved = await this.persistDocumentAtRevision(scope, project, input.baseRevision, nextDocument)
    await this.writeLog(scope, {
      cutProjectId: requireId(saved.id),
      action: 'cut_edit_applied',
      actorType: actorType(scope),
      message: input.changeSummary ?? `Applied ${input.operation.kind} edit.`,
      snapshot: input.operation as CutJsonValue
    })
    return {
      success: true,
      project: compactProject(saved),
      document: saved.document,
      operation: input.operation,
      changedClipIds: findChangedClipIds(previousDocument, saved.document),
      changedTrackIds: findChangedTrackIds(previousDocument, saved.document)
    }
  }

  async applyEditBatch(scope: CutScope, input: ApplyCutEditBatchInput) {
    const project = await this.requireProject(scope, input.projectId)
    assertRevision(project, input.baseRevision)
    const previousDocument = project.document
    const nextDocument = input.operations.reduce(applyCutEdit, previousDocument)
    const changedClipIds = findChangedClipIds(previousDocument, nextDocument)
    const changedTrackIds = findChangedTrackIds(previousDocument, nextDocument)
    if ((input.mode ?? 'apply') === 'validate') {
      return {
        success: true,
        applied: false,
        project: compactProject(project),
        document: nextDocument,
        changedClipIds,
        changedTrackIds
      }
    }
    const saved = await this.persistDocumentAtRevision(scope, project, input.baseRevision, nextDocument)
    await this.writeLog(scope, {
      cutProjectId: requireId(saved.id),
      action: 'cut_edit_batch_applied',
      actorType: actorType(scope),
      message: input.changeSummary ?? `Applied ${input.operations.length} Cut edits.`,
      snapshot: { operationCount: input.operations.length, operations: input.operations } as unknown as CutJsonValue
    })
    return {
      success: true,
      applied: true,
      project: compactProject(saved),
      document: saved.document,
      changedClipIds,
      changedTrackIds
    }
  }

  async registerRuntimeMedia(
    scope: CutScope,
    projectId: string,
    file: WorkspaceRuntimeFileBuffer,
    duration: number | undefined,
    baseRevision: number,
    changeSummary: string
  ) {
    return this.registerMedia(scope, projectId, {
      buffer: file.buffer,
      name: file.name,
      mimeType: file.mimeType ?? 'application/octet-stream',
      size: file.size ?? file.buffer.byteLength,
      reference: file.reference,
      duration,
      baseRevision,
      changeSummary
    })
  }

  async uploadMedia(
    scope: CutScope,
    projectId: string,
    file: { buffer: Buffer; originalName?: string; mimeType?: string; size?: number },
    duration: number | undefined,
    baseRevision: number,
    changeSummary: string,
    browserMetadata: CutMediaMetadata = {}
  ) {
    const project = await this.requireProject(scope, projectId)
    assertRevision(project, baseRevision)
    const workspaceFiles = this.workspaceFiles()
    const target = workspaceTarget(scope, project)
    const uploaded = await workspaceFiles.uploadBuffer({
      ...target,
      buffer: file.buffer,
      originalName: file.originalName ?? 'cut-media',
      mimeType: file.mimeType ?? 'application/octet-stream',
      size: file.size ?? file.buffer.byteLength,
      folder: `files/cut/${projectId}/media`,
      metadata: { plugin: 'cut', cutProjectId: projectId }
    })
    return this.registerMedia(scope, projectId, {
      buffer: file.buffer,
      name: uploaded.name,
      mimeType: uploaded.mimeType ?? file.mimeType ?? 'application/octet-stream',
      size: uploaded.size ?? file.size ?? file.buffer.byteLength,
      reference: portableReference(uploaded, target),
      duration,
      mediaMetadata: browserMetadata,
      baseRevision,
      changeSummary
    })
  }

  async finalizeVersion(scope: CutScope, projectId: string, baseRevision: number, changeSummary: string) {
    const project = await this.requireProject(scope, projectId)
    assertRevision(project, baseRevision)
    const versionNumber = project.currentVersionNumber + 1
    const version = await this.versions.save(
      this.versions.create({
        ...scopedCreate(scope),
        cutProjectId: projectId,
        versionNumber,
        document: validateCutProjectDocument(project.document),
        revision: project.revision,
        changeSummary,
        createdById: scope.userId ?? null,
        assistantId: scope.assistantId ?? null
      })
    )
    project.currentVersionNumber = versionNumber
    project.currentVersionId = version.id ?? null
    await this.projects.save(project)
    await this.writeLog(scope, {
      cutProjectId: projectId,
      action: 'cut_version_finalized',
      actorType: actorType(scope),
      message: changeSummary,
      snapshot: { versionId: version.id ?? null, versionNumber, revision: project.revision }
    })
    return { success: true, project: compactProject(project), version: compactVersion(version) }
  }

  async saveExport(
    scope: CutScope,
    projectId: string,
    file: { buffer: Buffer; originalName?: string; mimeType?: string; size?: number },
    changeSummary: string
  ) {
    const project = await this.requireProject(scope, projectId)
    const kind = browserExportKind(file.mimeType, file.originalName)
    const profile = cutExportProfile(normalizeCutExportSettings({ format: kind }))
    const originalName = file.originalName?.toLowerCase().endsWith(`.${profile.extension}`)
      ? file.originalName
      : `${safeName(project.title)}.${profile.extension}`
    const target = workspaceTarget(scope, project)
    const uploaded = await this.workspaceFiles().uploadBuffer({
      ...target,
      buffer: file.buffer,
      originalName,
      mimeType: profile.mimeType,
      size: file.size ?? file.buffer.byteLength,
      folder: `files/cut/${projectId}/exports`,
      metadata: { plugin: 'cut', cutProjectId: projectId, kind }
    })
    const record = await this.exports.save(
      this.exports.create({
        ...scopedCreate(scope),
        cutProjectId: projectId,
        kind,
        mimeType: uploaded.mimeType ?? profile.mimeType,
        size: uploaded.size ?? file.buffer.byteLength,
        checksum: sha256(file.buffer),
        fileReference: portableReference(uploaded, target),
        fileUrl: uploaded.fileUrl ?? uploaded.url ?? null,
        changeSummary
      })
    )
    await this.writeLog(scope, {
      cutProjectId: projectId,
      action: 'cut_export_saved',
      actorType: actorType(scope),
      message: changeSummary,
      snapshot: { exportId: record.id ?? null, size: record.size, mimeType: record.mimeType }
    })
    return { success: true, export: compactExport(record) }
  }

  async reportFailure(scope: CutScope, input: { projectId?: string; operation: string; errorMessage: string; recoverable?: boolean }) {
    if (input.projectId) {
      const project = await this.requireProject(scope, input.projectId)
      project.failureReason = input.errorMessage
      await this.projects.save(project)
    }
    await this.writeLog(scope, {
      cutProjectId: input.projectId,
      action: 'cut_failure_reported',
      actorType: actorType(scope),
      message: `Cut ${input.operation} failed.`,
      errorMessage: input.errorMessage,
      snapshot: { recoverable: input.recoverable ?? false }
    })
    return { success: true, projectId: input.projectId ?? null, recorded: true }
  }

  async resolveMediaFile(scope: CutScope, projectId: string, mediaAssetId: string) {
    const project = await this.requireProject(scope, projectId)
    if ((scope.assistantId && project.assistantId !== scope.assistantId)
      || (scope.projectId && project.platformProjectId !== scope.projectId)) {
      throw new NotFoundException('Cut media was not found in the current host project.')
    }
    const asset = await this.media.findOne({
      where: scopedWhere<CutMediaAsset>(scope, { id: mediaAssetId, cutProjectId: projectId })
    })
    if (!asset || !['video/', 'audio/', 'image/'].some((prefix) => asset.mimeType.startsWith(prefix))) {
      throw new NotFoundException('Cut media was not found in the current project.')
    }
    return {
      reference: asset.fileReference,
      fileName: normalizeCutFileName(asset.originalName, 'cut-media'),
      mimeType: asset.mimeType,
      size: asset.size
    }
  }

  async resolveExportFile(scope: CutScope, projectId: string, exportId: string) {
    const project = await this.requireProject(scope, projectId)
    if ((scope.assistantId && project.assistantId !== scope.assistantId)
      || (scope.projectId && project.platformProjectId !== scope.projectId)) {
      throw new NotFoundException('Cut export was not found in the current host project.')
    }
    const record = await this.exports.findOne({
      where: scopedWhere<CutExport>(scope, { id: exportId, cutProjectId: projectId })
    })
    if (!record || !['video/mp4', 'video/webm'].includes(record.mimeType)) {
      throw new NotFoundException('Cut export was not found in the current project.')
    }
    const fileName = record.fileReference.originalName ?? record.fileReference.name ?? `${safeName(project.title)}.${record.kind}`
    return { reference: record.fileReference, fileName, mimeType: record.mimeType, size: record.size }
  }

  private async registerMedia(
    scope: CutScope,
    projectId: string,
    input: {
      buffer: Buffer
      name: string
      mimeType: string
      size: number
      reference: WorkspacePortableFileReference
      duration?: number
      mediaMetadata?: CutMediaMetadata
      baseRevision: number
      changeSummary: string
    }
  ) {
    const project = await this.requireProject(scope, projectId)
    assertRevision(project, input.baseRevision)
    const reference = await this.workspaceFiles().resolveRuntimeReference({
      ...input.reference,
      tenantId: input.reference.tenantId ?? scope.tenantId,
      userId: input.reference.userId ?? scope.userId ?? null
    })
    if (reference.tenantId !== scope.tenantId) {
      throw new BadRequestException('Cut media reference belongs to another tenant.')
    }
    const previousDocument = project.document
    const checksum = sha256(input.buffer)
    const probedMetadata = await probeCutMediaMetadata(input.buffer, input.mimeType)
    const mediaMetadata = compactMediaMetadata({
      ...probedMetadata,
      ...input.mediaMetadata,
      ...(input.duration !== undefined ? { duration: input.duration } : {})
    })
    let asset = await this.media.findOne({ where: scopedWhere<CutMediaAsset>(scope, { cutProjectId: projectId, checksum }) })
    if (!asset) {
      asset = await this.media.save(
        this.media.create({
          ...scopedCreate(scope),
          cutProjectId: projectId,
          originalName: input.name,
          mimeType: input.mimeType,
          size: input.size,
          checksum,
          fileReference: reference,
          previewUrl: null,
          duration: mediaMetadata.duration ?? null,
          containerDuration: mediaMetadata.containerDuration ?? null,
          videoDuration: mediaMetadata.videoDuration ?? null,
          audioDuration: mediaMetadata.audioDuration ?? null,
          codedWidth: mediaMetadata.codedWidth ?? null,
          codedHeight: mediaMetadata.codedHeight ?? null,
          displayWidth: mediaMetadata.displayWidth ?? null,
          displayHeight: mediaMetadata.displayHeight ?? null,
          rotationDegrees: mediaMetadata.rotationDegrees ?? null
        })
      )
      const clipType = clipTypeFromMime(input.mimeType)
      const nextDocument = appendCutMediaClip(project.document, {
        id: randomUUID(),
        name: input.name,
        type: clipType,
        mediaAssetId: requireId(asset.id),
        source: reference,
        duration: mediaMetadata.duration ?? undefined
      })
      await this.persistDocumentAtRevision(scope, project, input.baseRevision, nextDocument)
    } else {
      const referenceChanged = JSON.stringify(asset.fileReference) !== JSON.stringify(reference)
      if (referenceChanged || hasNewMediaMetadata(asset, mediaMetadata)) {
        asset = await this.media.save({
          ...asset,
          originalName: input.name,
          mimeType: input.mimeType,
          size: input.size,
          fileReference: reference,
          ...mediaMetadata
        })
      }
    }
    await this.writeLog(scope, {
      cutProjectId: projectId,
      action: 'cut_media_imported',
      actorType: actorType(scope),
      message: input.changeSummary,
      snapshot: { mediaAssetId: asset.id ?? null, mimeType: asset.mimeType, size: asset.size }
    })
    return {
      success: true,
      project: compactProject(project),
      document: project.document,
      media: compactMedia(asset),
      changedClipIds: findChangedClipIds(previousDocument, project.document),
      changedTrackIds: findChangedTrackIds(previousDocument, project.document)
    }
  }

  private async requireProject(scope: CutScope, projectId: string) {
    const project = await this.projects.findOne({ where: scopedWhere<CutProject>(scope, { id: projectId }) })
    if (!project) throw new NotFoundException('Cut project was not found in the current tenant and organization.')
    return project
  }

  private async persistDocumentAtRevision(
    scope: CutScope,
    project: CutProject,
    baseRevision: number,
    document: CutProjectDocument,
    clearFailureReason = false
  ) {
    const projectId = requireId(project.id)
    const nextRevision = baseRevision + 1
    const result = await this.projects.update(
      scopedWhere<CutProject>(scope, { id: projectId, revision: baseRevision }),
      {
        document: stripWorkspacePreviewUrls(document),
        revision: nextRevision,
        ...(clearFailureReason ? { failureReason: null } : {})
      }
    )
    if (result.affected !== 1) {
      throw new ConflictException(`Cut project revision changed from ${baseRevision}; reload before saving.`)
    }
    project.document = stripWorkspacePreviewUrls(document)
    project.revision = nextRevision
    if (clearFailureReason) project.failureReason = null
    return project
  }

  private workspaceFiles() {
    const files = this.runtimeCapabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!files) throw new BadRequestException('Workspace Files capability is required for Cut media and exports.')
    return files
  }

  private async writeLog(
    scope: CutScope,
    input: {
      cutProjectId?: string
      action: CutActionType
      actorType: CutActorType
      message: string
      errorMessage?: string
      snapshot?: CutJsonValue
    }
  ) {
    await this.logs.save(
      this.logs.create({
        ...scopedCreate(scope),
        cutProjectId: input.cutProjectId ?? null,
        action: input.action,
        actorType: input.actorType,
        actorId: scope.userId ?? scope.assistantId ?? null,
        message: input.message,
        errorMessage: input.errorMessage ?? null,
        snapshot: input.snapshot ?? null
      })
    )
  }
}

function scopedCreate(scope: CutScope): ScopedEntity {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null,
    platformProjectId: scope.projectId ?? null
  }
}

function scopedWhere<T extends ScopedEntity>(scope: CutScope, where: Partial<T>): FindOptionsWhere<T> {
  return {
    ...where,
    tenantId: scope.tenantId,
    organizationId: (scope.organizationId ?? null) as T['organizationId']
  } as FindOptionsWhere<T>
}

function workspaceTarget(scope: CutScope, project: CutProject) {
  if (scope.projectId) return { tenantId: scope.tenantId, userId: scope.userId, catalog: 'projects' as const, scopeId: scope.projectId, projectId: scope.projectId }
  const scopeId = scope.assistantId ?? project.assistantId ?? requireId(project.id)
  return { tenantId: scope.tenantId, userId: scope.userId, catalog: 'xperts' as const, scopeId, xpertId: scope.assistantId ?? project.assistantId ?? null }
}

function portableReference(file: WorkspaceFile, target: ReturnType<typeof workspaceTarget>): WorkspacePortableFileReference {
  return {
    source: WORKSPACE_FILES_SOURCE,
    filePath: file.filePath,
    workspacePath: file.workspacePath,
    tenantId: target.tenantId,
    userId: target.userId ?? null,
    catalog: file.catalog,
    scopeId: file.scopeId ?? target.scopeId,
    projectId: target.catalog === 'projects' ? target.scopeId : null,
    xpertId: target.catalog === 'xperts' ? target.scopeId : null,
    originalName: file.name,
    name: file.name,
    mimeType: file.mimeType ?? null,
    size: file.size ?? null
  }
}

function projectWorkspaceFolders(
  scope: CutScope,
  project: CutProject,
  media: CutMediaAsset[],
  exports: CutExport[]
): WorkspaceFileReference[] {
  const filePath = `files/cut/${requireId(project.id)}`
  const fallback: WorkspaceFileReference = { ...workspaceTarget(scope, project), filePath }
  const candidates: WorkspaceFileReference[] = [
    fallback,
    ...media.map((asset) => ({ ...asset.fileReference, filePath })),
    ...exports.map((record) => ({ ...record.fileReference, filePath }))
  ]
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    const key = JSON.stringify([
      candidate.tenantId ?? null,
      candidate.userId ?? null,
      candidate.catalog ?? null,
      candidate.scopeId ?? null,
      candidate.projectId ?? null,
      candidate.xpertId ?? null,
      candidate.isolateByUser ?? null,
      candidate.filePath
    ])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function assertRevision(project: CutProject, baseRevision: number | undefined) {
  if (baseRevision === undefined) throw new BadRequestException('Cut baseRevision is required for project mutations.')
  if (baseRevision !== project.revision) {
    throw new ConflictException(`Cut project revision changed from ${baseRevision} to ${project.revision}; reload before saving.`)
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function compactProject(project: CutProject) {
  return {
    id: project.id,
    title: project.title,
    brief: project.brief ?? null,
    status: project.status,
    revision: project.revision,
    currentVersionId: project.currentVersionId ?? null,
    currentVersionNumber: project.currentVersionNumber,
    failureReason: project.failureReason ?? null,
    createdAt: project.createdAt?.toISOString?.() ?? null,
    updatedAt: project.updatedAt?.toISOString?.() ?? null
  }
}

function compactMedia(asset: CutMediaAsset) {
  return {
    id: asset.id,
    originalName: normalizeCutFileName(asset.originalName, 'cut-media'),
    mimeType: asset.mimeType,
    size: asset.size,
    checksum: asset.checksum,
    fileReference: asset.fileReference,
    previewUrl: asset.previewUrl ?? null,
    duration: asset.duration ?? null,
    containerDuration: asset.containerDuration ?? null,
    videoDuration: asset.videoDuration ?? null,
    audioDuration: asset.audioDuration ?? null,
    codedWidth: asset.codedWidth ?? null,
    codedHeight: asset.codedHeight ?? null,
    displayWidth: asset.displayWidth ?? null,
    displayHeight: asset.displayHeight ?? null,
    rotationDegrees: asset.rotationDegrees ?? null
  }
}

function compactMediaMetadata(metadata: CutMediaMetadata): CutMediaMetadata {
  const positiveInteger = (value: number | null | undefined) => Number.isInteger(value) && value! > 0 ? value : undefined
  const rotation = metadata.rotationDegrees
  return {
    ...(typeof metadata.duration === 'number' && Number.isFinite(metadata.duration) && metadata.duration > 0 ? { duration: metadata.duration } : {}),
    ...(typeof metadata.containerDuration === 'number' && Number.isFinite(metadata.containerDuration) && metadata.containerDuration > 0 ? { containerDuration: metadata.containerDuration } : {}),
    ...(typeof metadata.videoDuration === 'number' && Number.isFinite(metadata.videoDuration) && metadata.videoDuration > 0 ? { videoDuration: metadata.videoDuration } : {}),
    ...(typeof metadata.audioDuration === 'number' && Number.isFinite(metadata.audioDuration) && metadata.audioDuration > 0 ? { audioDuration: metadata.audioDuration } : {}),
    ...(positiveInteger(metadata.codedWidth) ? { codedWidth: metadata.codedWidth } : {}),
    ...(positiveInteger(metadata.codedHeight) ? { codedHeight: metadata.codedHeight } : {}),
    ...(positiveInteger(metadata.displayWidth) ? { displayWidth: metadata.displayWidth } : {}),
    ...(positiveInteger(metadata.displayHeight) ? { displayHeight: metadata.displayHeight } : {}),
    ...(typeof rotation === 'number' && [0, 90, 180, 270].includes(rotation) ? { rotationDegrees: rotation } : {})
  }
}

function hasNewMediaMetadata(asset: CutMediaAsset, metadata: CutMediaMetadata) {
  return (['duration', 'containerDuration', 'videoDuration', 'audioDuration', 'codedWidth', 'codedHeight', 'displayWidth', 'displayHeight', 'rotationDegrees'] as const)
    .some((key) => metadata[key] != null && asset[key] !== metadata[key])
}

function compactVersion(version: CutProjectVersion) {
  return { id: version.id, versionNumber: version.versionNumber, revision: version.revision, changeSummary: version.changeSummary, createdAt: version.createdAt?.toISOString?.() ?? null }
}

function compactExport(record: CutExport) {
  return {
    id: record.id,
    kind: record.kind,
    fileName: record.fileReference.originalName ?? record.fileReference.name ?? `cut-export.${record.kind}`,
    mimeType: record.mimeType,
    size: record.size,
    checksum: record.checksum,
    fileReference: record.fileReference,
    fileUrl: record.fileUrl ?? null,
    changeSummary: record.changeSummary,
    analysisJobId: record.analysisJobId ?? null,
    sourceRevision: record.sourceRevision ?? null,
    renderer: record.renderer ?? null,
    report: record.report ?? null,
    createdAt: record.createdAt?.toISOString?.() ?? null
  }
}

function browserExportKind(mimeType?: string, originalName?: string): CutExportFormat {
  const normalizedMimeType = mimeType?.split(';', 1)[0]?.trim().toLowerCase()
  const normalizedName = originalName?.trim().toLowerCase()
  if (normalizedMimeType === 'video/webm' || normalizedName?.endsWith('.webm')) return 'webm'
  if (normalizedMimeType === 'video/mp4' || normalizedName?.endsWith('.mp4')) return 'mp4'
  throw new BadRequestException('Cut browser export must be an MP4 or WebM video.')
}

function compactLog(log: CutActionLog) {
  return { id: log.id, action: log.action, actorType: log.actorType, message: log.message, errorMessage: log.errorMessage ?? null, snapshot: log.snapshot ?? null, createdAt: log.createdAt?.toISOString?.() ?? null }
}

function clipTypeFromMime(mimeType: string): CutClipType {
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('image/')) return 'image'
  throw new BadRequestException(`Unsupported Cut media type: ${mimeType}`)
}

function actorType(scope: CutScope): CutActorType {
  return scope.assistantId ? 'agent' : scope.userId ? 'user' : 'system'
}

function normalizeRequired(value: string | null | undefined, message: string) {
  const normalized = normalizeOptional(value)
  if (!normalized) throw new BadRequestException(message)
  return normalized
}

function normalizeOptional(value: string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function requireId(id: string | undefined) {
  if (!id) throw new Error('Cut persistence did not return an id.')
  return id
}

function sha256(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function safeName(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'cut-export'
}

function restorePortableSources(incoming: CutProject['document'], persisted: CutProject['document']) {
  const sourceByClip = new Map(
    persisted.tracks.flatMap((track) => track.clips).filter((clip) => clip.source).map((clip) => [clip.id, clip.source] as const)
  )
  return {
    ...incoming,
    tracks: incoming.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => ({ ...clip, source: clip.source ?? sourceByClip.get(clip.id) }))
    }))
  }
}

function stripWorkspacePreviewUrls(document: CutProjectDocument): CutProjectDocument {
  return {
    ...document,
    tracks: document.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        if (!clip.mediaAssetId && clip.source?.source !== WORKSPACE_FILES_SOURCE) return clip
        const { previewUrl: _previewUrl, ...persisted } = clip
        return persisted
      })
    }))
  }
}

function findChangedClipIds(previous: CutProject['document'], next: CutProject['document']) {
  const previousById = new Map(previous.tracks.flatMap((track) => track.clips).map((clip) => [clip.id, clip] as const))
  const nextById = new Map(next.tracks.flatMap((track) => track.clips).map((clip) => [clip.id, clip] as const))
  const ids = new Set([...previousById.keys(), ...nextById.keys()])
  return [...ids].filter((id) => JSON.stringify(previousById.get(id)) !== JSON.stringify(nextById.get(id)))
}

function findChangedTrackIds(previous: CutProject['document'], next: CutProject['document']) {
  const previousById = new Map(previous.tracks.map((track) => [track.id, track] as const))
  const nextById = new Map(next.tracks.map((track) => [track.id, track] as const))
  const ids = new Set([...previousById.keys(), ...nextById.keys()])
  return [...ids].filter((id) => JSON.stringify(previousById.get(id)) !== JSON.stringify(nextById.get(id)))
}
