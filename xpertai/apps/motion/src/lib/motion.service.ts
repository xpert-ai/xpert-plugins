import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { Repository } from 'typeorm'
import type { FindOptionsWhere } from 'typeorm'
import { XPERT_RUNTIME_CAPABILITIES_TOKEN } from '@xpert-ai/plugin-sdk'
import type { AgentMiddlewareRuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { MotionActionLog, MotionExport, MotionProject, MotionProjectVersion, MotionStyle } from './entities/index.js'
import {
  MOTION_WORKSPACE_FILES_RUNTIME_CAPABILITY,
  type CreateMotionProjectInput,
  type ExportMotionArtifactInput,
  type FinalizeMotionVersionInput,
  type GetMotionProjectInput,
  type MotionActionType,
  type MotionActorType,
  type MotionExportKind,
  type MotionJsonObject,
  type MotionJsonValue,
  type MotionProjectStatus,
  type MotionScope,
  type MotionSearchRecipesInput,
  type MotionSurface,
  type MotionVersionSource,
  type MotionVideoComposition,
  type MotionWorkspaceFileRecord,
  type MotionWorkspaceFilesApi,
  type MotionWorkspaceFileScope,
  type ReportMotionFailureInput,
  type SaveMotionMediaFileInput,
  type SaveMotionStyleInput,
  type SaveMotionVideoCompositionInput,
  type SaveMotionWebArtifactInput,
  type SearchMotionProjectsInput,
  type UpdateMotionProjectStatusInput
} from './types.js'
import { compactJson, normalizeJsonObject, normalizeStringArray, stableJson } from './json-utils.js'
import { exportTextArtifact, injectMotionRuntime, validateHtmlArtifact } from './html-motion.js'
import { createStarterVideoComposition, validateVideoComposition } from './video-composition.js'
import {
  getMotionRecipeDetail,
  loadDesignSystemsCount,
  loadMotionRecipes,
  readJsonDataFile,
  readMotionSpec,
  searchMotionRecipes
} from './recipe-library.js'

type ScopedEntity = {
  tenantId?: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
}

type UploadArtifactInput = {
  project: MotionProject
  kind: MotionExportKind
  buffer: Buffer
  originalName: string
  mimeType: string
  versionId?: string | null
  changeSummary?: string | null
}

@Injectable()
export class MotionService {
  constructor(
    @InjectRepository(MotionProject)
    private readonly projectRepository: Repository<MotionProject>,
    @InjectRepository(MotionProjectVersion)
    private readonly versionRepository: Repository<MotionProjectVersion>,
    @InjectRepository(MotionStyle)
    private readonly styleRepository: Repository<MotionStyle>,
    @InjectRepository(MotionExport)
    private readonly exportRepository: Repository<MotionExport>,
    @InjectRepository(MotionActionLog)
    private readonly logRepository: Repository<MotionActionLog>,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: AgentMiddlewareRuntimeCapabilityRegistry
  ) {}

  getLibraryStats() {
    const htmlTemplates = readJsonDataFile('html-templates.json')
    const videoTemplates = readJsonDataFile('video-templates.json')
    const iconCatalog = readJsonDataFile('reicon-icons.json')
    const icons =
      iconCatalog.categories && typeof iconCatalog.categories === 'object'
        ? Object.values(iconCatalog.categories).reduce((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0)
        : 0
    return {
      recipes: loadMotionRecipes().length,
      designSystems: loadDesignSystemsCount(),
      htmlTemplates: Array.isArray(htmlTemplates.templates) ? htmlTemplates.templates.length : 0,
      videoTemplates: Array.isArray(videoTemplates.templates) ? videoTemplates.templates.length : 0,
      icons,
      specPreview: readMotionSpec().slice(0, 1200)
    }
  }

  searchRecipes(input: MotionSearchRecipesInput) {
    return searchMotionRecipes(input)
  }

  getRecipe(recipeId: string) {
    return getMotionRecipeDetail(recipeId)
  }

  async searchProjects(scope: MotionScope, input: SearchMotionProjectsInput) {
    const page = Math.max(1, Math.floor(input.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(input.pageSize ?? 20)))
    const all = await this.projectRepository.find({
      where: scopedWhere<MotionProject>(scope, {
        ...(input.status ? { status: input.status } : {}),
        ...(input.surface ? { surface: input.surface } : {})
      }),
      order: { updatedAt: 'DESC' }
    })
    const search = normalizeOptional(input.search)?.toLowerCase()
    const filtered = search
      ? all.filter((item) => `${item.title ?? ''} ${item.brief ?? ''}`.toLowerCase().includes(search))
      : all
    const start = (page - 1) * pageSize
    return {
      items: filtered.slice(start, start + pageSize).map(compactProject),
      total: filtered.length,
      page,
      pageSize
    }
  }

  async createProject(scope: MotionScope, input: CreateMotionProjectInput) {
    const title = normalizeRequired(input.title, 'Motion project title is required.')
    const surface = normalizeSurface(input.surface)
    const html = input.html ? injectMotionRuntime(input.html) : surface === 'web' ? starterHtml(title, input.brief) : null
    const videoComposition =
      input.videoComposition !== undefined && input.videoComposition !== null
        ? validateVideoComposition(input.videoComposition)
        : surface === 'video'
          ? createStarterVideoComposition(title)
          : null
    const project = await this.projectRepository.save(
      this.projectRepository.create({
        ...scopedCreate(scope),
        createdById: scope.userId ?? null,
        assistantId: scope.assistantId ?? null,
        conversationId: scope.conversationId ?? null,
        title,
        brief: normalizeOptional(input.brief),
        surface,
        status: 'draft',
        designSystemId: normalizeOptional(input.designSystemId),
        motionProfile: normalizeOptional(input.motionProfile),
        selectedRecipeIds: normalizeStringArray(input.selectedRecipeIds ?? []),
        workingHtml: html,
        videoComposition,
        currentVersionNumber: 0,
        workingCopyRevision: 1,
        artifactChecksum: checksumArtifact(surface, html, videoComposition),
        lastEditedById: scope.userId ?? null,
        lastEditedAt: new Date()
      })
    )

    await this.writeLog(scope, {
      motionProjectId: project.id,
      action: 'project_created',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: input.changeSummary ?? `Motion project "${title}" was created.`,
      snapshot: { title, surface, selectedRecipeIds: project.selectedRecipeIds }
    })

    return this.getProject(scope, { projectId: requireId(project.id), includeLogs: true })
  }

  async getProject(scope: MotionScope, input: GetMotionProjectInput) {
    const project = await this.requireProject(scope, input.projectId)
    const versions = await this.versionRepository.find({
      where: scopedWhere<MotionProjectVersion>(scope, { motionProjectId: project.id }),
      order: { versionNumber: 'DESC' },
      take: Math.min(100, Math.max(1, input.versionLimit ?? 30))
    })
    const exports = await this.exportRepository.find({
      where: scopedWhere<MotionExport>(scope, { motionProjectId: project.id }),
      order: { createdAt: 'DESC' },
      take: 30
    })
    const logs = input.includeLogs
      ? await this.logRepository.find({
          where: scopedWhere<MotionActionLog>(scope, { motionProjectId: project.id }),
          order: { createdAt: 'DESC' },
          take: Math.min(100, Math.max(1, input.logLimit ?? 30))
        })
      : []
    return {
      item: compactProject(project),
      workingCopy: {
        html: project.workingHtml ?? null,
        videoComposition: project.videoComposition ?? null,
        componentSelection: project.componentSelection ?? null,
        layerSelection: project.layerSelection ?? null,
        workingCopyRevision: project.workingCopyRevision ?? 0,
        artifactChecksum: project.artifactChecksum ?? null
      },
      currentVersion: versions.find((version) => version.id === project.currentVersionId) ?? versions[0] ?? null,
      versions: versions.map(compactVersion),
      exports: exports.map(compactExport),
      logs: logs.map(compactLog)
    }
  }

  async saveWebArtifact(scope: MotionScope, input: SaveMotionWebArtifactInput) {
    const project = await this.requireProject(scope, input.projectId)
    const html = injectMotionRuntime(input.html)
    project.surface = 'web'
    project.workingHtml = html
    project.videoComposition = null
    project.selectedRecipeIds = normalizeStringArray(input.selectedRecipeIds ?? project.selectedRecipeIds ?? [])
    project.componentSelection = normalizeJsonObject(input.componentSelection)
    project.workingCopyRevision = (project.workingCopyRevision ?? 0) + 1
    project.artifactChecksum = checksumArtifact('web', html, null)
    project.lastEditedById = scope.userId ?? null
    project.lastEditedAt = new Date()
    const saved = await this.projectRepository.save(project)
    await this.writeLog(scope, {
      motionProjectId: saved.id,
      action: 'web_artifact_saved',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: input.changeSummary ?? 'Motion HTML artifact was saved.',
      snapshot: { selectedRecipeIds: saved.selectedRecipeIds, bytes: Buffer.byteLength(html) }
    })
    return {
      success: true,
      message: 'Motion HTML artifact was saved.',
      project: compactProject(saved)
    }
  }

  async saveVideoComposition(scope: MotionScope, input: SaveMotionVideoCompositionInput) {
    const project = await this.requireProject(scope, input.projectId)
    const composition = validateVideoComposition(input.composition)
    project.surface = 'video'
    project.workingHtml = null
    project.videoComposition = composition
    project.selectedRecipeIds = normalizeStringArray(input.selectedRecipeIds ?? project.selectedRecipeIds ?? [])
    project.layerSelection = normalizeJsonObject(input.layerSelection)
    project.workingCopyRevision = (project.workingCopyRevision ?? 0) + 1
    project.artifactChecksum = checksumArtifact('video', null, composition)
    project.lastEditedById = scope.userId ?? null
    project.lastEditedAt = new Date()
    const saved = await this.projectRepository.save(project)
    await this.writeLog(scope, {
      motionProjectId: saved.id,
      action: 'video_composition_saved',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: input.changeSummary ?? 'Motion video composition was saved.',
      snapshot: { selectedRecipeIds: saved.selectedRecipeIds, size: JSON.stringify(composition).length }
    })
    return {
      success: true,
      message: 'Motion video composition was saved.',
      project: compactProject(saved)
    }
  }

  async finalizeVersion(scope: MotionScope, input: FinalizeMotionVersionInput) {
    const project = await this.requireProject(scope, input.projectId)
    if (project.surface === 'web') {
      validateHtmlArtifact(project.workingHtml ?? '')
    } else {
      validateVideoComposition(project.videoComposition)
    }
    const versionNumber = (project.currentVersionNumber ?? 0) + 1
    const version = await this.versionRepository.save(
      this.versionRepository.create({
        ...scopedCreate(scope),
        projectId: scope.projectId ?? project.projectId ?? null,
        motionProjectId: requireId(project.id),
        versionNumber,
        sourceType: input.sourceType ?? inferVersionSource(scope, project.surface),
        surface: project.surface ?? 'web',
        html: project.workingHtml ?? null,
        videoComposition: project.videoComposition ?? null,
        selectedRecipeIds: normalizeStringArray(project.selectedRecipeIds ?? []),
        selectionSummary: project.surface === 'web' ? project.componentSelection ?? null : project.layerSelection ?? null,
        artifactChecksum: project.artifactChecksum ?? checksumArtifact(project.surface ?? 'web', project.workingHtml, project.videoComposition),
        changeSummary: normalizeOptional(input.changeSummary) ?? `Motion version ${versionNumber}`,
        workspaceCatalog: project.workspaceCatalog,
        workspaceScopeId: project.workspaceScopeId,
        createdById: scope.userId ?? null,
        assistantId: scope.assistantId ?? null,
        conversationId: scope.conversationId ?? null
      })
    )
    project.currentVersionId = version.id
    project.currentVersionNumber = versionNumber
    project.lastEditedById = scope.userId ?? null
    project.lastEditedAt = new Date()
    await this.projectRepository.save(project)
    await this.writeLog(scope, {
      motionProjectId: project.id,
      versionId: version.id,
      action: 'version_finalized',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: input.changeSummary ?? `Motion version ${versionNumber} was saved.`,
      snapshot: compactJson({ surface: project.surface, selectedRecipeIds: project.selectedRecipeIds })
    })
    return {
      success: true,
      message: 'Motion version was finalized.',
      project: compactProject(project),
      version: compactVersion(version)
    }
  }

  async restoreVersion(scope: MotionScope, projectId: string, versionId: string, changeSummary?: string | null) {
    const project = await this.requireProject(scope, projectId)
    const version = await this.versionRepository.findOne({
      where: scopedWhere<MotionProjectVersion>(scope, { motionProjectId: project.id, id: versionId })
    })
    if (!version) {
      throw new NotFoundException('Motion version was not found.')
    }
    project.surface = version.surface ?? project.surface
    project.workingHtml = version.html ?? null
    project.videoComposition = version.videoComposition ?? null
    project.selectedRecipeIds = normalizeStringArray(version.selectedRecipeIds ?? [])
    project.currentVersionId = version.id
    project.currentVersionNumber = version.versionNumber
    project.workingCopyRevision = (project.workingCopyRevision ?? 0) + 1
    project.artifactChecksum = version.artifactChecksum
    project.lastEditedById = scope.userId ?? null
    project.lastEditedAt = new Date()
    const saved = await this.projectRepository.save(project)
    await this.writeLog(scope, {
      motionProjectId: saved.id,
      versionId: version.id,
      action: 'version_restored',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: changeSummary ?? `Restored version ${version.versionNumber}`,
      snapshot: { restoredVersionId: version.id, restoredVersionNumber: version.versionNumber }
    })
    return {
      success: true,
      message: 'Motion version was restored.',
      project: compactProject(saved),
      version: compactVersion(version)
    }
  }

  async exportArtifact(scope: MotionScope, input: ExportMotionArtifactInput) {
    const project = await this.requireProject(scope, input.projectId)
    const kind = normalizeExportKind(input.kind)
    if (kind === 'mp4' || kind === 'gif') {
      return {
        success: true,
        message: 'Use the Motion Workbench browser exporter for MP4/GIF, then save the generated file through save_export_file.',
        project: compactProject(project),
        exportKind: kind,
        requiresBrowserExport: true
      }
    }
    const content =
      input.content ??
      exportTextArtifact({
        kind,
        title: project.title,
        html: project.workingHtml,
        videoComposition: project.videoComposition ?? null
      }).content
    const exported = exportTextArtifact({
      kind,
      title: project.title,
      html: kind === 'html' ? content : project.workingHtml,
      videoComposition: project.videoComposition ?? null
    })
    const fileName = sanitizeFileName(input.fileName ?? `${project.title}.${exported.extension}`)
    const result = await this.saveExportBuffer(scope, {
      project,
      kind,
      buffer: Buffer.from(kind === 'html' && input.content ? injectMotionRuntime(input.content) : exported.content, 'utf8'),
      originalName: fileName,
      mimeType: input.mimeType ?? exported.mimeType,
      versionId: normalizeOptional(input.versionId),
      changeSummary: input.changeSummary
    })
    return {
      success: true,
      message: 'Motion artifact was exported.',
      project: compactProject(project),
      export: compactExport(result.export),
      content: result.workspaceStored ? undefined : exported.content
    }
  }

  async saveGeneratedExportFile(
    scope: MotionScope,
    projectId: string,
    kind: MotionExportKind,
    file: { buffer: Buffer; originalname?: string; mimetype?: string; size?: number },
    changeSummary?: string | null
  ) {
    const project = await this.requireProject(scope, projectId)
    const result = await this.saveExportBuffer(scope, {
      project,
      kind,
      buffer: file.buffer,
      originalName: sanitizeFileName(file.originalname ?? `${project.title}.${kind}`),
      mimeType: file.mimetype ?? mimeTypeForKind(kind),
      changeSummary
    })
    return {
      success: true,
      message: 'Motion generated export file was saved.',
      project: compactProject(project),
      export: compactExport(result.export)
    }
  }

  async saveMediaFile(scope: MotionScope, input: SaveMotionMediaFileInput) {
    const project = await this.requireProject(scope, input.projectId)
    const workspaceFiles = this.runtimeCapabilities?.get<MotionWorkspaceFilesApi>(MOTION_WORKSPACE_FILES_RUNTIME_CAPABILITY)
    if (!workspaceFiles) {
      throw new BadRequestException('Motion media upload requires platform workspace file storage.')
    }
    const originalName = sanitizeFileName(input.originalName || `motion-media-${randomUUID()}`)
    const mimeType = normalizeOptional(input.mimeType ?? undefined) ?? inferMimeTypeFromName(originalName)
    if (!isAllowedMotionMediaMime(mimeType)) {
      throw new BadRequestException('Unsupported Motion media type.')
    }
    if (!input.buffer?.length) {
      throw new BadRequestException('Motion media file is empty.')
    }
    if (input.buffer.length > 250 * 1024 * 1024) {
      throw new BadRequestException('Motion media file is too large.')
    }
    const checksum = sha256(input.buffer)
    const workspaceFile = await workspaceFiles.uploadBuffer({
      ...resolveProjectWorkspaceScope(scope, project),
      buffer: input.buffer,
      originalName,
      mimeType,
      size: input.size ?? input.buffer.length,
      folder: buildMotionMediaFolder(requireId(project.id)),
      fileName: originalName,
      metadata: {
        plugin: 'motion',
        purpose: input.purpose ?? 'layer',
        motionProjectId: project.id,
        checksum
      }
    })
    project.workspaceCatalog = workspaceFile.catalog ?? project.workspaceCatalog
    project.workspaceScopeId = workspaceFile.scopeId ?? project.workspaceScopeId
    await this.projectRepository.save(project)
    await this.writeLog(scope, {
      motionProjectId: project.id,
      action: 'media_uploaded',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: `Uploaded Motion media ${originalName}.`,
      snapshot: {
        purpose: input.purpose ?? 'layer',
        filePath: workspaceFile.filePath,
        mimeType,
        size: input.buffer.length,
        checksum
      }
    })
    return {
      success: true,
      message: 'Motion media file was uploaded.',
      project: compactProject(project),
      media: {
        name: workspaceFile.name ?? originalName,
        filePath: workspaceFile.filePath,
        workspacePath: workspaceFile.workspacePath,
        fileUrl: workspaceFile.fileUrl ?? workspaceFile.url ?? null,
        src: workspaceFile.fileUrl ?? workspaceFile.url ?? workspaceFile.workspacePath ?? workspaceFile.filePath,
        mimeType,
        size: input.buffer.length,
        checksum
      }
    }
  }

  async saveStyle(scope: MotionScope, input: SaveMotionStyleInput) {
    const style = await this.styleRepository.save(
      this.styleRepository.create({
        ...scopedCreate(scope),
        projectId: scope.projectId ?? null,
        assistantId: scope.assistantId ?? null,
        motionProjectId: normalizeOptional(input.projectId),
        name: normalizeRequired(input.name, 'Motion style name is required.'),
        description: normalizeOptional(input.description),
        surface: input.surface ?? null,
        style: normalizeJsonObject(input.style) ?? {},
        createdById: scope.userId ?? null
      })
    )
    await this.writeLog(scope, {
      motionProjectId: style.motionProjectId,
      action: 'style_saved',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: `Motion style "${style.name}" was saved.`,
      snapshot: { styleId: style.id, surface: style.surface }
    })
    return { success: true, message: 'Motion style was saved.', style: compactStyle(style) }
  }

  async listStyles(scope: MotionScope, projectId?: string | null) {
    const all = await this.styleRepository.find({
      where: scopedWhere<MotionStyle>(scope, {}),
      order: { updatedAt: 'DESC' }
    })
    return all
      .filter((style) => !projectId || !style.motionProjectId || style.motionProjectId === projectId)
      .slice(0, 100)
      .map(compactStyle)
  }

  async deleteStyle(scope: MotionScope, styleId: string) {
    const style = await this.styleRepository.findOne({ where: scopedWhere<MotionStyle>(scope, { id: styleId }) })
    if (!style) {
      throw new NotFoundException('Motion style was not found.')
    }
    await this.styleRepository.delete(scopedWhere<MotionStyle>(scope, { id: style.id }))
    await this.writeLog(scope, {
      motionProjectId: style.motionProjectId,
      action: 'style_deleted',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: `Motion style "${style.name}" was deleted.`,
      snapshot: { styleId: style.id }
    })
    return { success: true, message: 'Motion style was deleted.', deletedStyleId: style.id }
  }

  async updateProjectStatus(scope: MotionScope, input: UpdateMotionProjectStatusInput) {
    const project = await this.requireProject(scope, input.projectId)
    project.status = normalizeStatus(input.status)
    project.failureReason = project.status === 'failed' ? normalizeOptional(input.reason) : null
    project.lastEditedById = scope.userId ?? null
    project.lastEditedAt = new Date()
    const saved = await this.projectRepository.save(project)
    await this.writeLog(scope, {
      motionProjectId: project.id,
      action: project.status === 'archived' ? 'project_archived' : 'project_status_updated',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: input.reason ?? `Motion project status changed to ${project.status}.`,
      snapshot: { status: project.status }
    })
    return {
      success: true,
      message: 'Motion project status was updated.',
      project: compactProject(saved)
    }
  }

  async deleteProject(scope: MotionScope, projectId: string) {
    const project = await this.requireProject(scope, projectId)
    await Promise.all([
      this.versionRepository.delete(scopedWhere<MotionProjectVersion>(scope, { motionProjectId: project.id })),
      this.exportRepository.delete(scopedWhere<MotionExport>(scope, { motionProjectId: project.id })),
      this.styleRepository.delete(scopedWhere<MotionStyle>(scope, { motionProjectId: project.id })),
      this.logRepository.delete(scopedWhere<MotionActionLog>(scope, { motionProjectId: project.id }))
    ])
    await this.projectRepository.delete(scopedWhere<MotionProject>(scope, { id: project.id }))
    return {
      success: true,
      message: 'Motion project was deleted.',
      deletedProjectId: project.id
    }
  }

  async reportFailure(scope: MotionScope, input: ReportMotionFailureInput) {
    let project: MotionProject | null = null
    if (input.projectId) {
      project = await this.requireProject(scope, input.projectId)
      project.status = input.recoverable === false ? 'failed' : project.status ?? 'draft'
      project.failureReason = input.errorMessage
      await this.projectRepository.save(project)
    }
    await this.writeLog(scope, {
      motionProjectId: project?.id ?? input.projectId ?? null,
      versionId: normalizeOptional(input.versionId),
      action: 'failure_reported',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: input.operation,
      errorMessage: input.errorMessage,
      snapshot: compactJson(input.evidence)
    })
    return {
      success: true,
      message: 'Motion failure was recorded.',
      project: project ? compactProject(project) : null,
      recoverable: input.recoverable ?? true
    }
  }

  private async requireProject(scope: MotionScope, projectId: string) {
    const project = await this.projectRepository.findOne({
      where: scopedWhere<MotionProject>(scope, { id: projectId })
    })
    if (!project) {
      throw new NotFoundException('Motion project was not found.')
    }
    return project
  }

  private async saveExportBuffer(scope: MotionScope, input: UploadArtifactInput): Promise<{ export: MotionExport; workspaceStored: boolean }> {
    const checksum = sha256(input.buffer)
    const workspaceFiles = this.runtimeCapabilities?.get<MotionWorkspaceFilesApi>(MOTION_WORKSPACE_FILES_RUNTIME_CAPABILITY)
    let workspaceFile: MotionWorkspaceFileRecord | null = null
    if (workspaceFiles) {
      workspaceFile = await workspaceFiles.uploadBuffer({
        ...resolveProjectWorkspaceScope(scope, input.project),
        buffer: input.buffer,
        originalName: input.originalName,
        mimeType: input.mimeType,
        size: input.buffer.length,
        folder: buildMotionExportFolder(requireId(input.project.id)),
        fileName: input.originalName,
        metadata: {
          plugin: 'motion',
          kind: input.kind,
          motionProjectId: input.project.id,
          versionId: input.versionId ?? null,
          checksum
        }
      })
      input.project.workspaceCatalog = workspaceFile.catalog ?? input.project.workspaceCatalog
      input.project.workspaceScopeId = workspaceFile.scopeId ?? input.project.workspaceScopeId
    }
    const exportRecord = await this.exportRepository.save(
      this.exportRepository.create({
        ...scopedCreate(scope),
        projectId: scope.projectId ?? input.project.projectId ?? null,
        motionProjectId: requireId(input.project.id),
        versionId: input.versionId ?? null,
        kind: input.kind,
        filePath: workspaceFile?.filePath ?? null,
        fileUrl: workspaceFile?.fileUrl ?? workspaceFile?.url ?? null,
        mimeType: input.mimeType,
        size: input.buffer.length,
        checksum,
        workspaceCatalog: workspaceFile?.catalog ?? input.project.workspaceCatalog,
        workspaceScopeId: workspaceFile?.scopeId ?? input.project.workspaceScopeId,
        changeSummary: normalizeOptional(input.changeSummary),
        createdById: scope.userId ?? null,
        assistantId: scope.assistantId ?? null,
        conversationId: scope.conversationId ?? null
      })
    )
    input.project.lastExportKind = input.kind
    input.project.lastExportPath = workspaceFile?.filePath ?? input.project.lastExportPath
    await this.projectRepository.save(input.project)
    await this.writeLog(scope, {
      motionProjectId: input.project.id,
      versionId: input.versionId ?? null,
      action: 'artifact_exported',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: input.changeSummary ?? `Exported ${input.kind.toUpperCase()} artifact.`,
      snapshot: { exportId: exportRecord.id, kind: input.kind, filePath: exportRecord.filePath, checksum }
    })
    return { export: exportRecord, workspaceStored: Boolean(workspaceFile) }
  }

  private async writeLog(
    scope: MotionScope,
    input: {
      motionProjectId?: string | null
      versionId?: string | null
      action: MotionActionType
      actorType?: MotionActorType
      message?: string | null
      errorMessage?: string | null
      snapshot?: MotionJsonValue
    }
  ) {
    await this.logRepository.save(
      this.logRepository.create({
        ...scopedCreate(scope),
        projectId: scope.projectId ?? null,
        motionProjectId: input.motionProjectId ?? null,
        versionId: input.versionId ?? null,
        action: input.action,
        actorType: input.actorType ?? 'system',
        actorId: scope.userId ?? scope.assistantId ?? null,
        message: normalizeOptional(input.message),
        errorMessage: normalizeOptional(input.errorMessage),
        snapshot: input.snapshot
      })
    )
  }
}

function scopedCreate(scope: MotionScope): ScopedEntity {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null,
    projectId: scope.projectId ?? null
  }
}

function scopedWhere<T extends ScopedEntity>(scope: MotionScope, where: Partial<T>): FindOptionsWhere<T> {
  const scoped: Partial<T> = {
    ...where,
    tenantId: scope.tenantId as T['tenantId']
  }
  if (scope.organizationId !== undefined) {
    scoped.organizationId = (scope.organizationId ?? null) as T['organizationId']
  }
  return scoped as FindOptionsWhere<T>
}

function compactProject(project: MotionProject) {
  return {
    id: project.id,
    title: project.title,
    brief: project.brief ?? null,
    surface: project.surface ?? 'web',
    status: project.status ?? 'draft',
    designSystemId: project.designSystemId ?? null,
    motionProfile: project.motionProfile ?? null,
    selectedRecipeIds: project.selectedRecipeIds ?? [],
    currentVersionId: project.currentVersionId ?? null,
    currentVersionNumber: project.currentVersionNumber ?? 0,
    workingCopyRevision: project.workingCopyRevision ?? 0,
    artifactChecksum: project.artifactChecksum ?? null,
    lastExportPath: project.lastExportPath ?? null,
    lastExportKind: project.lastExportKind ?? null,
    failureReason: project.failureReason ?? null,
    updatedAt: project.updatedAt?.toISOString?.() ?? null,
    createdAt: project.createdAt?.toISOString?.() ?? null
  }
}

function compactVersion(version: MotionProjectVersion) {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    sourceType: version.sourceType ?? 'workbench',
    surface: version.surface ?? 'web',
    selectedRecipeIds: version.selectedRecipeIds ?? [],
    artifactChecksum: version.artifactChecksum ?? null,
    changeSummary: version.changeSummary ?? null,
    createdAt: version.createdAt?.toISOString?.() ?? null
  }
}

