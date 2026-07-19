import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { FindOptionsWhere, Repository } from 'typeorm'
import {
  ArtifactsRuntimeCapability,
  WORKSPACE_FILES_SOURCE,
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
import type {
  AgentMiddlewareRuntimeCapabilityRegistry,
  ArtifactAccessMode,
  ArtifactLinkRecord,
  ArtifactLinkVersionMode,
  ArtifactVersionRecord,
  ArtifactsApi,
  WorkspaceFile,
  WorkspaceFileScope,
  WorkspacePortableFileReference,
  WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'
import { CanvasActionLog, CanvasDocument } from './entities/index.js'
import { CANVAS_ARTIFACT_RESOURCE_TYPE, CANVAS_ARTIFACT_SHARE_KEY, CANVAS_PLUGIN_NAME } from './constants.js'
import type { CanvasJsonObject, CanvasScope } from './types.js'
import { CanvasArtifactViewerService } from './canvas-artifact-viewer.service.js'

export type PublishCanvasArtifactInput = {
  documentId: string
  accessMode?: ArtifactAccessMode | null
  targetMode?: ArtifactLinkVersionMode | null
  userConfirmedPublicLink?: boolean | null
  baseRevision: number
  baseSnapshotChecksum?: string | null
  pageId?: string | null
  pageName?: string | null
  svg: string
  width: number
  height: number
}

export type CanvasArtifactWorkspaceScope = WorkspaceFileScope & {
  catalog: 'projects' | 'xperts'
  scopeId: string
}

type ScopedEntity = {
  tenantId?: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
}

@Injectable()
export class CanvasArtifactService {
  constructor(
    @InjectRepository(CanvasDocument)
    private readonly documentRepository: Repository<CanvasDocument>,
    @InjectRepository(CanvasActionLog)
    private readonly logRepository: Repository<CanvasActionLog>,
    private readonly viewer: CanvasArtifactViewerService,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: AgentMiddlewareRuntimeCapabilityRegistry
  ) {}

  isAvailable() {
    return Boolean(this.optionalArtifacts() && this.optionalWorkspaceFiles())
  }

  async getShare(scope: CanvasScope, documentId: string) {
    await this.requireDocument(scope, documentId)
    const artifacts = this.optionalArtifacts()
    if (!artifacts) return null
    const artifact = await this.findCanvasArtifact(artifacts, documentId)
    if (!artifact) return null
    const link = await artifacts.getArtifactShare({ artifactId: artifact.id, shareKey: CANVAS_ARTIFACT_SHARE_KEY })
    return link ? compactArtifactShare(documentId, link) : null
  }

  async publish(scope: CanvasScope, input: PublishCanvasArtifactInput) {
    return this.publishInternal(scope, input, false)
  }

  /** Finalize a strongly-bound async export without comparing it to a newer live working copy. */
  async publishBoundExport(scope: CanvasScope, input: PublishCanvasArtifactInput) {
    return this.publishInternal(scope, input, true)
  }

  private async publishInternal(scope: CanvasScope, input: PublishCanvasArtifactInput, stronglyBound: boolean) {
    const document = await this.requireDocument(scope, input.documentId)
    if (document.status === 'archived') throw new BadRequestException('Archived Canvas documents cannot be shared.')
    const revision = normalizeRevision(input.baseRevision)
    const currentRevision = normalizeRevision(document.workingCopyRevision ?? 0)
    if (!stronglyBound && revision !== currentRevision) {
      throw new ConflictException(`Canvas working copy has changed: expected revision ${revision}, current revision ${currentRevision}. Synchronize and try again.`)
    }
    const expectedChecksum = normalizeOptional(input.baseSnapshotChecksum)
    const currentChecksum = stronglyBound ? expectedChecksum : normalizeOptional(document.snapshotChecksum)
    if (!stronglyBound && expectedChecksum && currentChecksum && expectedChecksum !== currentChecksum) {
      throw new ConflictException('Canvas working copy has changed since the share export was prepared. Synchronize and try again.')
    }
    const accessMode = normalizeArtifactAccessMode(input.accessMode)
    if (accessMode === 'public_link' && input.userConfirmedPublicLink !== true) {
      throw new BadRequestException('Public Artifact sharing requires explicit user confirmation.')
    }
    if (accessMode === 'organization_all' && !document.organizationId && !scope.organizationId) {
      throw new BadRequestException('Organization sharing requires an organization-scoped Canvas document.')
    }
    if (accessMode === 'workspace_all' && !document.workspaceId && !scope.workspaceId && !document.projectId && !scope.projectId) {
      throw new BadRequestException('Workspace sharing requires a workspace- or project-scoped Canvas document.')
    }
    const targetMode: ArtifactLinkVersionMode = input.targetMode === 'latest' ? 'latest' : 'version'
    const artifacts = this.artifacts()
    const workspaceFiles = this.workspaceFiles()
    let stage = 'render_viewer'
    try {
      const rendered = this.viewer.render({
        title: document.title,
        description: document.description,
        revision,
        pageName: input.pageName,
        svg: input.svg,
        width: input.width,
        height: input.height
      })
      const metadata = artifactMetadata(document, {
        revision,
        snapshotChecksum: currentChecksum,
        pageId: normalizeOptional(input.pageId),
        pageName: normalizeOptional(input.pageName),
        viewerVersion: rendered.viewerVersion
      })

      stage = 'artifact'
      const artifact =
        (await this.findCanvasArtifact(artifacts, input.documentId)) ??
        (await artifacts.createArtifact({
          source: {
            pluginName: CANVAS_PLUGIN_NAME,
            resourceType: CANVAS_ARTIFACT_RESOURCE_TYPE,
            resourceId: input.documentId,
            checksum: currentChecksum
          },
          kind: 'html',
          title: document.title,
          description: document.description,
          scope: artifactRuntimeScope(document, scope),
          metadata
        }))

      stage = 'artifact_version_lookup'
      const [existingVersion] = await artifacts.listArtifactVersions({
        artifactId: artifact.id,
        idempotencyKey: rendered.sha256,
        status: 'active'
      })
      let workspaceFileRef = existingVersion?.workspaceFileRef ?? null
      if (!workspaceFileRef) {
        stage = 'workspace_file'
        const workspaceScope = resolveCanvasArtifactWorkspaceScope(document, scope)
        const workspaceName = `${rendered.sha256}.html`
        const file = await workspaceFiles.uploadBuffer({
          ...workspaceScope,
          buffer: rendered.buffer,
          originalName: workspaceName,
          fileName: workspaceName,
          mimeType: rendered.mimeType,
          size: rendered.size,
          folder: `files/canvas/artifacts/${input.documentId}`,
          metadata: {
            documentType: 'canvas-artifact-viewer',
            documentId: input.documentId,
            revision,
            pageId: normalizeOptional(input.pageId),
            viewerVersion: rendered.viewerVersion
          }
        })
        workspaceFileRef = toCanvasWorkspacePortableReference(file, workspaceScope, workspaceName, rendered)
      }

      stage = 'artifact_version'
      const versionResult = await artifacts.ensureArtifactVersion({
        artifactId: artifact.id,
        idempotencyKey: rendered.sha256,
        workspaceFileRef,
        mimeType: rendered.mimeType,
        fileName: normalizeArtifactFileName(document.title),
        title: document.title,
        description: document.description,
        size: rendered.size,
        sha256: rendered.sha256,
        sourceVersionId: `working-r${revision}`,
        checksum: rendered.checksum,
        setCurrent: true,
        metadata
      })

      stage = 'artifact_share'
      const shareResult = await artifacts.ensureArtifactShare({
        artifactId: artifact.id,
        shareKey: CANVAS_ARTIFACT_SHARE_KEY,
        artifactVersionId: targetMode === 'version' ? versionResult.version.id : null,
        versionMode: targetMode,
        access: {
          mode: accessMode,
          userConfirmedPublicLink: accessMode === 'public_link' ? true : null
        },
        presentation: { disposition: 'inline', allowDownload: false, safeHtmlProfile: 'interactive' },
        metadata
      })
      await this.writeLog(scope, document, {
        action: 'artifact_published',
        message: 'Published Canvas read-only Artifact.',
        snapshot: {
          revision,
          accessMode,
          targetMode,
          artifactId: artifact.id,
          artifactVersionId: versionResult.version.id,
          versionOutcome: versionResult.outcome,
          shareOutcome: shareResult.outcome
        }
      })
      return compactArtifactShare(
        input.documentId,
        { ...shareResult.link, version: shareResult.link.version ?? versionResult.version },
        shareResult.outcome === 'reused' && versionResult.outcome === 'reused'
      )
    } catch (error) {
      await this.writeLog(scope, document, {
        action: 'artifact_share_failed',
        message: `Canvas Artifact publish failed at ${stage}.`,
        errorMessage: error instanceof Error ? error.message : String(error),
        snapshot: { revision, accessMode, targetMode, stage }
      }).catch(() => undefined)
      throw error
    }
  }

  async revoke(scope: CanvasScope, documentId: string) {
    const document = await this.requireDocument(scope, documentId)
    const artifacts = this.artifacts()
    const artifact = await this.findCanvasArtifact(artifacts, documentId)
    if (!artifact) return { documentId, revoked: false, message: 'Canvas document has no active Artifact share.' }
    const revoked = await artifacts.revokeArtifactShare({ artifactId: artifact.id, shareKey: CANVAS_ARTIFACT_SHARE_KEY })
    if (!revoked) return { documentId, revoked: false, message: 'Canvas document has no active Artifact share.' }
    await this.writeLog(scope, document, {
      action: 'artifact_share_revoked',
      message: 'Revoked Canvas Artifact share.'
    })
    return { documentId, revoked: true, message: 'Canvas Artifact share was revoked.' }
  }

  async archiveForDocument(scope: CanvasScope, document: CanvasDocument) {
    const artifacts = this.optionalArtifacts()
    if (!artifacts || !document.id) return false
    const artifact = await this.findCanvasArtifact(artifacts, document.id)
    if (!artifact) return false
    await artifacts.revokeArtifactShare({ artifactId: artifact.id, shareKey: CANVAS_ARTIFACT_SHARE_KEY }).catch((error) => {
      if (!isMissingArtifactError(error)) throw error
    })
    await artifacts.archiveArtifact(artifact.id).catch((error) => {
      if (!isMissingArtifactError(error)) throw error
    })
    return true
  }

  async deleteForDocument(scope: CanvasScope, document: CanvasDocument) {
    const artifacts = this.optionalArtifacts()
    if (!artifacts || !document.id) return false
    const artifact = await this.findCanvasArtifact(artifacts, document.id, true)
    if (!artifact) return false
    const versions = await artifacts.listArtifactVersions({ artifactId: artifact.id, status: 'all' }).catch(() => [] as ArtifactVersionRecord[])
    await artifacts.revokeArtifactShare({ artifactId: artifact.id, shareKey: CANVAS_ARTIFACT_SHARE_KEY }).catch((error) => {
      if (!isMissingArtifactError(error)) throw error
    })
    await artifacts.deleteArtifact(artifact.id).catch((error) => {
      if (!isMissingArtifactError(error)) throw error
    })
    const files = this.optionalWorkspaceFiles()
    if (files) {
      await Promise.all(versions.map(async (version) => {
        const reference = version.workspaceFileRef
        if (!reference?.filePath) return
        await files.deleteFile(reference).catch(() => undefined)
      }))
    }
    return true
  }

  private artifacts() {
    const artifacts = this.optionalArtifacts()
    if (!artifacts) throw new BadRequestException('Platform Artifacts capability is not available.')
    return artifacts
  }

  private workspaceFiles() {
    const files = this.optionalWorkspaceFiles()
    if (!files) throw new BadRequestException('Platform Workspace Files capability is not available.')
    return files
  }

  private optionalArtifacts() {
    return this.runtimeCapabilities?.get(ArtifactsRuntimeCapability) as ArtifactsApi | undefined
  }

  private optionalWorkspaceFiles() {
    return this.runtimeCapabilities?.get(WorkspaceFilesRuntimeCapability) as WorkspaceFilesApi | undefined
  }

  private findCanvasArtifact(artifacts: ArtifactsApi, documentId: string, includeDeleted = false) {
    return artifacts.findArtifactBySource({
      pluginName: CANVAS_PLUGIN_NAME,
      resourceType: CANVAS_ARTIFACT_RESOURCE_TYPE,
      resourceId: documentId,
      includeDeleted
    })
  }

  private async requireDocument(scope: CanvasScope, documentId: string) {
    const normalizedId = normalizeRequired(documentId, 'Canvas document id is required.')
    const document = await this.documentRepository.findOne({
      where: scopedWhere(scope, { id: normalizedId }) as FindOptionsWhere<CanvasDocument>
    })
    if (!document) throw new NotFoundException('Canvas document was not found.')
    return document
  }

  private writeLog(
    scope: CanvasScope,
    document: CanvasDocument,
    input: {
      action: 'artifact_published' | 'artifact_share_revoked' | 'artifact_share_failed'
      message: string
      errorMessage?: string
      snapshot?: CanvasJsonObject
    }
  ) {
    return this.logRepository.save(this.logRepository.create({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId ?? null,
      workspaceId: scope.workspaceId ?? null,
      projectId: scope.projectId ?? null,
      documentId: document.id,
      versionId: document.currentVersionId ?? null,
      action: input.action,
      actorType: 'user',
      actorId: scope.userId ?? null,
      message: input.message,
      errorMessage: input.errorMessage,
      snapshot: input.snapshot
    }))
  }
}

export function resolveCanvasArtifactWorkspaceScope(document: CanvasDocument, scope: CanvasScope): CanvasArtifactWorkspaceScope {
  const tenantId = document.tenantId ?? scope.tenantId
  const userId = normalizeRequired(scope.userId ?? document.createdById, 'Canvas Artifact publishing requires a user-scoped operation.')
  const projectId = document.projectId ?? scope.projectId ?? null
  const xpertId = document.assistantId ?? scope.assistantId ?? null
  const catalog = document.workspaceCatalog ?? (projectId ? 'projects' : 'xperts')
  const scopeId = document.workspaceScopeId ?? (catalog === 'projects' ? projectId : xpertId)
  if (!scopeId) throw new BadRequestException('Canvas Artifact publishing requires a project or Xpert workspace scope.')
  return {
    tenantId,
    userId,
    catalog,
    scopeId,
    projectId: catalog === 'projects' ? scopeId : null,
    xpertId: catalog === 'xperts' ? scopeId : null,
    isolateByUser: catalog === 'xperts' ? false : null
  }
}

export function toCanvasWorkspacePortableReference(
  file: WorkspaceFile,
  scope: CanvasArtifactWorkspaceScope,
  originalName: string,
  rendered: { mimeType: string; size: number }
): WorkspacePortableFileReference {
  return {
    source: WORKSPACE_FILES_SOURCE,
    ...scope,
    filePath: file.filePath,
    workspacePath: file.workspacePath,
    originalName,
    name: file.name,
    mimeType: file.mimeType ?? rendered.mimeType,
    size: file.size ?? rendered.size
  }
}

function artifactRuntimeScope(document: CanvasDocument, scope: CanvasScope) {
  return {
    tenantId: document.tenantId ?? scope.tenantId,
    organizationId: document.organizationId ?? scope.organizationId ?? null,
    userId: scope.userId ?? document.createdById ?? null,
    workspaceId: document.workspaceId ?? scope.workspaceId ?? null,
    projectId: document.projectId ?? scope.projectId ?? null,
    xpertId: document.assistantId ?? scope.assistantId ?? null
  }
}

function artifactMetadata(
  document: CanvasDocument,
  input: {
    revision: number
    snapshotChecksum?: string
    pageId?: string
    pageName?: string
    viewerVersion: number
  }
) {
  return {
    canvasDocumentId: document.id,
    canvasVersionId: document.currentVersionId ?? null,
    canvasVersionNumber: document.currentVersionNumber ?? 0,
    workingCopyRevision: input.revision,
    snapshotChecksum: input.snapshotChecksum ?? null,
    pageId: input.pageId ?? null,
    pageName: input.pageName ?? null,
    viewerVersion: input.viewerVersion,
    renderer: 'tldraw-svg'
  }
}

function compactArtifactShare(documentId: string, link: ArtifactLinkRecord, reused = true) {
  const publicUrl = normalizeRequired(link.publicUrl, 'Platform Artifacts did not return a public URL.')
  const metadata = link.metadata ?? {}
  return {
    documentId,
    artifactId: link.artifactId,
    artifactVersionId: link.artifactVersionId ?? link.version?.id ?? null,
    artifactLinkId: link.id,
    shareKey: link.shareKey ?? CANVAS_ARTIFACT_SHARE_KEY,
    shareUrl: publicUrl,
    publicUrl,
    accessMode: link.accessMode,
    versionMode: link.versionMode,
    status: link.status,
    allowDownload: link.allowDownload,
    revision: readMetadataNumber(metadata, 'workingCopyRevision'),
    snapshotChecksum: readMetadataString(metadata, 'snapshotChecksum'),
    pageId: readMetadataString(metadata, 'pageId'),
    createdAt: link.createdAt ?? null,
    updatedAt: link.updatedAt ?? null,
    reused
  }
}

function normalizeArtifactAccessMode(value: ArtifactAccessMode | null | undefined): ArtifactAccessMode {
  const normalized = value ?? 'public_link'
  if (normalized === 'public_link' || normalized === 'organization_all' || normalized === 'workspace_all') return normalized
  throw new BadRequestException(`Unsupported Canvas Artifact access mode: ${String(normalized)}`)
}

function normalizeArtifactFileName(value: string | null | undefined) {
  const base = (value ?? 'canvas')
    .replace(/[\u0000-\u001f<>:"/\\|?*\u007f]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'canvas'
  return `${base}.html`
}

function scopedWhere<T extends object>(scope: CanvasScope, extra: T): T & Partial<ScopedEntity> {
  const where: Partial<ScopedEntity> = { tenantId: scope.tenantId }
  if (scope.organizationId != null) where.organizationId = scope.organizationId
  if (scope.projectId != null) where.projectId = scope.projectId
  else if (scope.workspaceId != null) where.workspaceId = scope.workspaceId
  return { ...where, ...extra }
}

function normalizeRevision(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new BadRequestException('Canvas Artifact baseRevision must be a non-negative integer.')
  return value
}

function normalizeRequired(value: string | null | undefined, message: string) {
  const normalized = value?.trim()
  if (!normalized) throw new BadRequestException(message)
  return normalized
}

function normalizeOptional(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized || undefined
}

function readMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'string' ? value : null
}

function readMetadataNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isMissingArtifactError(error: unknown) {
  return error instanceof Error && /not found|does not exist|already deleted/i.test(error.message)
}
