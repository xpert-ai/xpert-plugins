import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  ArtifactsRuntimeCapability,
  WorkspaceFilesRuntimeCapability,
  WORKSPACE_FILES_SOURCE,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type AgentMiddlewareRuntimeCapabilityRegistry,
  type ArtifactAccessMode,
  type ArtifactLinkRecord,
  type ArtifactLinkVersionMode,
  type ArtifactsApi,
  type WorkspaceFile,
  type WorkspaceFileScope,
  type WorkspacePortableFileReference
} from '@xpert-ai/plugin-sdk'
import { DRAWIO_PLUGIN_NAME } from './constants.js'
import { DrawioArtifactViewerService } from './drawio-artifact-viewer.service.js'
import { DrawioActionLog, DrawioDrawing, DrawioDrawingVersion } from './entities/index.js'
import type {
  CreateDrawioDrawingInput,
  DrawioActionType,
  DrawioActorType,
  DrawioScope,
  DrawioSceneInput,
  DrawioVersionSource,
  PatchDrawioSceneInput,
  ReportDrawioFailureInput,
  SaveDrawioMermaidDraftInput,
  SaveDrawioSceneVersionInput,
  SearchDrawioDrawingsInput,
  UpdateDrawioDrawingStatusInput
} from './types.js'

type ScopedEntity = {
  tenantId?: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
}

@Injectable()
export class DrawioService {
  constructor(
    @InjectRepository(DrawioDrawing)
    private readonly drawingRepository: Repository<DrawioDrawing>,
    @InjectRepository(DrawioDrawingVersion)
    private readonly versionRepository: Repository<DrawioDrawingVersion>,
    @InjectRepository(DrawioActionLog)
    private readonly logRepository: Repository<DrawioActionLog>,
    @Optional() @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: AgentMiddlewareRuntimeCapabilityRegistry,
    @Optional()
    private readonly artifactViewer?: DrawioArtifactViewerService
  ) {}

  async createDrawing(scope: DrawioScope, input: CreateDrawioDrawingInput) {
    const title = normalizeRequired(input.title, 'Diagram title is required.')
    const drawing = await this.drawingRepository.save(
      this.drawingRepository.create({
        ...scopedCreate(scope),
        assistantId: scope.assistantId ?? null,
        conversationId: scope.conversationId ?? null,
        createdById: scope.userId ?? null,
        title,
        description: normalizeOptional(input.description),
        kind: input.kind ?? 'diagram',
        status: 'draft',
        tags: normalizeStringArray(input.tags),
        source: normalizeOptional(input.source),
        currentVersionNumber: 0,
        lastEditedById: scope.userId ?? null,
        lastEditedAt: new Date()
      })
    )

    await this.writeLog(scope, {
      drawingId: drawing.id,
      action: 'drawing_created',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: `draw.io diagram "${title}" was created.`,
      snapshot: { title, kind: drawing.kind, source: drawing.source }
    })

    if (hasSceneContent(input)) {
      await this.createVersion(scope, drawing, {
        sourceType: input.mermaidSource ? 'agent_mermaid' : 'agent_xml',
        xml: normalizeNullableText(input.xml),
        mermaidSource: normalizeNullableText(input.mermaidSource),
        previewSvg: normalizeNullableText(input.previewSvg),
        previewPng: normalizeNullableText(input.previewPng),
        descriptor: normalizeObject(input.descriptor),
        changeSummary: normalizeOptional(input.changeSummary) ?? 'Initial diagram'
      })
    }

    return this.getDrawing(scope, drawing.id as string)
  }

  async saveSceneVersion(scope: DrawioScope, input: SaveDrawioSceneVersionInput) {
    const drawing = await this.requireDrawing(scope, input.drawingId)
    const version = await this.createVersion(scope, drawing, {
      sourceType: input.sourceType ?? 'agent_xml',
      xml: normalizeNullableText(input.xml),
      mermaidSource: normalizeNullableText(input.mermaidSource),
      previewSvg: normalizeNullableText(input.previewSvg),
      previewPng: normalizeNullableText(input.previewPng),
      descriptor: normalizeObject(input.descriptor),
      changeSummary: normalizeOptional(input.changeSummary)
    })

    return {
      success: true,
      message: 'draw.io diagram version was saved.',
      drawing: await this.getDrawing(scope, drawing.id as string),
      version
    }
  }

