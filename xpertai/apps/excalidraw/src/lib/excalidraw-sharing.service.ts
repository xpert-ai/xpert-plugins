import { BadRequestException, ConflictException } from '@nestjs/common'
import { type ArtifactAccessMode, type ArtifactLinkVersionMode } from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { EXCALIDRAW_PLUGIN_NAME } from './constants.js'
import { ExcalidrawArtifactPublication } from './entities/index.js'
import type { ExcalidrawScope } from './types.js'

import {
  artifactMetadata,
  artifactScope,
  compactArtifactShare,
  explicitWorkspaceScope,
  normalizeArtifactAccessMode,
  normalizeArtifactPublicUrl,
  normalizeHtmlFileName,
  portableReference,
  scopedCreate,
  scopedWhere,
  drawingChildrenScope,
  validateScene
} from './excalidraw-service.utils.js'
import type { ExcalidrawService } from './excalidraw.service.js'

type SharingPorts = {
  publicationRepository: Repository<ExcalidrawArtifactPublication>
  requireCanonicalDrawing: ExcalidrawService['requireCanonicalDrawing']
  getCurrentVersion: ExcalidrawService['getCurrentVersion']
  workspaceFiles: ExcalidrawService['workspaceFiles']
  artifacts: ExcalidrawService['artifacts']
  artifactViewer: ExcalidrawService['artifactViewer']
  revokeArtifactLinkBestEffort: ExcalidrawService['revokeArtifactLinkBestEffort']
}

