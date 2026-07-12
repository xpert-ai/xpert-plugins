import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import { Repository } from 'typeorm'
import * as Y from 'yjs'
import {
  ArtifactsRuntimeCapability,
  CollaborationRuntimeCapability,
  WorkspaceFilesRuntimeCapability,
  WORKSPACE_FILES_SOURCE,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type ArtifactAccessMode,
  type ArtifactLinkVersionMode,
  type CollaborationMaterializationEvent,
  type CollaborationProviderContext,
  type RuntimeCapabilityRegistry,
  type WorkspaceFile,
  type WorkspacePortableFileReference
} from '@xpert-ai/plugin-sdk'
import { EXCALIDRAW_COLLABORATION_PROVIDER_KEY, EXCALIDRAW_PLUGIN_NAME } from './constants.js'
import { ExcalidrawActionLog, ExcalidrawArtifactPublication, ExcalidrawDrawing, ExcalidrawDrawingVersion } from './entities/index.js'
import { createExcalidrawYDoc, EXCALIDRAW_YJS_SCHEMA_VERSION, materializeExcalidrawYDoc, writeExcalidrawSceneToYDoc } from './excalidraw-yjs.js'
import {
  createStableJsonSignature,
  ExcalidrawSceneValidationError,
  isPlainObject,
  normalizeExcalidrawScene,
  type NormalizedExcalidrawScene
} from './excalidraw-scene.validation.js'
import { buildAgentDrawingResponse, buildAgentSceneItemResponse } from './excalidraw-agent-response.js'
import { ExcalidrawArtifactViewerService } from './excalidraw-artifact-viewer.service.js'
import type {
  CreateExcalidrawDrawingInput,
  ExcalidrawActionType,
  ExcalidrawActorType,
  GetExcalidrawDrawingInput,
  GetExcalidrawSceneItemInput,
  ExcalidrawScope,
  ExcalidrawSceneInput,
  ExcalidrawVersionSource,
  PatchExcalidrawSceneInput,
  ReportExcalidrawFailureInput,
  SaveExcalidrawMermaidDraftInput,
  SaveExcalidrawSceneVersionInput,
  SearchExcalidrawDrawingsInput,
  UpdateExcalidrawDrawingStatusInput
} from './types.js'

type ScopedEntity = {
  tenantId?: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
}

@Injectable()
export class ExcalidrawService {
  constructor(
    @InjectRepository(ExcalidrawDrawing)
    private readonly drawingRepository: Repository<ExcalidrawDrawing>,
    @InjectRepository(ExcalidrawDrawingVersion)
    private readonly versionRepository: Repository<ExcalidrawDrawingVersion>,
    @InjectRepository(ExcalidrawActionLog)
    private readonly logRepository: Repository<ExcalidrawActionLog>,
    @InjectRepository(ExcalidrawArtifactPublication)
    private readonly publicationRepository: Repository<ExcalidrawArtifactPublication>,
    @Optional() @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: RuntimeCapabilityRegistry,
    @Optional()
    private readonly artifactViewerService?: ExcalidrawArtifactViewerService
  ) {}