  async patchScene(scope: DrawioScope, input: PatchDrawioSceneInput) {
    const drawing = await this.requireDrawing(scope, input.drawingId)
    const currentVersion = await this.getCurrentVersion(scope, drawing)
    const version = await this.createVersion(scope, drawing, {
      sourceType: 'agent_patch',
      xml: input.xml === undefined ? normalizeNullableText(currentVersion?.xml) : normalizeNullableText(input.xml),
      mermaidSource:
        input.mermaidSource === undefined
          ? normalizeNullableText(currentVersion?.mermaidSource)
          : normalizeNullableText(input.mermaidSource),
      previewSvg:
        input.previewSvg === undefined ? normalizeNullableText(currentVersion?.previewSvg) : normalizeNullableText(input.previewSvg),
      previewPng:
        input.previewPng === undefined ? normalizeNullableText(currentVersion?.previewPng) : normalizeNullableText(input.previewPng),
      descriptor:
        input.descriptor === undefined ? normalizeObject(currentVersion?.descriptor) : normalizeObject(input.descriptor),
      changeSummary: normalizeOptional(input.changeSummary) ?? 'Agent patch'
    })

    await this.writeLog(scope, {
      drawingId: drawing.id,
      versionId: version.id,
      action: 'scene_patched',
      actorType: 'agent',
      message: input.changeSummary,
      snapshot: {
        hasXml: Boolean(input.xml),
        hasMermaidSource: Boolean(input.mermaidSource),
        hasPreview: Boolean(input.previewSvg || input.previewPng)
      }
    })

    return {
      success: true,
      message: 'draw.io diagram patch was saved as a new version.',
      drawing: await this.getDrawing(scope, drawing.id as string),
      version
    }
  }

  async saveMermaidDraft(scope: DrawioScope, input: SaveDrawioMermaidDraftInput) {
    const mermaidSource = normalizeRequired(input.mermaidSource, 'Mermaid source is required.')
    const drawing = input.drawingId
      ? await this.requireDrawing(scope, input.drawingId)
      : (
          await this.createDrawing(scope, {
            title: input.title ?? 'Untitled Mermaid Diagram',
            description: input.description,
            kind: input.kind ?? 'flowchart'
          })
        ).item

    const version = await this.createVersion(scope, drawing, {
      sourceType: 'agent_mermaid',
      xml: null,
      mermaidSource,
      previewSvg: null,
      previewPng: null,
      descriptor: {
        format: 'mermaid',
        data: mermaidSource
      },
      changeSummary: normalizeOptional(input.changeSummary) ?? 'Mermaid draft'
    })

    await this.writeLog(scope, {
      drawingId: drawing.id,
      versionId: version.id,
      action: 'mermaid_draft_saved',
      actorType: 'agent',
      message: input.changeSummary,
      snapshot: { mermaidSource }
    })

    return {
      success: true,
      message: 'Mermaid draft was saved. Open it in the draw.io workbench to convert and continue editing.',
      drawing: await this.getDrawing(scope, drawing.id as string),
      version
    }
  }

