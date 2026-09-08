import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  ArtifactsRuntimeCapability,
  CollaborationRuntimeCapability,
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type CollaborationMaterializationEvent,
  type CollaborationProviderContext,
  type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { EXCALIDRAW_COLLABORATION_PROVIDER_KEY } from './constants.js'
import { DiagramIrRevision } from './diagram-engine/entities/index.js'
import {
  ExcalidrawActionLog,
  ExcalidrawArtifactPublication,
  ExcalidrawDrawing,
  ExcalidrawDrawingVersion
} from './entities/index.js'
import { buildAgentDrawingResponse, buildAgentSceneItemResponse } from './excalidraw-agent-response.js'
import { ExcalidrawArtifactViewerService } from './excalidraw-artifact-viewer.service.js'
import { ExcalidrawCollaborationService } from './excalidraw-collaboration.service.js'
import { createStableJsonSignature, isPlainObject } from './excalidraw-scene.validation.js'
import { excalidrawUnitOfWork } from './excalidraw-unit-of-work.js'
import { EXCALIDRAW_YJS_SCHEMA_VERSION } from './excalidraw-yjs.js'
import type {
  CreateExcalidrawDrawingInput,
  ExcalidrawActionType,
  ExcalidrawActorType,
  ExcalidrawSceneInput,
  ExcalidrawScope,
  ExcalidrawVersionSource,
  GetExcalidrawDrawingInput,
  GetExcalidrawSceneItemInput,
  PatchExcalidrawSceneInput,
  ReportExcalidrawFailureInput,
  SaveExcalidrawMermaidDraftInput,
  SaveExcalidrawSceneVersionInput,
  SearchExcalidrawDrawingsInput,
  UpdateExcalidrawDrawingStatusInput
} from './types.js'

import {
  applyElementPatch,
  compactArtifactShare,
  hasSceneContent,
  isString,
  normalizeNullableText,
  normalizeObject,
  normalizeOptional,
  normalizeRequired,
  normalizeStringArray,
  readElementId,
  scopedCreate,
  drawingStorageScope,
  scopedWhere,
  drawingChildrenScope,
  selectRequestedVersion,
  validateScene
} from './excalidraw-service.utils.js'
import { ExcalidrawSharingService } from './excalidraw-sharing.service.js'

@Injectable()
export class ExcalidrawService {
  constructor(
    @InjectRepository(ExcalidrawDrawing)
    private readonly baseDrawingRepository: Repository<ExcalidrawDrawing>,
    @InjectRepository(ExcalidrawDrawingVersion)
    private readonly baseVersionRepository: Repository<ExcalidrawDrawingVersion>,
    @InjectRepository(ExcalidrawActionLog)
    private readonly baseLogRepository: Repository<ExcalidrawActionLog>,
    @InjectRepository(ExcalidrawArtifactPublication)
    private readonly basePublicationRepository: Repository<ExcalidrawArtifactPublication>,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: RuntimeCapabilityRegistry,
    @Optional()
    private readonly artifactViewerService?: ExcalidrawArtifactViewerService,
    @Optional() @InjectRepository(DiagramIrRevision) private readonly irRepository?: Repository<DiagramIrRevision>
  ) {}

  private get drawingRepository() {
    return excalidrawUnitOfWork.getStore()?.manager.getRepository(ExcalidrawDrawing) ?? this.baseDrawingRepository
  }
  private get versionRepository() {
    return (
      excalidrawUnitOfWork.getStore()?.manager.getRepository(ExcalidrawDrawingVersion) ?? this.baseVersionRepository
    )
  }
  private get logRepository() {
    return excalidrawUnitOfWork.getStore()?.manager.getRepository(ExcalidrawActionLog) ?? this.baseLogRepository
  }
  private get publicationRepository() {
    return (
      excalidrawUnitOfWork.getStore()?.manager.getRepository(ExcalidrawArtifactPublication) ??
      this.basePublicationRepository
    )
  }

  async markSceneDiverged(scope: ExcalidrawScope, drawingId: string, source?: string) {
    if (!this.irRepository || source === 'agent_diagram_ir') return
    const repository = excalidrawUnitOfWork.getStore()?.manager.getRepository(DiagramIrRevision) ?? this.irRepository
    const latest = await repository.findOne({ where: scopedWhere(drawingChildrenScope(scope), { drawingId }), order: { revision: 'DESC' } })
    if (latest && latest.status !== 'diverged') await repository.update({ id: latest.id }, { status: 'diverged' })
  }

  assertSceneRevision(drawing: ExcalidrawDrawing, expectedRevision?: number) {
    if (expectedRevision !== undefined && expectedRevision !== (drawing.revision ?? 0))
      throw new ConflictException('scene_revision_conflict')
  }