  async createDrawing(scope: ExcalidrawScope, input: CreateExcalidrawDrawingInput) {
    const title = normalizeRequired(input.title, 'Drawing title is required.')
    const initialScene = hasSceneContent(input)
      ? validateScene(
          {
            elements: input.elements,
            appState: input.appState,
            files: input.files
          },
          'Initial Excalidraw scene'
        )
      : null
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
      message: `Drawing "${title}" was created.`,
      snapshot: { title, kind: drawing.kind, source: drawing.source }
    })

    if (initialScene) {
      await this.createVersion(scope, drawing, {
        sourceType: input.mermaidSource ? 'agent_mermaid' : 'agent_json',
        elements: initialScene.elements,
        appState: initialScene.appState,
        files: initialScene.files,
        mermaidSource: normalizeNullableText(input.mermaidSource),
        changeSummary: normalizeOptional(input.changeSummary) ?? 'Initial scene'
      })
    }

    return this.getDrawing(scope, drawing.id as string)
  }

  async saveSceneVersion(scope: ExcalidrawScope, input: SaveExcalidrawSceneVersionInput) {
    let drawing = await this.requireDrawing(scope, input.drawingId)
    let sceneInput: ExcalidrawSceneInput = input
    if (this.collaborationOrNull()) {
      await this.replaceCollaborativeScene(scope, drawing, input, `excalidraw:${input.sourceType ?? 'agent_json'}:checkpoint`)
      drawing = await this.requireCanonicalDrawing(scope, input.drawingId)
      const working = await this.getCurrentVersion(scope, drawing)
      sceneInput = {
        elements: working?.elements,
        appState: working?.appState,
        files: working?.files,
        mermaidSource: working?.mermaidSource
      }
    }
    const version = await this.createVersion(scope, drawing, {
      sourceType: input.sourceType ?? 'agent_json',
      elements: sceneInput.elements,
      appState: sceneInput.appState,
      files: sceneInput.files,
      mermaidSource: normalizeNullableText(sceneInput.mermaidSource),
      changeSummary: normalizeOptional(input.changeSummary)
    })

    return {
      success: true,
      message: 'Excalidraw scene version was saved.',
      drawing: await this.getDrawing(scope, drawing.id as string),
      version
    }
  }

  async saveCurrentScene(scope: ExcalidrawScope, input: SaveExcalidrawSceneVersionInput) {
    const drawing = await this.requireDrawing(scope, input.drawingId)
    if (this.collaborationOrNull()) {
      const version = await this.replaceCollaborativeScene(
        scope,
        drawing,
        input,
        `excalidraw:${input.sourceType ?? 'agent_json'}:save-current`
      )
      return {
        success: true,
        message: 'Excalidraw collaborative scene was synchronized.',
        drawing: await this.getDrawing(scope, drawing.id as string),
        version
      }
    }
    const version = await this.updateCurrentVersion(scope, drawing, {
      sourceType: input.sourceType ?? 'agent_json',
      elements: input.elements,
      appState: input.appState,
      files: input.files,
      mermaidSource: normalizeNullableText(input.mermaidSource),
      changeSummary: normalizeOptional(input.changeSummary)
    })

    return {
      success: true,
      message: 'Excalidraw current scene was saved.',
      drawing: await this.getDrawing(scope, drawing.id as string),
      version
    }
  }

  async patchScene(scope: ExcalidrawScope, input: PatchExcalidrawSceneInput) {
    const drawing = this.collaborationOrNull()
      ? await this.requireCanonicalDrawing(scope, input.drawingId)
      : await this.requireDrawing(scope, input.drawingId)
    const currentVersion = await this.getCurrentVersion(scope, drawing)
    const currentScene = validateScene(
      {
        elements: currentVersion?.elements,
        appState: currentVersion?.appState,
        files: currentVersion?.files
      },
      'Current Excalidraw scene'
    )
    const patch = applyElementPatch(currentScene.elements, input)
    const appState = {
      ...currentScene.appState,
      ...(isPlainObject(input.appStatePatch) ? input.appStatePatch : {})
    }
    const files = input.files === undefined ? currentScene.files : normalizeObject(input.files)
    const mermaidSource =
      input.mermaidSource === undefined
        ? normalizeNullableText(currentVersion?.mermaidSource)
        : normalizeNullableText(input.mermaidSource)
    const beforeSignature = createStableJsonSignature({
      elements: currentScene.elements,
      appState: currentScene.appState,
      files: currentScene.files,
      mermaidSource: normalizeNullableText(currentVersion?.mermaidSource)
    })
    const afterSignature = createStableJsonSignature({
      elements: patch.elements,
      appState,
      files,
      mermaidSource
    })
    if (beforeSignature === afterSignature) {
      throw new BadRequestException('Excalidraw scene patch did not change the current scene.')
    }

    const version = await this.updateCurrentVersion(scope, drawing, {
      sourceType: 'agent_patch',
      elements: patch.elements,
      appState,
      files,
      mermaidSource,
      changeSummary: normalizeOptional(input.changeSummary) ?? 'Agent patch'
    })

    await this.writeLog(scope, {
      drawingId: drawing.id,
      versionId: version.id,
      action: 'scene_patched',
      actorType: 'agent',
      message: input.changeSummary,
      snapshot: {
        addCount: patch.addedIds.length,
        updateCount: patch.updatedIds.length,
        deleteCount: patch.deletedIds.length,
        addedIds: patch.addedIds,
        updatedIds: patch.updatedIds,
        deletedIds: patch.deletedIds
      }
    })

    return {
      success: true,
      message: 'Excalidraw scene patch updated the current version.',
      drawing: await this.getDrawing(scope, drawing.id as string),
      version,
      patch: {
        addCount: patch.addedIds.length,
        updateCount: patch.updatedIds.length,
        deleteCount: patch.deletedIds.length,
        addedIds: patch.addedIds,
        updatedIds: patch.updatedIds,
        deletedIds: patch.deletedIds
      }
    }
  }

  async saveMermaidDraft(scope: ExcalidrawScope, input: SaveExcalidrawMermaidDraftInput) {
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

    const version = await this.updateCurrentVersion(scope, drawing, {
      sourceType: 'agent_mermaid',
      elements: [],
      appState: {},
      files: {},
      mermaidSource,
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
      message: 'Mermaid draft was saved. The Excalidraw workbench will convert and update the current scene.',
      drawing: await this.getDrawing(scope, drawing.id as string),
      version
    }
  }

  async searchDrawings(scope: ExcalidrawScope, query: SearchExcalidrawDrawingsInput = {}) {
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

  async getDrawing(scope: ExcalidrawScope, drawingId: string) {
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
      this.publicationRepository.findOne({
        where: scopedWhere(scope, { drawingId, status: 'active' }),
        order: { createdAt: 'DESC' }
      })
    ])
    const currentVersion = versions.find((version) => version.id === drawing.currentVersionId) ?? versions[0] ?? null

    return {
      item: drawing,
      currentVersion,
      versions,
      logs,
      artifactShare: artifactShare ? compactArtifactShare(artifactShare) : null,
      total: versions.length,
      summary: {
        versionCount: versions.length,
        currentVersionNumber: drawing.currentVersionNumber ?? currentVersion?.versionNumber ?? 0,
        hasMermaidDraft: versions.some((version) => Boolean(version.mermaidSource))
      }
    }
  }

  async getDrawingForAgent(scope: ExcalidrawScope, input: GetExcalidrawDrawingInput) {
    const payload = await this.getDrawing(scope, input.drawingId)
    const sceneVersion = selectRequestedVersion(payload, input)
    return buildAgentDrawingResponse(payload, input, sceneVersion)
  }

  async getSceneItemForAgent(scope: ExcalidrawScope, input: GetExcalidrawSceneItemInput) {
    const payload = await this.getDrawing(scope, input.drawingId)
    const version = selectRequestedVersion(payload, input)
    if (!version) {
      throw new NotFoundException('Requested Excalidraw drawing version was not found.')
    }
    if (input.itemType === 'element') {
      const elementId = normalizeRequired(input.elementId, 'Element id is required when itemType is element.')
      const elements = Array.isArray(version.elements) ? version.elements : []
      const element = elements.find((candidate) => readElementId(candidate) === elementId)
      if (!element) {
        throw new NotFoundException('Requested Excalidraw element was not found.')
      }
      return buildAgentSceneItemResponse(version, { ...input, elementId })
    }
    if (input.itemType === 'file') {
      const fileId = normalizeRequired(input.fileId, 'File id is required when itemType is file.')
      const files = isPlainObject(version.files) ? version.files : {}
      if (!isPlainObject(files[fileId])) {
        throw new NotFoundException('Requested Excalidraw file was not found.')
      }
      return buildAgentSceneItemResponse(version, { ...input, fileId })
    }
    return buildAgentSceneItemResponse(version, input)
  }

  async getWorkbenchData(scope: ExcalidrawScope, query: SearchExcalidrawDrawingsInput & { drawingId?: string } = {}) {
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

  async createCollaborationSession(scope: ExcalidrawScope, drawingId: string) {
    const drawing = await this.requireDrawing(scope, drawingId)
    if (drawing.status === 'archived') throw new BadRequestException('Archived Excalidraw drawings are read-only.')
    const collaboration = this.collaboration()
    const document = await collaboration.ensureDocument({
      providerKey: EXCALIDRAW_COLLABORATION_PROVIDER_KEY,
      resourceId: drawingId,
      schemaVersion: EXCALIDRAW_YJS_SCHEMA_VERSION,
      metadata: { kind: drawing.kind ?? 'diagram' }
    })
    const session = await collaboration.createSession({ documentId: document.id, access: 'write' })
    return { ...session, drawingId, revision: document.sequenceNumber }
  }

  async authorizeCollaborationDocument(context: CollaborationProviderContext) {
    const drawing = await this.drawingRepository.findOne({
      where: scopedWhere(collaborationScope(context), { id: context.resourceId })
    })
    if (!drawing) return false
    return context.operation !== 'write' || drawing.status !== 'archived'
  }

  async initializeCollaborationDocument(context: CollaborationProviderContext) {
    const scope = collaborationScope(context)
    const drawing = await this.requireDrawing(scope, context.resourceId)
    const version = await this.getCurrentVersion(scope, drawing)
    const scene = validateScene({
      elements: version?.elements,
      appState: version?.appState,
      files: version?.files
    }, 'Collaborative Excalidraw scene')
    const doc = createExcalidrawYDoc({
      ...scene,
      mermaidSource: normalizeNullableText(version?.mermaidSource)
    })
    return {
      stateBase64: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
      schemaVersion: EXCALIDRAW_YJS_SCHEMA_VERSION,
      initialSequence: Math.max(drawing.revision ?? 0, drawing.currentVersionNumber ?? 0),
      metadata: { kind: drawing.kind ?? 'diagram' }
    }
  }

  async materializeCollaborationDocument(event: CollaborationMaterializationEvent) {
    const scope = collaborationScope(event)
    const doc = new Y.Doc()
    Y.applyUpdate(doc, Buffer.from(event.stateBase64, 'base64'))
    const materialized = materializeExcalidrawYDoc(doc)
    const scene = validateScene(materialized, 'Collaborative Excalidraw scene')
    await this.drawingRepository.manager.transaction(async (manager) => {
      const drawingRepository = manager.getRepository(ExcalidrawDrawing)
      const versionRepository = manager.getRepository(ExcalidrawDrawingVersion)
      const drawing = await drawingRepository.findOne({
        where: scopedWhere(scope, { id: event.resourceId }),
        lock: { mode: 'pessimistic_write' }
      })
      if (!drawing) throw new NotFoundException('Excalidraw drawing was not found during collaboration materialization.')
      let version = drawing.currentVersionId
        ? await versionRepository.findOne({ where: scopedWhere(scope, { id: drawing.currentVersionId, drawingId: event.resourceId }) })
        : null
      if (version) {
        version = await versionRepository.save({
          ...version,
          sourceType: 'workbench',
          elements: scene.elements,
          appState: scene.appState,
          files: scene.files,
          mermaidSource: materialized.mermaidSource
        })
      } else {
        const versionNumber = (drawing.currentVersionNumber ?? 0) + 1
        version = await versionRepository.save(versionRepository.create({
          ...scopedCreate(scope),
          drawingId: event.resourceId,
          versionNumber,
          sourceType: 'workbench',
          elements: scene.elements,
          appState: scene.appState,
          files: scene.files,
          mermaidSource: materialized.mermaidSource,
          changeSummary: 'Initialized collaborative working scene',
          createdById: scope.userId ?? null,
          assistantId: scope.assistantId ?? null,
          conversationId: scope.conversationId ?? null
        }))
        drawing.currentVersionId = version.id
        drawing.currentVersionNumber = versionNumber
      }
      drawing.revision = event.sequenceNumber
      drawing.yjsStateBase64 = event.stateBase64
      drawing.yjsStateVectorBase64 = event.stateVectorBase64
      drawing.yjsUpdateCount = (drawing.yjsUpdateCount ?? 0) + (event.updateBase64 ? 1 : 0)
      drawing.lastEditedById = scope.userId ?? null
      drawing.lastEditedAt = new Date()
      await drawingRepository.save(drawing)
    })
  }

  async publishDrawingViewerArtifact(
    scope: ExcalidrawScope,
    input: {
      drawingId: string
      versionMode?: ArtifactLinkVersionMode | null
      accessMode?: ArtifactAccessMode | null
      userConfirmedPublicLink?: boolean | null
    }
  ) {
    const drawing = await this.requireCanonicalDrawing(scope, input.drawingId)
    const accessMode = normalizeArtifactAccessMode(input.accessMode)
    if (accessMode === 'public_link' && input.userConfirmedPublicLink !== true) {
      throw new BadRequestException('Public Artifact sharing requires explicit user confirmation.')
    }
    const workspaceFiles = this.workspaceFiles()
    const artifacts = this.artifacts()
    const versionMode = input.versionMode === 'version' ? 'version' : 'latest'
    const allowDownload = false
    const currentVersion = await this.getCurrentVersion(scope, drawing)
    const scene = validateScene({
      elements: currentVersion?.elements ?? [],
      appState: currentVersion?.appState ?? {},
      files: currentVersion?.files ?? {}
    }, 'Published Excalidraw scene')
    const rendered = await this.artifactViewer().render({
      title: drawing.title,
      description: drawing.description,
      revision: drawing.revision ?? 0,
      versionNumber: drawing.currentVersionNumber ?? currentVersion?.versionNumber ?? 0,
      scene
    })
    const checksum = rendered.checksum
    const active = await this.publicationRepository.findOne({
      where: scopedWhere(scope, { drawingId: input.drawingId, status: 'active' }),
      order: { createdAt: 'DESC' }
    })
    const canReuseContent = Boolean(
      active?.checksum === checksum &&
      active.mimeType === 'text/html' &&
      active.artifactId &&
      active.artifactVersionId
    )

    const createLink = (artifactId: string, artifactVersionId: string) => artifacts.createArtifactLink({
      artifactId,
      artifactVersionId: versionMode === 'version' ? artifactVersionId : null,
      versionMode,
      access: {
        mode: accessMode,
        userConfirmedPublicLink: accessMode === 'public_link' ? true : null
      },
      presentation: { disposition: 'inline', allowDownload, safeHtmlProfile: 'interactive' },
      metadata: artifactMetadata(drawing, {
        collaborationSequence: drawing.revision ?? 0,
        viewerVersion: rendered.viewerVersion
      })
    })
    const updateLink = (linkId: string, artifactVersionId: string) => artifacts.updateArtifactLinkAccess(linkId, {
      artifactVersionId: versionMode === 'version' ? artifactVersionId : null,
      versionMode,
      access: {
        mode: accessMode,
        userConfirmedPublicLink: accessMode === 'public_link' ? true : null
      },
      presentation: { disposition: 'inline', allowDownload, safeHtmlProfile: 'interactive' }
    })
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
      const link = previousLinkId && normalizeArtifactPublicUrl(active.publicUrl)
        ? await updateOrReplaceLink(previousLinkId, active.artifactId, active.artifactVersionId)
        : await createLink(active.artifactId, active.artifactVersionId)
      active.artifactLinkId = link.id
      active.artifactLinkVersionMode = link.versionMode
      active.artifactLinkAccessMode = link.accessMode
      active.allowDownload = link.allowDownload
      active.publicUrl = link.publicUrl
      active.sharedAt = new Date()
      await this.publicationRepository.save(active)
      if (previousLinkId && previousLinkId !== link.id) await this.revokeArtifactLinkBestEffort(previousLinkId)
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
    const publication = this.publicationRepository.create({
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
    const link = canUpdateHtmlLink && active?.artifactLinkId
      ? await updateOrReplaceLink(active.artifactLinkId, artifact.id, artifactVersion.id)
      : await createLink(artifact.id, artifactVersion.id)
    publication.artifactLinkId = link.id
    publication.artifactLinkVersionMode = link.versionMode
    publication.artifactLinkAccessMode = link.accessMode
    publication.allowDownload = link.allowDownload
    publication.publicUrl = link.publicUrl
    publication.sharedAt = new Date()

    const saved = await this.publicationRepository.save(publication)
    if (active?.id) {
      active.status = 'superseded'
      await this.publicationRepository.save(active)
    }
    if (active?.artifactLinkId && active.artifactLinkId !== link.id) {
      await this.revokeArtifactLinkBestEffort(active.artifactLinkId)
    }
    if (active?.mimeType === 'image/svg+xml') {
      if (active.artifactId !== artifact.id) await artifacts.deleteArtifact(active.artifactId).catch(() => undefined)
      await workspaceFiles.deleteFile(active.workspaceFileReference).catch(() => undefined)
    }
    return compactArtifactShare(saved, 'Excalidraw Artifact share link is ready.')
  }

  async revokeArtifactShare(scope: ExcalidrawScope, drawingId: string) {
    await this.requireDrawing(scope, drawingId)
    const active = await this.publicationRepository.findOne({
      where: scopedWhere(scope, { drawingId, status: 'active' }),
      order: { createdAt: 'DESC' }
    })
    if (!active) return { message: 'Excalidraw drawing has no active Artifact share.', drawingId, revoked: false }
    if (active.artifactLinkId) await this.artifacts().revokeArtifactLink(active.artifactLinkId)
    active.status = 'revoked'
    active.publicUrl = null
    await this.publicationRepository.save(active)
    return { message: 'Excalidraw Artifact share was revoked.', drawingId, revoked: true }
  }

  async updateDrawingStatus(scope: ExcalidrawScope, input: UpdateExcalidrawDrawingStatusInput) {
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

    if (input.status === 'archived') {
      const collaboration = this.collaborationOrNull()
      if (collaboration) {
        await collaboration.ensureDocument({
          providerKey: EXCALIDRAW_COLLABORATION_PROVIDER_KEY,
          resourceId: drawing.id as string,
          schemaVersion: EXCALIDRAW_YJS_SCHEMA_VERSION
        })
        await collaboration.archiveDocument({
          providerKey: EXCALIDRAW_COLLABORATION_PROVIDER_KEY,
          resourceId: drawing.id as string
        })
      }
    }

    return {
      success: true,
      message: 'Excalidraw drawing status was updated.',
      item: updated
    }
  }

  async deleteDrawing(scope: ExcalidrawScope, drawingId: string) {
    const drawing = await this.requireDrawing(scope, drawingId)
    const scopedDrawingId = drawing.id as string

    const collaboration = this.collaborationOrNull()
    if (collaboration) {
      await collaboration.ensureDocument({
        providerKey: EXCALIDRAW_COLLABORATION_PROVIDER_KEY,
        resourceId: scopedDrawingId,
        schemaVersion: EXCALIDRAW_YJS_SCHEMA_VERSION
      })
      await collaboration.deleteDocument({
        providerKey: EXCALIDRAW_COLLABORATION_PROVIDER_KEY,
        resourceId: scopedDrawingId
      })
    }
    const publications = await this.publicationRepository.find({
      where: scopedWhere(scope, { drawingId: scopedDrawingId })
    })
    const artifactIds = new Set<string>()
    for (const publication of publications) {
      if (publication.artifactLinkId && publication.status === 'active') {
        await this.revokeArtifactLinkBestEffort(publication.artifactLinkId)
      }
      artifactIds.add(publication.artifactId)
      await this.workspaceFiles().deleteFile(publication.workspaceFileReference).catch(() => undefined)
    }
    for (const artifactId of artifactIds) {
      await this.artifacts().deleteArtifact(artifactId).catch(() => undefined)
    }

    await this.publicationRepository.delete(scopedWhere(scope, { drawingId: scopedDrawingId }))
    await this.logRepository.delete(scopedWhere(scope, { drawingId: scopedDrawingId }))
    await this.versionRepository.delete(scopedWhere(scope, { drawingId: scopedDrawingId }))
    await this.drawingRepository.delete(scopedWhere(scope, { id: scopedDrawingId }))

    return {
      success: true,
      message: 'Excalidraw drawing was deleted.',
      drawingId: scopedDrawingId
    }
  }

  async deleteVersion(scope: ExcalidrawScope, drawingId: string, versionId: string) {
    const drawing = await this.requireDrawing(scope, drawingId)
    const scopedDrawingId = drawing.id as string
    const normalizedVersionId = normalizeRequired(versionId, 'Version id is required.')
    const version = await this.versionRepository.findOne({
      where: scopedWhere(scope, { id: normalizedVersionId, drawingId: scopedDrawingId })
    })
    if (!version) {
      throw new NotFoundException('Excalidraw drawing version was not found.')
    }

    await this.logRepository.delete(scopedWhere(scope, { drawingId: scopedDrawingId, versionId: normalizedVersionId }))
    await this.versionRepository.delete(scopedWhere(scope, { id: normalizedVersionId, drawingId: scopedDrawingId }))

    const remainingVersions = await this.versionRepository.find({
      where: scopedWhere(scope, { drawingId: scopedDrawingId }),
      order: {
        versionNumber: 'DESC'
      }
    })
    const shouldReplaceCurrentVersion = drawing.currentVersionId === normalizedVersionId
    const nextCurrentVersion = shouldReplaceCurrentVersion ? (remainingVersions[0] ?? null) : null
    const updatedDrawing = shouldReplaceCurrentVersion
      ? {
          ...drawing,
          currentVersionId: nextCurrentVersion?.id ?? null,
          currentVersionNumber: nextCurrentVersion?.versionNumber ?? 0,
          lastEditedById: scope.userId ?? null,
          lastEditedAt: new Date()
        }
      : {
          ...drawing,
          lastEditedById: scope.userId ?? null,
          lastEditedAt: new Date()
        }
    await this.drawingRepository.save(updatedDrawing)

    return {
      success: true,
      message: 'Excalidraw drawing version was deleted.',
      drawing: await this.getDrawing(scope, scopedDrawingId),
      deletedVersionId: normalizedVersionId,
      currentVersionId: shouldReplaceCurrentVersion ? (nextCurrentVersion?.id ?? null) : drawing.currentVersionId,
      currentVersionNumber: shouldReplaceCurrentVersion ? (nextCurrentVersion?.versionNumber ?? 0) : (drawing.currentVersionNumber ?? 0)
    }
  }

  async restoreVersion(scope: ExcalidrawScope, drawingId: string, versionId: string, changeSummary?: string) {
    let drawing = await this.requireDrawing(scope, drawingId)
    const version = await this.versionRepository.findOne({
      where: scopedWhere(scope, { id: versionId, drawingId })
    })
    if (!version) {
      throw new NotFoundException('Excalidraw drawing version was not found.')
    }

    const restoredInput = {
      sourceType: 'restore',
      elements: version.elements,
      appState: version.appState,
      files: version.files,
      mermaidSource: normalizeNullableText(version.mermaidSource),
      changeSummary: normalizeOptional(changeSummary) ?? `Restored version ${version.versionNumber}`
    } satisfies ExcalidrawSceneInput & { sourceType: ExcalidrawVersionSource; changeSummary: string }
    if (this.collaborationOrNull()) {
      await this.replaceCollaborativeScene(scope, drawing, restoredInput, `excalidraw:restore-version:${versionId}`)
      drawing = await this.requireCanonicalDrawing(scope, drawingId)
    }
    const restored = await this.createVersion(scope, drawing, restoredInput)

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
      message: 'Excalidraw drawing version was restored.',
      drawing: await this.getDrawing(scope, drawingId),
      version: restored
    }
  }

  async reportFailure(scope: ExcalidrawScope, input: ReportExcalidrawFailureInput) {
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
      message: 'Excalidraw drawing failure was recorded.',
      log
    }
  }

  private async createVersion(
    scope: ExcalidrawScope,
    drawing: ExcalidrawDrawing,
    input: ExcalidrawSceneInput & {
      sourceType: ExcalidrawVersionSource
      changeSummary?: string
    }
  ) {
    const scene = validateScene(input, `Excalidraw ${input.sourceType} scene`)
    const currentVersionNumber = drawing.currentVersionNumber ?? 0
    const versionNumber = currentVersionNumber + 1
    const version = await this.versionRepository.save(
      this.versionRepository.create({
        ...scopedCreate(scope),
        drawingId: drawing.id as string,
        versionNumber,
        sourceType: input.sourceType,
        elements: scene.elements,
        appState: scene.appState,
        files: scene.files,
        mermaidSource: normalizeNullableText(input.mermaidSource),
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
        versionNumber,
        sourceType: input.sourceType,
        elementCount: version.elements?.length ?? 0,
        hasMermaidSource: Boolean(version.mermaidSource)
      }
    })

    return version
  }

  private async updateCurrentVersion(
    scope: ExcalidrawScope,
    drawing: ExcalidrawDrawing,
    input: ExcalidrawSceneInput & {
      sourceType: ExcalidrawVersionSource
      changeSummary?: string
    }
  ) {
    if (this.collaborationOrNull()) {
      return this.replaceCollaborativeScene(scope, drawing, input, `excalidraw:${input.sourceType}:update-current`)
    }
    const scene = validateScene(input, `Excalidraw ${input.sourceType} scene`)
    const currentVersion = await this.getCurrentVersion(scope, drawing)
    if (!currentVersion) {
      return this.createVersion(scope, drawing, input)
    }

    const version = await this.versionRepository.save({
      ...currentVersion,
      sourceType: input.sourceType,
      elements: scene.elements,
      appState: scene.appState,
      files: scene.files,
      mermaidSource: normalizeNullableText(input.mermaidSource),
      changeSummary: normalizeOptional(input.changeSummary),
      assistantId: scope.assistantId ?? currentVersion.assistantId ?? null,
      conversationId: scope.conversationId ?? currentVersion.conversationId ?? null
    })

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
      action: 'scene_updated',
      actorType: input.sourceType.startsWith('agent') ? 'agent' : 'user',
      message: input.changeSummary,
      snapshot: {
        versionNumber: version.versionNumber,
        sourceType: input.sourceType,
        elementCount: version.elements?.length ?? 0,
        hasMermaidSource: Boolean(version.mermaidSource)
      }
    })

    return version
  }

  private async replaceCollaborativeScene(
    scope: ExcalidrawScope,
    drawing: ExcalidrawDrawing,
    input: ExcalidrawSceneInput,
    origin: string
  ) {
    const drawingId = drawing.id as string
    const scene = validateScene(input, 'Collaborative Excalidraw scene replacement')
    const collaboration = this.collaboration()
    const document = await collaboration.ensureDocument({
      providerKey: EXCALIDRAW_COLLABORATION_PROVIDER_KEY,
      resourceId: drawingId,
      schemaVersion: EXCALIDRAW_YJS_SCHEMA_VERSION
    })
    const state = await collaboration.getDocumentState({ documentId: document.id })
    const doc = new Y.Doc()
    Y.applyUpdate(doc, Buffer.from(state.updateBase64, 'base64'))
    const current = materializeExcalidrawYDoc(doc)
    const next = {
      ...scene,
      mermaidSource: normalizeNullableText(input.mermaidSource)
    }
    if (collaborationSceneSignature(current) !== collaborationSceneSignature(next)) {
      const before = Y.encodeStateVector(doc)
      writeExcalidrawSceneToYDoc(doc, next, origin)
      const update = Y.encodeStateAsUpdate(doc, before)
      await collaboration.applyUpdate({
        documentId: document.id,
        updateBase64: Buffer.from(update).toString('base64'),
        origin,
        expectedSequence: state.sequenceNumber,
        actor: {
          actorType: origin.includes('agent') ? 'agent' : 'user',
          actorKey: scope.assistantId ?? scope.userId ?? null,
          displayName: scope.assistantId ? 'Excalidraw Agent' : null
        }
      })
    }
    const canonical = await this.requireCanonicalDrawing(scope, drawingId)
    const version = await this.getCurrentVersion(scope, canonical)
    if (!version) throw new NotFoundException('Collaborative Excalidraw working scene was not materialized.')
    Object.assign(drawing, canonical)
    return version
  }

  private async requireCanonicalDrawing(scope: ExcalidrawScope, drawingId: string) {
    const drawing = await this.requireDrawing(scope, drawingId)
    const collaboration = this.collaborationOrNull()
    if (!collaboration) return drawing
    const document = await collaboration.ensureDocument({
      providerKey: EXCALIDRAW_COLLABORATION_PROVIDER_KEY,
      resourceId: drawingId,
      schemaVersion: EXCALIDRAW_YJS_SCHEMA_VERSION
    })
    const state = await collaboration.getDocumentState({ documentId: document.id })
    if (drawing.revision !== state.sequenceNumber || drawing.yjsStateVectorBase64 !== state.stateVectorBase64) {
      await this.materializeCollaborationDocument({
        ...scope,
        xpertId: scope.assistantId ?? null,
        providerKey: EXCALIDRAW_COLLABORATION_PROVIDER_KEY,
        resourceId: drawingId,
        operation: 'materialize',
        documentId: document.id,
        stateBase64: state.updateBase64,
        stateVectorBase64: state.stateVectorBase64,
        sequenceNumber: state.sequenceNumber,
        origin: 'excalidraw:canonical-read'
      })
    }
    return this.requireDrawing(scope, drawingId)
  }

  private collaborationOrNull() {
    return this.runtimeCapabilities?.get(CollaborationRuntimeCapability) ?? null
  }

  private collaboration() {
    const capability = this.collaborationOrNull()
    if (!capability) throw new Error('Platform collaboration capability is not available.')
    return capability
  }

  private workspaceFiles() {
    const capability = this.runtimeCapabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!capability) throw new Error('Platform Workspace Files capability is not available.')
    return capability
  }

  private artifacts() {
    const capability = this.runtimeCapabilities?.get(ArtifactsRuntimeCapability)
    if (!capability) throw new Error('Platform Artifacts capability is not available.')
    return capability
  }

  private artifactViewer() {
    return this.artifactViewerService ?? new ExcalidrawArtifactViewerService()
  }

  private async revokeArtifactLinkBestEffort(linkId: string) {
    try {
      await this.artifacts().revokeArtifactLink(linkId)
    } catch {
      // Link cleanup is idempotent and must not hide the primary publish/delete operation.
    }
  }

  private async getCurrentVersion(scope: ExcalidrawScope, drawing: ExcalidrawDrawing) {
    if (!drawing.currentVersionId) {
      return null
    }
    return this.versionRepository.findOne({
      where: scopedWhere(scope, { id: drawing.currentVersionId, drawingId: drawing.id as string })
    })
  }

  private async requireDrawing(scope: ExcalidrawScope, drawingId: string) {
    const drawing = await this.drawingRepository.findOne({
      where: scopedWhere(scope, { id: normalizeRequired(drawingId, 'Drawing id is required.') })
    })
    if (!drawing) {
      throw new NotFoundException('Excalidraw drawing was not found.')
    }
    return drawing
  }

  private async writeLog(
    scope: ExcalidrawScope,
    input: {
      drawingId?: string
      versionId?: string
      action: ExcalidrawActionType
      actorType?: ExcalidrawActorType
      message?: string
      errorMessage?: string
      snapshot?: unknown
    }
  ) {
    return this.logRepository.save(
      this.logRepository.create({
        ...scopedCreate(scope),
        drawingId: input.drawingId ?? null,
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

function scopedCreate(scope: ExcalidrawScope): ScopedEntity & { createdById?: string | null } {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null,
    projectId: scope.projectId ?? null,
    createdById: scope.userId ?? null
  }
}

function collaborationScope(
  context: CollaborationProviderContext | CollaborationMaterializationEvent
): ExcalidrawScope {
  return {
    tenantId: normalizeRequired(context.tenantId, 'Collaboration tenant id is required.'),
    organizationId: context.organizationId ?? null,
    workspaceId: context.workspaceId ?? null,
    projectId: context.projectId ?? null,
    userId: context.userId ?? null,
    assistantId: context.xpertId ?? null
  }
}

function collaborationSceneSignature(scene: ExcalidrawSceneInput) {
  return createStableJsonSignature({
    elements: scene.elements ?? [],
    appState: scene.appState ?? {},
    files: scene.files ?? {},
    mermaidSource: normalizeNullableText(scene.mermaidSource)
  })
}

function explicitWorkspaceScope(drawing: ExcalidrawDrawing, scope: ExcalidrawScope) {
  if (drawing.projectId) {
    return {
      tenantId: drawing.tenantId,
      userId: scope.userId,
      catalog: 'projects' as const,
      scopeId: drawing.projectId,
      projectId: drawing.projectId
    }
  }
  if (drawing.assistantId) {
    return {
      tenantId: drawing.tenantId,
      userId: scope.userId,
      catalog: 'xperts' as const,
      scopeId: drawing.assistantId,
      xpertId: drawing.assistantId,
      isolateByUser: false
    }
  }
  throw new BadRequestException('Excalidraw drawing has no project or Xpert workspace scope.')
}

function portableReference(
  file: WorkspaceFile,
  scope: ReturnType<typeof explicitWorkspaceScope>,
  originalName: string,
  size: number,
  mimeType: string
): WorkspacePortableFileReference {
  return {
    source: WORKSPACE_FILES_SOURCE,
    filePath: file.filePath,
    workspacePath: file.workspacePath,
    catalog: scope.catalog,
    scopeId: scope.scopeId,
    tenantId: scope.tenantId,
    userId: scope.userId,
    ...('projectId' in scope ? { projectId: scope.projectId } : {}),
    ...('xpertId' in scope ? { xpertId: scope.xpertId, isolateByUser: false } : {}),
    originalName,
    name: file.name,
    mimeType: file.mimeType ?? mimeType,
    size: file.size ?? size
  }
}

function artifactScope(drawing: ExcalidrawDrawing, scope: ExcalidrawScope) {
  return {
    tenantId: drawing.tenantId ?? scope.tenantId ?? null,
    organizationId: drawing.organizationId ?? scope.organizationId ?? null,
    userId: scope.userId ?? drawing.createdById ?? null,
    workspaceId: drawing.workspaceId ?? scope.workspaceId ?? null,
    projectId: drawing.projectId ?? scope.projectId ?? null,
    xpertId: drawing.assistantId ?? scope.assistantId ?? null
  }
}

function artifactMetadata(drawing: ExcalidrawDrawing, extra?: Record<string, unknown>) {
  return {
    drawingId: drawing.id,
    drawingTitle: drawing.title,
    drawingKind: drawing.kind,
    currentVersionId: drawing.currentVersionId,
    currentVersionNumber: drawing.currentVersionNumber ?? 0,
    ...extra
  }
}

function normalizeArtifactAccessMode(value: ArtifactAccessMode | null | undefined): ArtifactAccessMode {
  if (!value) return 'public_link'
  const allowed = new Set<ArtifactAccessMode>(['owner_only', 'workspace_all', 'organization_all', 'public_link'])
  if (allowed.has(value)) return value
  throw new BadRequestException(`Unsupported artifact access mode: ${value}`)
}

function normalizeHtmlFileName(value: string | null | undefined) {
  const base = (normalizeOptional(value) ?? 'excalidraw-drawing')
    .replace(/\.html?$/i, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'excalidraw-drawing'
  return `${base}.html`
}

function compactArtifactShare(publication: ExcalidrawArtifactPublication, message?: string) {
  const publicUrl = normalizeArtifactPublicUrl(publication.publicUrl)
  return {
    ...(message ? { message } : {}),
    drawingId: publication.drawingId,
    revision: publication.collaborationSequence,
    artifactId: publication.artifactId,
    artifactVersionId: publication.artifactVersionId,
    artifactLinkId: publication.artifactLinkId,
    versionMode: publication.artifactLinkVersionMode,
    accessMode: publication.artifactLinkAccessMode,
    allowDownload: publication.allowDownload,
    shareUrl: publicUrl,
    publicUrl,
    sharedAt: publication.sharedAt,
    status: publication.status
  }
}

function normalizeArtifactPublicUrl(value: string | null | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed || undefined
}

function selectRequestedVersion(payload: Record<string, any>, input: { versionId?: string; versionNumber?: number }) {
  const versions = Array.isArray(payload.versions) ? payload.versions : []
  if (input.versionId) {
    const version = versions.find((candidate) => candidate.id === input.versionId)
    if (!version) {
      throw new NotFoundException('Requested Excalidraw drawing version was not found.')
    }
    return version
  }
  if (input.versionNumber !== undefined) {
    const version = versions.find((candidate) => candidate.versionNumber === input.versionNumber)
    if (!version) {
      throw new NotFoundException('Requested Excalidraw drawing version was not found.')
    }
    return version
  }
  return payload.currentVersion ?? versions[0] ?? null
}

function scopedWhere<T extends Record<string, unknown>>(scope: ExcalidrawScope, extra?: Partial<T>): Partial<T> {
  const where = {
    tenantId: scope.tenantId
  } as Record<string, unknown>
  if (scope.organizationId != null) {
    where.organizationId = scope.organizationId
  }
  if (scope.projectId != null) {
    where.projectId = scope.projectId
  } else if (scope.workspaceId != null) {
    where.workspaceId = scope.workspaceId
  }
  return {
    ...where,
    ...(extra ?? {})
  } as Partial<T>
}

function normalizeRequired(value: string | undefined | null, message: string) {
  const normalized = normalizeOptional(value)
  if (!normalized) {
    throw new BadRequestException(message)
  }
  return normalized
}

function normalizeOptional(value: string | undefined | null) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function normalizeNullableText(value: string | undefined | null) {
  return normalizeOptional(value) ?? null
}

function normalizeStringArray(values: string[] | undefined | null) {
  const normalized = (values ?? []).map((value) => normalizeOptional(value)).filter(isString)
  return normalized.length ? Array.from(new Set(normalized)) : undefined
}

function normalizeObject(value: unknown) {
  return isPlainObject(value) ? value : {}
}

function hasSceneContent(input: ExcalidrawSceneInput) {
  return Boolean((Array.isArray(input.elements) && input.elements.length > 0) || input.mermaidSource || input.appState || input.files)
}

function validateScene(
  input: {
    elements?: unknown[] | null
    appState?: unknown
    files?: unknown
  },
  context: string
): NormalizedExcalidrawScene {
  try {
    return normalizeExcalidrawScene(input, { context })
  } catch (error) {
    if (error instanceof ExcalidrawSceneValidationError) {
      throw new BadRequestException(error.message)
    }
    throw error
  }
}

function applyElementPatch(elements: Record<string, unknown>[], input: PatchExcalidrawSceneInput) {
  const currentIds = new Set(elements.map((element) => readElementId(element)).filter(isString))
  const addElements = normalizePatchElements(input.addElements)
  const updateElements = input.updateElements ?? []
  const deleteElementIds = input.deleteElementIds ?? []
  const addedIds = collectUniqueIds(addElements, 'addElements')
  const updatedIds = collectUniqueStrings(
    updateElements.map((item) => item.id),
    'updateElements.id'
  )
  const deletedIds = collectUniqueStrings(deleteElementIds, 'deleteElementIds')

  for (const id of updatedIds) {
    if (!currentIds.has(id)) {
      throw new BadRequestException(`Cannot update unknown Excalidraw element id "${id}".`)
    }
  }
  for (const id of deletedIds) {
    if (!currentIds.has(id)) {
      throw new BadRequestException(`Cannot delete unknown Excalidraw element id "${id}".`)
    }
  }
  for (const id of addedIds) {
    if (currentIds.has(id)) {
      throw new BadRequestException(`Cannot add duplicate Excalidraw element id "${id}".`)
    }
  }

  const deleteIdSet = new Set(deletedIds)
  const updates = new Map(updateElements.map((item) => [item.id, item]))
  const next = elements
    .filter((element) => !deleteIdSet.has(readElementId(element) ?? ''))
    .map((element) => {
      const id = readElementId(element)
      const update = id ? updates.get(id) : null
      if (!update) {
        return element
      }
      if (update.type !== undefined && update.type !== element.type) {
        throw new BadRequestException(`Cannot change Excalidraw element "${id}" type.`)
      }
      return mergePatchedElement(element, update, id)
    })

  return {
    elements: [...next, ...addElements],
    addedIds,
    updatedIds,
    deletedIds
  }
}

function normalizePatchElements(elements: unknown[] | undefined | null) {
  return (Array.isArray(elements) ? elements : []).map((element, index) => {
    if (!isPlainObject(element)) {
      throw new BadRequestException(`addElements[${index}] must be an Excalidraw element object.`)
    }
    return normalizeAddedElementDefaults(element, index)
  })
}

function normalizeAddedElementDefaults(element: Record<string, unknown>, index: number) {
  const type = typeof element.type === 'string' ? element.type : ''
  const normalized = { ...element }
  const text = typeof normalized.text === 'string' ? normalized.text : typeof normalized.originalText === 'string' ? normalized.originalText : ''
  const widthDefault = type === 'text' ? estimateTextWidth(text) : 120
  const heightDefault = type === 'text' ? 24 : 80

  defaultFiniteNumber(normalized, 'x', 0)
  defaultFiniteNumber(normalized, 'y', 0)
  defaultFiniteNumber(normalized, 'width', widthDefault)
  defaultFiniteNumber(normalized, 'height', heightDefault)
  defaultFiniteNumber(normalized, 'angle', 0)
  defaultFiniteNumber(normalized, 'strokeWidth', 2)
  defaultFiniteNumber(normalized, 'roughness', 1)
  defaultFiniteNumber(normalized, 'opacity', 100)
  defaultFiniteNumber(normalized, 'seed', index + 1)
  defaultFiniteNumber(normalized, 'version', 1)
  defaultFiniteNumber(normalized, 'versionNonce', index + 1)
  defaultFiniteNumber(normalized, 'updated', Date.now())
  defaultString(normalized, 'strokeColor', '#1e1e1e')
  defaultString(normalized, 'backgroundColor', 'transparent')
  defaultString(normalized, 'fillStyle', 'hachure')
  defaultString(normalized, 'strokeStyle', 'solid')
  defaultBoolean(normalized, 'isDeleted', false)
  defaultBoolean(normalized, 'locked', false)
  defaultArray(normalized, 'groupIds')
  defaultNullable(normalized, 'frameId')
  defaultNullable(normalized, 'boundElements')
  defaultNullable(normalized, 'link')
  defaultNullable(normalized, 'roundness')
  normalized.roundness = normalizeRoundnessValue(normalized.roundness)
  if (normalized.index === undefined) {
    normalized.index = null
  }

  if (type === 'text') {
    normalized.text = text
    defaultString(normalized, 'originalText', text)
    defaultString(normalized, 'textAlign', 'left')
    defaultString(normalized, 'verticalAlign', 'top')
    defaultNullable(normalized, 'containerId')
    defaultBoolean(normalized, 'autoResize', true)
    defaultFiniteNumber(normalized, 'fontSize', 20)
    defaultFiniteNumber(normalized, 'fontFamily', 5)
    defaultFiniteNumber(normalized, 'lineHeight', 1.25)
  } else if (type === 'arrow' || type === 'line') {
    if (!Array.isArray(normalized.points) || normalized.points.length < 2) {
      normalized.points = [[0, 0], [readFiniteNumber(normalized.width) ?? widthDefault, 0]]
    }
    defaultNullable(normalized, 'lastCommittedPoint')
    defaultNullable(normalized, 'startBinding')
    defaultNullable(normalized, 'endBinding')
    normalized.startArrowhead = normalizeArrowheadValue(normalized.startArrowhead, null)
    if (type === 'arrow') {
      normalized.endArrowhead = normalizeArrowheadValue(normalized.endArrowhead, 'arrow')
      defaultBoolean(normalized, 'elbowed', false)
    } else {
      normalized.endArrowhead = normalizeArrowheadValue(normalized.endArrowhead, null)
    }
  } else if (type === 'freedraw') {
    if (!Array.isArray(normalized.points) || normalized.points.length < 1) {
      normalized.points = [[0, 0]]
    }
    if (!Array.isArray(normalized.pressures)) {
      normalized.pressures = []
    }
    defaultBoolean(normalized, 'simulatePressure', false)
    defaultNullable(normalized, 'lastCommittedPoint')
  } else if (type === 'image') {
    defaultNullable(normalized, 'fileId')
    defaultString(normalized, 'status', 'saved')
    if (!Array.isArray(normalized.scale) || normalized.scale.length !== 2) {
      normalized.scale = [1, 1]
    }
    defaultNullable(normalized, 'crop')
  } else if (type === 'frame' || type === 'magicframe') {
    defaultNullable(normalized, 'name')
  }

  return normalized
}

function normalizeElementUpdateFields(update: Record<string, unknown>, currentElement: Record<string, unknown>) {
  const normalized = { ...update }
  const type = typeof currentElement.type === 'string' ? currentElement.type : typeof normalized.type === 'string' ? normalized.type : ''
  if (Object.prototype.hasOwnProperty.call(normalized, 'roundness')) {
    normalized.roundness = normalizeRoundnessValue(normalized.roundness)
  }
  if (type !== 'arrow' && type !== 'line') {
    return normalized
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'startArrowhead')) {
    normalized.startArrowhead = normalizeArrowheadValue(normalized.startArrowhead, null)
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'endArrowhead')) {
    normalized.endArrowhead = normalizeArrowheadValue(normalized.endArrowhead, type === 'arrow' ? 'arrow' : null)
  }
  return normalized
}

function mergePatchedElement(element: Record<string, unknown>, update: Record<string, unknown>, id: string) {
  const merged = {
    ...element,
    ...normalizeElementUpdateFields(update, element),
    id
  }
  if (!hasElementMaterialChange(element, merged)) {
    return merged
  }
  return bumpElementMutationMetadata(element, merged)
}

function hasElementMaterialChange(previous: Record<string, unknown>, next: Record<string, unknown>) {
  return createStableJsonSignature(stripElementMutationMetadata(previous)) !== createStableJsonSignature(stripElementMutationMetadata(next))
}

function stripElementMutationMetadata(element: Record<string, unknown>) {
  return Object.keys(element).reduce<Record<string, unknown>>((acc, key) => {
    if (key !== 'version' && key !== 'versionNonce' && key !== 'updated') {
      acc[key] = element[key]
    }
    return acc
  }, {})
}

function bumpElementMutationMetadata(previous: Record<string, unknown>, next: Record<string, unknown>) {
  const bumped = { ...next }
  const previousVersion = readFiniteNumber(previous.version) ?? 0
  const nextVersion = readFiniteNumber(bumped.version)
  if (nextVersion === null || nextVersion <= previousVersion) {
    bumped.version = previousVersion + 1
  }

  const previousVersionNonce = readFiniteNumber(previous.versionNonce)
  const nextVersionNonce = readFiniteNumber(bumped.versionNonce)
  if (nextVersionNonce === null || nextVersionNonce === previousVersionNonce) {
    bumped.versionNonce = nextElementVersionNonce(previousVersionNonce)
  }

  const previousUpdated = readFiniteNumber(previous.updated) ?? 0
  const nextUpdated = readFiniteNumber(bumped.updated)
  if (nextUpdated === null || nextUpdated <= previousUpdated) {
    bumped.updated = Math.max(Date.now(), previousUpdated + 1)
  }
  return bumped
}

function nextElementVersionNonce(previousVersionNonce: number | null) {
  const next = Math.trunc(Date.now() % 2147483647)
  if (previousVersionNonce === null || next !== previousVersionNonce) {
    return next
  }
  return next === 2147483646 ? 1 : next + 1
}

function estimateTextWidth(text: string) {
  return Math.max(40, Math.min(600, text.length * 12 || 80))
}

const SUPPORTED_ARROWHEADS = new Set([
  'arrow',
  'bar',
  'dot',
  'circle',
  'circle_outline',
  'triangle',
  'triangle_outline',
  'diamond',
  'diamond_outline',
  'crowfoot_one',
  'crowfoot_many',
  'crowfoot_one_or_many'
])
const DEFAULT_ROUNDNESS_TYPE = 3

const ARROWHEAD_ALIASES = new Map<string, string | null>([
  ['none', null],
  ['no', null],
  ['no_arrow', null],
  ['null', null],
  ['undefined', null],
  ['false', null],
  ['0', null],
  ['arrowhead', 'arrow'],
  ['arrow_head', 'arrow'],
  ['normal', 'arrow'],
  ['standard', 'arrow'],
  ['single_arrow', 'arrow'],
  ['triangle_filled', 'triangle'],
  ['filled_triangle', 'triangle'],
  ['open_triangle', 'triangle_outline'],
  ['hollow_triangle', 'triangle_outline'],
  ['outlined_triangle', 'triangle_outline'],
  ['circle_filled', 'circle'],
  ['filled_circle', 'circle'],
  ['open_circle', 'circle_outline'],
  ['hollow_circle', 'circle_outline'],
  ['outlined_circle', 'circle_outline'],
  ['diamond_filled', 'diamond'],
  ['filled_diamond', 'diamond'],
  ['open_diamond', 'diamond_outline'],
  ['hollow_diamond', 'diamond_outline'],
  ['outlined_diamond', 'diamond_outline'],
  ['tee', 'bar'],
  ['one', 'crowfoot_one'],
  ['many', 'crowfoot_many'],
  ['one_or_many', 'crowfoot_one_or_many'],
  ['crowfoot', 'crowfoot_many']
])

function normalizeArrowheadValue(value: unknown, fallback: string | null) {
  if (value === undefined) {
    return fallback
  }
  if (value === null) {
    return null
  }
  if (typeof value !== 'string') {
    return fallback
  }
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!normalized) {
    return null
  }
  if (SUPPORTED_ARROWHEADS.has(normalized)) {
    return normalized
  }
  if (ARROWHEAD_ALIASES.has(normalized)) {
    return ARROWHEAD_ALIASES.get(normalized) ?? null
  }
  return fallback
}

function normalizeRoundnessValue(value: unknown) {
  if (value === undefined || value === null) {
    return null
  }
  if (!isPlainObject(value)) {
    return null
  }
  const normalized = { ...value }
  if (!Number.isFinite(normalized.type)) {
    normalized.type = DEFAULT_ROUNDNESS_TYPE
  }
  if (normalized.value !== undefined && !Number.isFinite(normalized.value)) {
    delete normalized.value
  }
  return normalized
}

function defaultFiniteNumber(element: Record<string, unknown>, field: string, value: number) {
  if (!Number.isFinite(element[field])) {
    element[field] = value
  }
}

function defaultString(element: Record<string, unknown>, field: string, value: string) {
  if (typeof element[field] !== 'string') {
    element[field] = value
  }
}

function defaultBoolean(element: Record<string, unknown>, field: string, value: boolean) {
  if (typeof element[field] !== 'boolean') {
    element[field] = value
  }
}

function defaultArray(element: Record<string, unknown>, field: string) {
  if (!Array.isArray(element[field])) {
    element[field] = []
  }
}

function defaultNullable(element: Record<string, unknown>, field: string) {
  if (element[field] === undefined) {
    element[field] = null
  }
}

function readFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function collectUniqueIds(elements: Record<string, unknown>[], label: string) {
  return collectUniqueStrings(
    elements.map((element, index) => {
      const id = readElementId(element)
      if (!id) {
        throw new BadRequestException(`${label}[${index}].id is required.`)
      }
      return id
    }),
    `${label}.id`
  )
}

function collectUniqueStrings(values: string[], label: string) {
  const seen = new Set<string>()
  const ids: string[] = []
  for (const value of values) {
    const normalized = normalizeOptional(value)
    if (!normalized) {
      throw new BadRequestException(`${label} contains an empty id.`)
    }
    if (seen.has(normalized)) {
      throw new BadRequestException(`${label} contains duplicate id "${normalized}".`)
    }
    seen.add(normalized)
    ids.push(normalized)
  }
  return ids
}

function readElementId(element: unknown) {
  return isPlainObject(element) && typeof element.id === 'string' ? element.id.trim() : null
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