  async searchDrawings(scope: DrawioScope, query: SearchDrawioDrawingsInput = {}) {
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.max(1, Math.min(query.pageSize ?? 20, 100))
    const search = query.search?.trim().toLowerCase() ?? ''
    const drawings = await this.drawingRepository.find({
      where: scopedWhere(scope),
      order: {
        updatedAt: 'DESC'
      }
    })
    const filtered = drawings.filter((drawing) => {
      if (query.status && drawing.status !== query.status) {
        return false
      }
      if (query.kind && drawing.kind !== query.kind) {
        return false
      }
      if (!search) {
        return true
      }
      return [drawing.title, drawing.description, drawing.kind, ...(drawing.tags ?? [])]
        .filter(isString)
        .some((value) => value.toLowerCase().includes(search))
    })
    const start = (page - 1) * pageSize

    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
      search
    }
  }

  async getDrawing(scope: DrawioScope, drawingId: string) {
    const drawing = await this.requireDrawing(scope, drawingId)
    const [versions, logs, artifactShare] = await Promise.all([
      this.versionRepository.find({
        where: scopedWhere(scope, { drawingId }),
        order: {
          versionNumber: 'DESC'
        }
      }),
      this.logRepository.find({
        where: scopedWhere(scope, { drawingId }),
        order: {
          createdAt: 'DESC'
        }
      }),
      this.getArtifactShareForDrawing(drawingId)
    ])
    const currentVersion = versions.find((version) => version.id === drawing.currentVersionId) ?? versions[0] ?? null

    return {
      item: drawing,
      currentVersion,
      versions,
      logs,
      artifactShare: artifactShare ? compactArtifactShare(drawingId, artifactShare) : null,
      total: versions.length,
      summary: {
        versionCount: versions.length,
        currentVersionNumber: drawing.currentVersionNumber ?? currentVersion?.versionNumber ?? 0,
        hasXml: versions.some((version) => Boolean(version.xml)),
        hasMermaidDraft: versions.some((version) => Boolean(version.mermaidSource))
      }
    }
  }

  async getWorkbenchData(scope: DrawioScope, query: SearchDrawioDrawingsInput & { drawingId?: string } = {}) {
    if (query.drawingId) {
      return this.getDrawing(scope, query.drawingId)
    }
    const result = await this.searchDrawings(scope, query)
    return {
      ...result,
      summary: {
        page: result.page,
        pageSize: result.pageSize,
        search: result.search
      }
    }
  }

  async updateDrawingStatus(scope: DrawioScope, input: UpdateDrawioDrawingStatusInput) {
    const drawing = await this.requireDrawing(scope, input.drawingId)
    const updated = await this.drawingRepository.save({
      ...drawing,
      status: input.status,
      lastEditedById: scope.userId ?? null,
      lastEditedAt: new Date()
    })

    await this.writeLog(scope, {
      drawingId: drawing.id,
      versionId: drawing.currentVersionId,
      action: input.status === 'archived' ? 'drawing_archived' : 'status_updated',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: input.reason ?? `Status updated to ${input.status}`,
      snapshot: { status: input.status }
    })

    return {
      success: true,
      message: 'draw.io diagram status was updated.',
      item: updated
    }
  }

  async restoreVersion(scope: DrawioScope, drawingId: string, versionId: string, changeSummary?: string) {
    const drawing = await this.requireDrawing(scope, drawingId)
    const version = await this.versionRepository.findOne({
      where: scopedWhere(scope, { id: versionId, drawingId })
    })
    if (!version) {
      throw new NotFoundException('draw.io diagram version was not found.')
    }

    const restored = await this.createVersion(scope, drawing, {
      sourceType: 'restore',
      xml: normalizeNullableText(version.xml),
      mermaidSource: normalizeNullableText(version.mermaidSource),
      previewSvg: normalizeNullableText(version.previewSvg),
      previewPng: normalizeNullableText(version.previewPng),
      descriptor: normalizeObject(version.descriptor),
      changeSummary: normalizeOptional(changeSummary) ?? `Restored version ${version.versionNumber}`
    })

    await this.writeLog(scope, {
      drawingId,
      versionId: restored.id,
      action: 'version_restored',
      actorType: 'user',
      message: changeSummary,
      snapshot: { restoredFromVersionId: versionId, restoredFromVersionNumber: version.versionNumber }
    })

    return {
      success: true,
      message: 'draw.io diagram version was restored.',
      drawing: await this.getDrawing(scope, drawingId),
      version: restored
    }
  }

  async reportFailure(scope: DrawioScope, input: ReportDrawioFailureInput) {
    const log = await this.writeLog(scope, {
      drawingId: input.drawingId,
      versionId: input.versionId,
      action: 'failure_reported',
      actorType: scope.assistantId ? 'agent' : 'system',
      message: input.operation,
      errorMessage: input.errorMessage,
      snapshot: {
        recoverable: input.recoverable,
        evidence: input.evidence
      }
    })

    return {
      success: true,
      message: 'draw.io diagram failure was recorded.',
      log
    }
  }

  async publishArtifact(scope: DrawioScope, input: { drawingId: string; accessMode?: ArtifactAccessMode | null; targetMode?: ArtifactLinkVersionMode | null; userConfirmedPublicLink?: boolean | null }) {
    const drawing = await this.requireDrawing(scope, input.drawingId)
    if (drawing.status === 'archived') throw new BadRequestException('Archived draw.io diagrams cannot be shared.')
    const version = await this.getCurrentVersion(scope, drawing)
    if (!version) throw new BadRequestException('draw.io diagram has no saved version to share.')
    const accessMode = normalizeArtifactAccessMode(input.accessMode, 'draw.io')
    if (accessMode === 'public_link' && input.userConfirmedPublicLink !== true) throw new BadRequestException('Public Artifact sharing requires explicit user confirmation.')
    if (accessMode === 'workspace_all' && !drawing.workspaceId) throw new BadRequestException('Workspace sharing requires a workspace-scoped draw.io diagram.')
    const targetMode: ArtifactLinkVersionMode = input.targetMode === 'latest' ? 'latest' : 'version'
    const rendered = this.artifactViewerService().render({ title: drawing.title, description: drawing.description, version })
    const artifacts = this.artifacts()
    const drawingId = drawing.id as string
    const metadata = { drawingId, drawingVersionId: version.id ?? null, drawingVersionNumber: version.versionNumber, viewerVersion: rendered.viewerVersion, sourceType: rendered.sourceType }
    const artifact = (await artifacts.findArtifactBySource({ pluginName: DRAWIO_PLUGIN_NAME, resourceType: DRAWIO_ARTIFACT_RESOURCE_TYPE, resourceId: drawingId })) ??
      (await artifacts.createArtifact({ source: { pluginName: DRAWIO_PLUGIN_NAME, resourceType: DRAWIO_ARTIFACT_RESOURCE_TYPE, resourceId: drawingId, checksum: rendered.checksum }, kind: 'html', title: drawing.title, description: drawing.description, scope: artifactRuntimeScope(drawing, scope), metadata }))
    const existingVersion = (await artifacts.listArtifactVersions({ artifactId: artifact.id, idempotencyKey: rendered.sha256, status: 'active' }))[0]
    let workspaceFileRef = existingVersion?.workspaceFileRef ?? null
    if (!workspaceFileRef) {
      const workspaceScope = artifactWorkspaceScope(drawing, scope)
      const workspaceName = `${rendered.sha256}.html`
      const file = await this.workspaceFiles().uploadBuffer({ ...workspaceScope, buffer: rendered.buffer, originalName: workspaceName, fileName: workspaceName, mimeType: rendered.mimeType, size: rendered.size, folder: `files/drawio/artifacts/${drawingId}` })
      workspaceFileRef = portableArtifactReference(file, workspaceScope, workspaceName, rendered)
    }
    const versionResult = await artifacts.ensureArtifactVersion({ artifactId: artifact.id, idempotencyKey: rendered.sha256, workspaceFileRef, mimeType: rendered.mimeType, fileName: normalizeArtifactFileName(drawing.title), title: drawing.title, description: drawing.description, size: rendered.size, sha256: rendered.sha256, sourceVersionId: version.id ?? `v${version.versionNumber}`, checksum: rendered.checksum, setCurrent: true, metadata })
    const shareResult = await artifacts.ensureArtifactShare({ artifactId: artifact.id, shareKey: DRAWIO_ARTIFACT_SHARE_KEY, artifactVersionId: targetMode === 'version' ? versionResult.version.id : null, versionMode: targetMode, access: { mode: accessMode, userConfirmedPublicLink: accessMode === 'public_link' ? true : null }, presentation: { disposition: 'inline', allowDownload: false, safeHtmlProfile: 'interactive' }, metadata })
    await this.writeLog(scope, { drawingId, versionId: version.id, action: 'artifact_published', actorType: scope.assistantId ? 'agent' : 'user', message: 'Published draw.io read-only Artifact.', snapshot: { accessMode, targetMode, artifactId: artifact.id } })
    return compactArtifactShare(drawingId, { ...shareResult.link, version: shareResult.link.version ?? versionResult.version }, shareResult.outcome === 'reused' && versionResult.outcome === 'reused')
  }

  async revokeArtifactShare(scope: DrawioScope, drawingId: string) {
    await this.requireDrawing(scope, drawingId)
    const artifact = await this.optionalArtifacts()?.findArtifactBySource({ pluginName: DRAWIO_PLUGIN_NAME, resourceType: DRAWIO_ARTIFACT_RESOURCE_TYPE, resourceId: drawingId })
    if (!artifact) return { message: 'draw.io diagram has no active Artifact share.', drawingId, revoked: false }
    const revoked = await this.artifacts().revokeArtifactShare({ artifactId: artifact.id, shareKey: DRAWIO_ARTIFACT_SHARE_KEY })
    if (!revoked) return { message: 'draw.io diagram has no active Artifact share.', drawingId, revoked: false }
    await this.writeLog(scope, { drawingId, action: 'artifact_share_revoked', actorType: scope.assistantId ? 'agent' : 'user', message: 'Revoked draw.io Artifact share.' })
    return { message: 'draw.io Artifact share was revoked.', drawingId, revoked: true }
  }

  private async createVersion(
    scope: DrawioScope,
    drawing: DrawioDrawing,
    input: DrawioSceneInput & {
      sourceType: DrawioVersionSource
      changeSummary?: string
    }
  ) {
    const currentVersionNumber = drawing.currentVersionNumber ?? 0
    const versionNumber = currentVersionNumber + 1
    const version = await this.versionRepository.save(
      this.versionRepository.create({
        ...scopedCreate(scope),
        drawingId: drawing.id as string,
        versionNumber,
        sourceType: input.sourceType,
        xml: normalizeNullableText(input.xml),
        mermaidSource: normalizeNullableText(input.mermaidSource),
        previewSvg: normalizeNullableText(input.previewSvg),
        previewPng: normalizeNullableText(input.previewPng),
        descriptor: normalizeObject(input.descriptor),
        changeSummary: normalizeOptional(input.changeSummary),
        createdById: scope.userId ?? null,
        assistantId: scope.assistantId ?? null,
        conversationId: scope.conversationId ?? null
      })
    )

    await this.drawingRepository.save({
      ...drawing,
      currentVersionId: version.id,
      currentVersionNumber: version.versionNumber,
      lastEditedById: scope.userId ?? null,
      lastEditedAt: new Date()
    })

    await this.writeLog(scope, {
      drawingId: drawing.id,
      versionId: version.id,
      action: 'version_saved',
      actorType: input.sourceType.startsWith('agent') ? 'agent' : 'user',
      message: input.changeSummary,
      snapshot: {
        sourceType: input.sourceType,
        versionNumber,
        hasXml: Boolean(input.xml),
        hasMermaidSource: Boolean(input.mermaidSource),
        hasPreview: Boolean(input.previewSvg || input.previewPng)
      }
    })

    return version
  }

  private async getCurrentVersion(scope: DrawioScope, drawing: DrawioDrawing) {
    if (!drawing.currentVersionId) {
      return null
    }
    return this.versionRepository.findOne({
      where: scopedWhere(scope, { id: drawing.currentVersionId, drawingId: drawing.id as string })
    })
  }

  private artifacts() { const capability = this.optionalArtifacts(); if (!capability) throw new Error('Platform Artifacts capability is not available.'); return capability }
  private optionalArtifacts() { return this.runtimeCapabilities?.get(ArtifactsRuntimeCapability) as ArtifactsApi | undefined }
  private workspaceFiles() { const capability = this.runtimeCapabilities?.get(WorkspaceFilesRuntimeCapability); if (!capability) throw new Error('Platform Workspace Files capability is not available.'); return capability }
  private artifactViewerService() { if (!this.artifactViewer) throw new Error('draw.io Artifact viewer is not available.'); return this.artifactViewer }
  private async getArtifactShareForDrawing(drawingId: string) { const artifacts = this.optionalArtifacts(); if (!artifacts) return null; const artifact = await artifacts.findArtifactBySource({ pluginName: DRAWIO_PLUGIN_NAME, resourceType: DRAWIO_ARTIFACT_RESOURCE_TYPE, resourceId: drawingId }); return artifact ? artifacts.getArtifactShare({ artifactId: artifact.id, shareKey: DRAWIO_ARTIFACT_SHARE_KEY }) : null }

  private async requireDrawing(scope: DrawioScope, drawingId: string) {
    const id = normalizeRequired(drawingId, 'Diagram id is required.')
    const drawing = await this.drawingRepository.findOne({
      where: scopedWhere(scope, { id })
    })
    if (!drawing) {
      throw new NotFoundException('draw.io diagram was not found.')
    }
    return drawing
  }

  private async writeLog(
    scope: DrawioScope,
    input: {
      drawingId?: string
      versionId?: string
      action: DrawioActionType
      actorType: DrawioActorType
      message?: string
      errorMessage?: string
      snapshot?: unknown
    }
  ) {
    return this.logRepository.save(
      this.logRepository.create({
        ...scopedCreate(scope),
        drawingId: input.drawingId,
        versionId: input.versionId,
        action: input.action,
        actorType: input.actorType,
        actorId: scope.userId ?? scope.assistantId ?? null,
        message: normalizeOptional(input.message),
        errorMessage: normalizeOptional(input.errorMessage),
        snapshot: input.snapshot
      })
    )
  }
}