export class ExcalidrawSharingService {
  constructor(private readonly ports: SharingPorts) {}
  async publishDrawingViewerArtifact(
    scope: ExcalidrawScope,
    input: {
      drawingId: string
      expectedRevision?: number
      versionMode?: ArtifactLinkVersionMode | null
      accessMode?: ArtifactAccessMode | null
      userConfirmedPublicLink?: boolean | null
      publicLinkAuthorization?: 'application_policy'
    }
  ) {
    const drawing = await this.ports.requireCanonicalDrawing(scope, input.drawingId)
    if (input.expectedRevision !== undefined && input.expectedRevision !== (drawing.revision ?? 0))
      throw new ConflictException('scene_revision_conflict')
    const accessMode = normalizeArtifactAccessMode(input.accessMode)
    if (accessMode === 'public_link' && input.userConfirmedPublicLink !== true && input.publicLinkAuthorization !== 'application_policy') {
      throw new BadRequestException('Public Artifact sharing requires explicit user confirmation.')
    }
    const workspaceFiles = this.ports.workspaceFiles()
    const artifacts = this.ports.artifacts()
    const versionMode = input.versionMode === 'version' ? 'version' : 'latest'
    const allowDownload = false
    const currentVersion = await this.ports.getCurrentVersion(scope, drawing)
    const scene = validateScene(
      {
        elements: currentVersion?.elements ?? [],
        appState: currentVersion?.appState ?? {},
        files: currentVersion?.files ?? {}
      },
      'Published Excalidraw scene'
    )
    const rendered = await this.ports.artifactViewer().render({
      title: drawing.title,
      description: drawing.description,
      revision: drawing.revision ?? 0,
      versionNumber: drawing.currentVersionNumber ?? currentVersion?.versionNumber ?? 0,
      scene
    })
    if (
      input.expectedRevision !== undefined &&
      (await this.ports.requireCanonicalDrawing(scope, input.drawingId)).revision !== input.expectedRevision
    )
      throw new ConflictException('scene_revision_conflict')
    const checksum = rendered.checksum
    const active = await this.ports.publicationRepository.findOne({
      where: scopedWhere(drawingChildrenScope(scope), { drawingId: input.drawingId, status: 'active' }),
      order: { createdAt: 'DESC' }
    })
    const canReuseContent = Boolean(
      active?.checksum === checksum && active.mimeType === 'text/html' && active.artifactId && active.artifactVersionId
    )

    const assertSourceRevision = async () => {
      if (
        input.expectedRevision !== undefined &&
        (await this.ports.requireCanonicalDrawing(scope, input.drawingId)).revision !== input.expectedRevision
      )
        throw new ConflictException('scene_revision_conflict')
    }
    const createLink = async (artifactId: string, artifactVersionId: string) => {
      await assertSourceRevision()
      return artifacts.createArtifactLink({
        artifactId,
        artifactVersionId: versionMode === 'version' ? artifactVersionId : null,
        versionMode,
        access: {
          mode: accessMode,
          ...(input.publicLinkAuthorization === 'application_policy'
            ? { publicLinkAuthorization: 'application_policy' as const }
            : { userConfirmedPublicLink: input.userConfirmedPublicLink })
        },
        presentation: { disposition: 'inline', allowDownload, safeHtmlProfile: 'interactive' },
        metadata: artifactMetadata(drawing, {
          collaborationSequence: drawing.revision ?? 0,
          viewerVersion: rendered.viewerVersion
        })
      })
    }
    const updateLink = async (linkId: string, artifactVersionId: string) => {
      await assertSourceRevision()
      return artifacts.updateArtifactLinkAccess(linkId, {
        artifactVersionId: versionMode === 'version' ? artifactVersionId : null,
        versionMode,
        access: {
          mode: accessMode,
          ...(input.publicLinkAuthorization === 'application_policy'
            ? { publicLinkAuthorization: 'application_policy' as const }
            : { userConfirmedPublicLink: input.userConfirmedPublicLink })
        },
        presentation: { disposition: 'inline', allowDownload, safeHtmlProfile: 'interactive' }
      })
    }
    const updateOrReplaceLink = async (linkId: string, artifactId: string, artifactVersionId: string) => {
      try {
        return await updateLink(linkId, artifactVersionId)
      } catch {
        return createLink(artifactId, artifactVersionId)
      }
    }

    if (canReuseContent && active) {
      const settingsMatch = Boolean(
        active.artifactLinkId &&
          normalizeArtifactPublicUrl(active.publicUrl) &&
          active.artifactLinkVersionMode === versionMode &&
          active.artifactLinkAccessMode === accessMode &&
          active.allowDownload === allowDownload
      )
      if (settingsMatch) {
        return compactArtifactShare(active, 'Excalidraw Artifact share link is ready.')
      }
      const previousLinkId = active.artifactLinkId
      const link =
        previousLinkId && normalizeArtifactPublicUrl(active.publicUrl)
          ? await updateOrReplaceLink(previousLinkId, active.artifactId, active.artifactVersionId)
          : await createLink(active.artifactId, active.artifactVersionId)
      active.artifactLinkId = link.id
      active.artifactLinkVersionMode = link.versionMode
      active.artifactLinkAccessMode = link.accessMode
      active.allowDownload = link.allowDownload
      active.publicUrl = link.publicUrl
      active.sharedAt = new Date()
      await this.ports.publicationRepository.save(active)
      if (previousLinkId && previousLinkId !== link.id) await this.ports.revokeArtifactLinkBestEffort(previousLinkId)
      return compactArtifactShare(active, 'Excalidraw Artifact share link is ready.')
    }

    const workspaceFileName = `${checksum}.html`
    const artifactFileName = normalizeHtmlFileName(drawing.title)
    const workspaceScope = explicitWorkspaceScope(drawing, scope)
    const file = await workspaceFiles.uploadBuffer({
      ...workspaceScope,
      buffer: rendered.buffer,
      originalName: workspaceFileName,
      mimeType: rendered.mimeType,
      size: rendered.size,
      folder: `files/excalidraw/artifacts/${input.drawingId}`
    })
    const fileReference = portableReference(file, workspaceScope, workspaceFileName, rendered.size, rendered.mimeType)
    const artifact = await artifacts.createArtifact({
      source: {
        pluginName: EXCALIDRAW_PLUGIN_NAME,
        resourceType: 'excalidraw_drawing_viewer',
        resourceId: input.drawingId,
        checksum
      },
      kind: 'html',
      title: drawing.title,
      description: drawing.description,
      scope: artifactScope(drawing, scope),
      metadata: artifactMetadata(drawing, {
        collaborationSequence: drawing.revision ?? 0,
        viewerVersion: rendered.viewerVersion
      })
    })
    const artifactVersion = await artifacts.createArtifactVersion({
      artifactId: artifact.id,
      workspaceFileRef: fileReference,
      mimeType: rendered.mimeType,
      fileName: artifactFileName,
      title: drawing.title,
      description: drawing.description,
      size: rendered.size,
      sha256: rendered.sha256,
      sourceVersionId: drawing.currentVersionId ?? `working-r${drawing.revision ?? 0}`,
      checksum,
      setCurrent: true,
      metadata: artifactMetadata(drawing, {
        collaborationSequence: drawing.revision ?? 0,
        viewerVersion: rendered.viewerVersion
      })
    })
    const publication = this.ports.publicationRepository.create({
      ...scopedCreate(scope),
      userId: scope.userId ?? null,
      drawingId: input.drawingId,
      collaborationSequence: drawing.revision ?? 0,
      sourceVersionId: drawing.currentVersionId ?? null,
      checksum,
      fileName: artifactFileName,
      mimeType: rendered.mimeType,
      size: rendered.size,
      sha256: rendered.sha256,
      workspaceFileReference: fileReference,
      artifactId: artifact.id,
      artifactVersionId: artifactVersion.id,
      artifactLinkVersionMode: versionMode,
      artifactLinkAccessMode: accessMode,
      allowDownload,
      status: 'active',
      createdById: scope.userId ?? null
    })

    const canUpdateHtmlLink = Boolean(
      active?.mimeType === 'text/html' &&
        active.artifactId === artifact.id &&
        active?.artifactLinkId &&
        normalizeArtifactPublicUrl(active.publicUrl)
    )
    const link =
      canUpdateHtmlLink && active?.artifactLinkId
        ? await updateOrReplaceLink(active.artifactLinkId, artifact.id, artifactVersion.id)
        : await createLink(artifact.id, artifactVersion.id)
    publication.artifactLinkId = link.id
    publication.artifactLinkVersionMode = link.versionMode
    publication.artifactLinkAccessMode = link.accessMode
    publication.allowDownload = link.allowDownload
    publication.publicUrl = link.publicUrl
    publication.sharedAt = new Date()

    const saved = await this.ports.publicationRepository.save(publication)
    if (active?.id) {
      active.status = 'superseded'
      await this.ports.publicationRepository.save(active)
    }
    if (active?.artifactLinkId && active.artifactLinkId !== link.id) {
      await this.ports.revokeArtifactLinkBestEffort(active.artifactLinkId)
    }
    if (active?.mimeType === 'image/svg+xml') {
      if (active.artifactId !== artifact.id) await artifacts.deleteArtifact(active.artifactId).catch(() => undefined)
      await workspaceFiles.deleteFile(active.workspaceFileReference).catch(() => undefined)
    }
    return compactArtifactShare(saved, 'Excalidraw Artifact share link is ready.')
  }

  async revokeArtifactShare(scope: ExcalidrawScope, drawingId: string) {
    await this.ports.requireCanonicalDrawing(scope, drawingId)
    const active = await this.ports.publicationRepository.findOne({
      where: scopedWhere(drawingChildrenScope(scope), { drawingId, status: 'active' }),
      order: { createdAt: 'DESC' }
    })
    if (!active) return { message: 'Excalidraw drawing has no active Artifact share.', drawingId, revoked: false }
    if (active.artifactLinkId) await this.ports.artifacts().revokeArtifactLink(active.artifactLinkId)
    active.status = 'revoked'
    active.publicUrl = null
    await this.ports.publicationRepository.save(active)
    return { message: 'Excalidraw Artifact share was revoked.', drawingId, revoked: true }
  }
}