  async createDrawing(scope: ExcalidrawScope, input: CreateExcalidrawDrawingInput) {
    if (!this.collaborationOrNull() && !excalidrawUnitOfWork.getStore())
      return this.baseDrawingRepository.manager.transaction((manager) =>
        excalidrawUnitOfWork.run({ manager }, () => this.createDrawing(scope, input))
      )
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
    if (!this.collaborationOrNull() && !excalidrawUnitOfWork.getStore())
      return this.baseDrawingRepository.manager.transaction((manager) =>
        excalidrawUnitOfWork.run({ manager }, () => this.saveSceneVersion(scope, input))
      )
    let drawing = await this.requireCanonicalDrawing(scope, input.drawingId)
    this.assertSceneRevision(drawing, input.expectedRevision)
    let sceneInput: ExcalidrawSceneInput = input
    if (this.collaborationOrNull()) {
      await this.replaceCollaborativeScene(
        scope,
        drawing,
        input,
        `excalidraw:${input.sourceType ?? 'agent_json'}:checkpoint`
      )
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
      changeSummary: normalizeOptional(input.changeSummary),
      isCheckpoint: input.isCheckpoint
    })

    return {
      success: true,
      message: 'Excalidraw scene version was saved.',
      drawing: await this.getDrawing(scope, drawing.id as string),
      version
    }
  }

  async saveCurrentScene(scope: ExcalidrawScope, input: SaveExcalidrawSceneVersionInput) {
    if (!this.collaborationOrNull() && !excalidrawUnitOfWork.getStore())
      return this.baseDrawingRepository.manager.transaction((manager) =>
        excalidrawUnitOfWork.run({ manager }, () => this.saveCurrentScene(scope, input))
      )
    const replay = await this.collaborationService().replayOperation(scope, input.drawingId)
    if (replay) return { ...replay, drawing: await this.getDrawing(scope, input.drawingId) }
    const drawing = await this.requireCanonicalDrawing(scope, input.drawingId)
    this.assertSceneRevision(drawing, input.expectedRevision)
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
    if (!this.collaborationOrNull() && !excalidrawUnitOfWork.getStore())
      return this.baseDrawingRepository.manager.transaction((manager) =>
        excalidrawUnitOfWork.run({ manager }, () => this.patchScene(scope, input))
      )
    const replay = await this.collaborationService().replayOperation(scope, input.drawingId)
    if (replay) return { ...replay, drawing: await this.getDrawing(scope, input.drawingId) }
    const drawing = this.collaborationOrNull()
      ? await this.requireCanonicalDrawing(scope, input.drawingId)
      : await this.requireDrawing(scope, input.drawingId)
    this.assertSceneRevision(drawing, input.expectedRevision)
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

    let version: ExcalidrawDrawingVersion
    if (this.collaborationOrNull()) {
      version = await this.applyCollaborativePatch(scope, drawing, input)
    } else {
      version = await this.updateCurrentVersion(scope, drawing, {
        sourceType: 'agent_patch',
        elements: patch.elements,
        appState,
        files,
        mermaidSource,
        changeSummary: normalizeOptional(input.changeSummary) ?? 'Agent patch'
      })
    }
    await this.markSceneDiverged(scope, input.drawingId)

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
    if (!this.collaborationOrNull() && !excalidrawUnitOfWork.getStore())
      return this.baseDrawingRepository.manager.transaction((manager) =>
        excalidrawUnitOfWork.run({ manager }, () => this.saveMermaidDraft(scope, input))
      )
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

    const working = await this.getCurrentVersion(scope, drawing)
    const version = working
      ? (await this.patchScene(scope, { drawingId: drawing.id, mermaidSource, changeSummary: input.changeSummary }))
          .version
      : await this.updateCurrentVersion(scope, drawing, {
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
      snapshot: { mermaidSourceLength: mermaidSource.length }
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
        where: scopedWhere(drawingChildrenScope(scope), { drawingId }),
        order: {
          versionNumber: 'DESC'
        }
      }),
      this.logRepository.find({
        where: scopedWhere(drawingChildrenScope(scope), { drawingId }),
        order: {
          createdAt: 'DESC'
        }
      }),
      this.publicationRepository.findOne({
        where: scopedWhere(drawingChildrenScope(scope), { drawingId, status: 'active' }),
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

  private collaborationService() {
    return new ExcalidrawCollaborationService({
      drawingRepository: this.drawingRepository,
      versionRepository: this.versionRepository,
      runtimeCapabilities: this.runtimeCapabilities,
      requireDrawing: this.requireDrawing.bind(this),
      getCurrentVersion: this.getCurrentVersion.bind(this),
      markSceneDiverged: this.markSceneDiverged.bind(this)
    })
  }
  createCollaborationSession(scope: ExcalidrawScope, id: string) {
    return this.collaborationService().createCollaborationSession(scope, id)
  }
  authorizeCollaborationDocument(context: CollaborationProviderContext) {
    return this.collaborationService().authorizeCollaborationDocument(context)
  }
  initializeCollaborationDocument(context: CollaborationProviderContext) {
    return this.collaborationService().initializeCollaborationDocument(context)
  }
  materializeCollaborationDocument(event: CollaborationMaterializationEvent) {
    return this.collaborationService().materializeCollaborationDocument(event)
  }
  requireCanonicalDrawing(scope: ExcalidrawScope, id: string) {
    return this.collaborationService().requireCanonicalDrawing(scope, id)
  }
  private applyCollaborativePatch(
    scope: ExcalidrawScope,
    drawing: ExcalidrawDrawing,
    input: PatchExcalidrawSceneInput
  ) {
    return this.collaborationService().applyCollaborativePatch(scope, drawing, input)
  }
  private replaceCollaborativeScene(
    scope: ExcalidrawScope,
    drawing: ExcalidrawDrawing,
    input: ExcalidrawSceneInput,
    origin: string
  ) {
    return this.collaborationService().replaceCollaborativeScene(scope, drawing, input, origin)
  }
  private collaborationOrNull() {
    return this.runtimeCapabilities?.get(CollaborationRuntimeCapability) ?? null
  }

  publishDrawingViewerArtifact(
    scope: ExcalidrawScope,
    input: Parameters<ExcalidrawSharingService['publishDrawingViewerArtifact']>[1]
  ) {
    return this.sharing().publishDrawingViewerArtifact(scope, input)
  }

  revokeArtifactShare(scope: ExcalidrawScope, drawingId: string) {
    return this.sharing().revokeArtifactShare(scope, drawingId)
  }

  private sharing() {
    return new ExcalidrawSharingService({
      publicationRepository: this.publicationRepository,
      requireCanonicalDrawing: this.requireCanonicalDrawing.bind(this),
      getCurrentVersion: this.getCurrentVersion.bind(this),
      workspaceFiles: this.workspaceFiles.bind(this),
      artifacts: this.artifacts.bind(this),
      artifactViewer: this.artifactViewer.bind(this),
      revokeArtifactLinkBestEffort: this.revokeArtifactLinkBestEffort.bind(this)
    })
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
      where: scopedWhere(drawingChildrenScope(scope), { drawingId: scopedDrawingId })
    })
    const artifactIds = new Set<string>()
    for (const publication of publications) {
      if (publication.artifactLinkId && publication.status === 'active') {
        await this.revokeArtifactLinkBestEffort(publication.artifactLinkId)
      }
      artifactIds.add(publication.artifactId)
      await this.workspaceFiles()
        .deleteFile(publication.workspaceFileReference)
        .catch(() => undefined)
    }
    for (const artifactId of artifactIds) {
      await this.artifacts()
        .deleteArtifact(artifactId)
        .catch(() => undefined)
    }

    await this.publicationRepository.delete(scopedWhere(drawingChildrenScope(scope), { drawingId: scopedDrawingId }))
    await this.logRepository.delete(scopedWhere(drawingChildrenScope(scope), { drawingId: scopedDrawingId }))
    await this.versionRepository.delete(scopedWhere(drawingChildrenScope(scope), { drawingId: scopedDrawingId }))
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
      where: scopedWhere(drawingChildrenScope(scope), { id: normalizedVersionId, drawingId: scopedDrawingId })
    })
    if (!version) {
      throw new NotFoundException('Excalidraw drawing version was not found.')
    }

    await this.logRepository.delete(scopedWhere(drawingChildrenScope(scope), { drawingId: scopedDrawingId, versionId: normalizedVersionId }))
    await this.versionRepository.delete(scopedWhere(drawingChildrenScope(scope), { id: normalizedVersionId, drawingId: scopedDrawingId }))

    const remainingVersions = await this.versionRepository.find({
      where: scopedWhere(drawingChildrenScope(scope), { drawingId: scopedDrawingId }),
      order: {
        versionNumber: 'DESC'
      }
    })
    const shouldReplaceCurrentVersion = drawing.currentVersionId === normalizedVersionId
    const nextCurrentVersion = shouldReplaceCurrentVersion ? remainingVersions[0] ?? null : null
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
      currentVersionId: shouldReplaceCurrentVersion ? nextCurrentVersion?.id ?? null : drawing.currentVersionId,
      currentVersionNumber: shouldReplaceCurrentVersion
        ? nextCurrentVersion?.versionNumber ?? 0
        : drawing.currentVersionNumber ?? 0
    }
  }

  async restoreVersion(
    scope: ExcalidrawScope,
    drawingId: string,
    versionId: string,
    changeSummary?: string,
    expectedRevision?: number
  ) {
    if (!this.collaborationOrNull() && !excalidrawUnitOfWork.getStore())
      return this.baseDrawingRepository.manager.transaction((manager) =>
        excalidrawUnitOfWork.run({ manager }, () =>
          this.restoreVersion(scope, drawingId, versionId, changeSummary, expectedRevision)
        )
      )
    let drawing = await this.requireCanonicalDrawing(scope, drawingId)
    this.assertSceneRevision(drawing, expectedRevision)
    const version = await this.versionRepository.findOne({
      where: scopedWhere(drawingChildrenScope(scope), { id: versionId, drawingId })
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
    if (input.drawingId) await this.requireDrawing(scope, input.drawingId)
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
      isCheckpoint?: boolean
    }
  ) {
    const scene = validateScene(input, `Excalidraw ${input.sourceType} scene`)
    if (!this.collaborationOrNull()) {
      const updated = await this.drawingRepository
        .createQueryBuilder()
        .update()
        .set({ revision: () => 'revision + 1' })
        .where('id = :id AND revision = :revision', { id: drawing.id, revision: drawing.revision ?? 0 })
        .execute()
      if (updated.affected !== 1) throw new ConflictException('scene_revision_conflict')
    }
    if (!this.collaborationOrNull()) drawing.revision = (drawing.revision ?? 0) + 1
    const currentVersionNumber = drawing.currentVersionNumber ?? 0
    const versionNumber = currentVersionNumber + 1
    const version = await this.versionRepository.save(
      this.versionRepository.create({
        ...scopedCreate(drawingStorageScope(scope, drawing)),
        drawingId: drawing.id as string,
        versionNumber,
        sourceType: input.sourceType,
        isCheckpoint: input.isCheckpoint ?? false,
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

    await this.markSceneDiverged(scope, drawing.id, input.sourceType)
    return version
  }

  private async updateCurrentVersion(
    scope: ExcalidrawScope,
    drawing: ExcalidrawDrawing,
    input: ExcalidrawSceneInput & {
      sourceType: ExcalidrawVersionSource
      changeSummary?: string
      isCheckpoint?: boolean
    }
  ) {
    if (this.collaborationOrNull()) {
      return this.replaceCollaborativeScene(scope, drawing, input, `excalidraw:${input.sourceType}:update-current`)
    }
    const currentVersion = await this.getCurrentVersion(scope, drawing)
    if (!currentVersion || currentVersion.isCheckpoint) return this.createVersion(scope, drawing, input)
    const scene = validateScene(input, `Excalidraw ${input.sourceType} scene`)
    if (!this.collaborationOrNull()) {
      const updated = await this.drawingRepository
        .createQueryBuilder()
        .update()
        .set({ revision: () => 'revision + 1' })
        .where('id = :id AND revision = :revision', { id: drawing.id, revision: drawing.revision ?? 0 })
        .execute()
      if (updated.affected !== 1) throw new ConflictException('scene_revision_conflict')
    }
    if (!this.collaborationOrNull()) drawing.revision = (drawing.revision ?? 0) + 1

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

    await this.markSceneDiverged(scope, drawing.id, input.sourceType)
    return version
  }

  workspaceFiles() {
    const capability = this.runtimeCapabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!capability) throw new Error('Platform Workspace Files capability is not available.')
    return capability
  }

  artifacts() {
    const capability = this.runtimeCapabilities?.get(ArtifactsRuntimeCapability)
    if (!capability) throw new Error('Platform Artifacts capability is not available.')
    return capability
  }

  artifactViewer() {
    return this.artifactViewerService ?? new ExcalidrawArtifactViewerService()
  }

  async revokeArtifactLinkBestEffort(linkId: string) {
    try {
      await this.artifacts().revokeArtifactLink(linkId)
    } catch {
      // Link cleanup is idempotent and must not hide the primary publish/delete operation.
    }
  }

  async getCurrentVersion(scope: ExcalidrawScope, drawing: ExcalidrawDrawing) {
    if (!drawing.currentVersionId) {
      return null
    }
    return this.versionRepository.findOne({
      where: scopedWhere(drawingChildrenScope(scope), { id: drawing.currentVersionId, drawingId: drawing.id as string })
    })
  }

  async requireDrawing(scope: ExcalidrawScope, drawingId: string) {
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