const DRAWIO_ARTIFACT_RESOURCE_TYPE = 'drawio_diagram_viewer'
const DRAWIO_ARTIFACT_SHARE_KEY = 'readonly-default'

type DrawioArtifactWorkspaceScope = WorkspaceFileScope & { catalog: 'projects' | 'xperts'; scopeId: string }

function artifactWorkspaceScope(drawing: DrawioDrawing, scope: DrawioScope): DrawioArtifactWorkspaceScope {
  const userId = normalizeRequired(scope.userId ?? drawing.createdById, 'draw.io Artifact publishing requires a user-scoped operation.')
  const projectId = drawing.projectId ?? scope.projectId ?? null
  const xpertId = drawing.assistantId ?? scope.assistantId ?? null
  const catalog = projectId ? 'projects' : 'xperts'
  const scopeId = projectId ?? xpertId
  if (!scopeId) throw new BadRequestException('draw.io Artifact publishing requires a project or Xpert workspace scope.')
  return { tenantId: drawing.tenantId ?? scope.tenantId, userId, catalog, scopeId, projectId: catalog === 'projects' ? scopeId : null, xpertId: catalog === 'xperts' ? scopeId : null, isolateByUser: catalog === 'xperts' ? false : null }
}

function portableArtifactReference(file: WorkspaceFile, scope: DrawioArtifactWorkspaceScope, originalName: string, rendered: { mimeType: string; size: number }): WorkspacePortableFileReference {
  return { source: WORKSPACE_FILES_SOURCE, ...scope, filePath: file.filePath, workspacePath: file.workspacePath, originalName, name: file.name, mimeType: file.mimeType ?? rendered.mimeType, size: file.size ?? rendered.size }
}