function compactExport(record: MotionExport) {
  return {
    id: record.id,
    versionId: record.versionId ?? null,
    kind: record.kind,
    filePath: record.filePath ?? null,
    fileUrl: record.fileUrl ?? null,
    mimeType: record.mimeType ?? null,
    size: record.size ?? null,
    checksum: record.checksum ?? null,
    changeSummary: record.changeSummary ?? null,
    createdAt: record.createdAt?.toISOString?.() ?? null
  }
}

function compactStyle(style: MotionStyle) {
  return {
    id: style.id,
    motionProjectId: style.motionProjectId ?? null,
    name: style.name,
    description: style.description ?? null,
    surface: style.surface ?? null,
    style: style.style,
    updatedAt: style.updatedAt?.toISOString?.() ?? null,
    createdAt: style.createdAt?.toISOString?.() ?? null
  }
}

function compactLog(log: MotionActionLog) {
  return {
    id: log.id,
    action: log.action,
    actorType: log.actorType ?? 'system',
    message: log.message ?? null,
    errorMessage: log.errorMessage ?? null,
    snapshot: log.snapshot ?? null,
    createdAt: log.createdAt?.toISOString?.() ?? null
  }
}

function normalizeRequired(value: string | null | undefined, message: string) {
  const normalized = normalizeOptional(value)
  if (!normalized) {
    throw new BadRequestException(message)
  }
  return normalized
}