function artifactRuntimeScope(drawing: DrawioDrawing, scope: DrawioScope) { return { tenantId: drawing.tenantId ?? scope.tenantId, organizationId: drawing.organizationId ?? scope.organizationId ?? null, userId: scope.userId ?? drawing.createdById ?? null, workspaceId: drawing.workspaceId ?? scope.workspaceId ?? null, projectId: drawing.projectId ?? scope.projectId ?? null, xpertId: drawing.assistantId ?? scope.assistantId ?? null } }
function normalizeArtifactAccessMode(value: ArtifactAccessMode | null | undefined, label: string): ArtifactAccessMode { const normalized = value ?? 'public_link'; if (normalized === 'public_link' || normalized === 'organization_all' || normalized === 'workspace_all') return normalized; throw new BadRequestException(`Unsupported ${label} Artifact access mode: ${normalized}`) }
function normalizeArtifactFileName(value: string | null | undefined) { const base = (normalizeOptional(value) ?? 'drawio-diagram').replace(/\.html?$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'drawio-diagram'; return `${base}.html` }
function compactArtifactShare(drawingId: string, link: ArtifactLinkRecord, reused = false) { const publicUrl = link.publicUrl?.trim() || undefined; return { drawingId, artifactId: link.artifactId, artifactVersionId: link.version?.id ?? link.artifactVersionId, artifactLinkId: link.id, targetMode: link.versionMode, accessMode: link.accessMode, allowDownload: link.allowDownload, shareUrl: publicUrl, publicUrl, sharedAt: link.createdAt, status: link.status, reused } }

function scopedCreate(scope: DrawioScope): ScopedEntity {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null,
    projectId: scope.projectId ?? null
  }
}

function scopedWhere<T extends Record<string, unknown>>(scope: DrawioScope, extra?: T): ScopedEntity & T {
  return {
    ...scopedCreate(scope),
    ...(extra ?? ({} as T))
  }
}

function hasSceneContent(input: DrawioSceneInput) {
  return Boolean(
    normalizeNullableText(input.xml) ||
      normalizeNullableText(input.mermaidSource) ||
      normalizeNullableText(input.previewSvg) ||
      normalizeNullableText(input.previewPng) ||
      (isPlainObject(input.descriptor) && Object.keys(input.descriptor).length > 0)
  )
}

function normalizeRequired(value: unknown, message: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(message)
  }
  return value.trim()
}

function normalizeOptional(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeNullableText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isString).map((item) => item.trim()).filter(Boolean) : []
}

function normalizeObject(value: unknown) {
  return isPlainObject(value) ? value : {}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}