function normalizeOptional(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || undefined
}

function normalizeSurface(surface: MotionSurface | string | null | undefined): MotionSurface {
  return surface === 'video' ? 'video' : 'web'
}

function normalizeStatus(status: MotionProjectStatus | string): MotionProjectStatus {
  if (status === 'draft' || status === 'reviewed' || status === 'archived' || status === 'failed') {
    return status
  }
  throw new BadRequestException('Unsupported Motion project status.')
}

function normalizeExportKind(kind: MotionExportKind | string): MotionExportKind {
  if (kind === 'html' || kind === 'css' || kind === 'react' || kind === 'lottie' || kind === 'json' || kind === 'mp4' || kind === 'gif') {
    return kind
  }
  throw new BadRequestException('Unsupported Motion export kind.')
}

function checksumArtifact(surface: MotionSurface, html: string | null | undefined, composition: MotionVideoComposition | null | undefined) {
  return sha256(Buffer.from(surface === 'web' ? html ?? '' : stableJson(composition), 'utf8'))
}

function sha256(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function requireId(id: string | null | undefined) {
  if (!id) {
    throw new BadRequestException('Motion entity id is required.')
  }
  return id
}

function inferVersionSource(scope: MotionScope, surface?: MotionSurface): MotionVersionSource {
  if (!scope.assistantId) {
    return 'workbench'
  }
  return surface === 'video' ? 'agent_video' : 'agent_web'
}

function starterHtml(title: string, brief?: string | null) {
  return injectMotionRuntime(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#f8fafc;color:#0f172a}
    main{min-height:100vh;display:grid;place-items:center;padding:48px}
    section{max-width:860px}
    h1{font-size:clamp(42px,7vw,88px);line-height:1;margin:0 0 18px}
    p{font-size:20px;line-height:1.6;color:#475569}
  </style>
</head>
<body>
  <main>
    <section>
      <h1 data-ma-anim="slide-up" data-ma-trigger="load" data-ma-dur="520" data-ma-delay="0">${escapeHtml(title)}</h1>
      <p data-ma-anim="fade" data-ma-trigger="load" data-ma-dur="520" data-ma-delay="120">${escapeHtml(brief || 'Describe the motion you want, then refine it in the Motion Workbench.')}</p>
    </section>
  </main>
</body>
</html>`)
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
}

function sanitizeFileName(value: string) {
  const normalized = value.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized || `motion-${randomUUID()}`
}

function mimeTypeForKind(kind: MotionExportKind) {
  switch (kind) {
    case 'html':
      return 'text/html; charset=utf-8'
    case 'css':
      return 'text/css; charset=utf-8'
    case 'react':
      return 'text/plain; charset=utf-8'
    case 'lottie':
    case 'json':
      return 'application/json; charset=utf-8'
    case 'mp4':
      return 'video/mp4'
    case 'gif':
      return 'image/gif'
  }
}

function resolveProjectWorkspaceScope(scope: MotionScope, project: MotionProject): MotionWorkspaceFileScope {
  if (project.workspaceCatalog === 'projects' && project.workspaceScopeId) {
    return {
      tenantId: scope.tenantId,
      userId: scope.userId,
      catalog: 'projects',
      scopeId: project.workspaceScopeId,
      projectId: project.workspaceScopeId
    }
  }
  if (project.workspaceCatalog === 'xperts' && project.workspaceScopeId) {
    return {
      tenantId: scope.tenantId,
      userId: scope.userId,
      catalog: 'xperts',
      scopeId: project.workspaceScopeId,
      xpertId: project.workspaceScopeId,
      isolateByUser: false
    }
  }
  const projectId = normalizeOptional(scope.projectId) ?? normalizeOptional(project.projectId)
  if (projectId) {
    return {
      tenantId: scope.tenantId,
      userId: scope.userId,
      catalog: 'projects',
      scopeId: projectId,
      projectId
    }
  }
  const xpertId = normalizeOptional(scope.assistantId) ?? normalizeOptional(project.assistantId)
  if (!xpertId) {
    throw new BadRequestException('Motion workspace storage requires an assistant or project scope.')
  }
  return {
    tenantId: scope.tenantId,
    userId: scope.userId,
    catalog: 'xperts',
    scopeId: xpertId,
    xpertId,
    isolateByUser: false
  }
}

function buildMotionExportFolder(projectId: string) {
  return `files/motion/projects/${projectId.replace(/[^a-zA-Z0-9._-]+/g, '-')}/exports`
}

function buildMotionMediaFolder(projectId: string) {
  return `files/motion/projects/${projectId.replace(/[^a-zA-Z0-9._-]+/g, '-')}/media`
}

function inferMimeTypeFromName(fileName: string) {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.mp4')) return 'video/mp4'
  if (lower.endsWith('.webm')) return 'video/webm'
  if (lower.endsWith('.mov')) return 'video/quicktime'
  return 'application/octet-stream'
}

function isAllowedMotionMediaMime(mimeType: string) {
  return /^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm|quicktime))$/i.test(mimeType)
}
