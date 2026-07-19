import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import { generateKeyBetween } from 'fractional-indexing'
import { ILike, Repository } from 'typeorm'
import type { FindOptionsWhere } from 'typeorm'
import * as Y from 'yjs'
import { CollaborationRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN } from '@xpert-ai/plugin-sdk'
import type {
  AgentMiddlewareRuntimeCapabilityRegistry,
  CollaborationMaterializationEvent,
  CollaborationPresencePatch,
  CollaborationProviderContext
} from '@xpert-ai/plugin-sdk'
import { CanvasActionLog, CanvasDocument, CanvasDocumentVersion } from './entities/index.js'
import {
  CanvasSnapshotValidationError,
  compactSnapshotForAgent,
  createEmptyCanvasSnapshot,
  isCanvasSnapshot,
  normalizeCanvasSnapshot,
  sanitizeCanvasSnapshot,
  summarizeSnapshot
} from './canvas-snapshot.validation.js'
import type {
  AutosaveCanvasSnapshotInput,
  ApplyCanvasRecordBatchInput,
  CanvasActionType,
  CanvasActorType,
  CanvasJsonObject,
  CanvasJsonValue,
  CanvasRecord,
  CanvasScope,
  CanvasSnapshotData,
  CanvasSnapshotImageInput,
  CanvasWorkspaceFileScope,
  CanvasWorkspaceFilesApi,
  CreateCanvasDocumentInput,
  GetCanvasDocumentInput,
  GetCanvasDocumentSummaryInput,
  GetCanvasRecordInput,
  GetCanvasRecordForAgentInput,
  InsertCanvasImageInput,
  ListCanvasRecordsInput,
  PatchCanvasRecordsInput,
  PrepareCanvasAssistantPromptInput,
  ReportCanvasFailureInput,
  SaveCanvasSnapshotInput,
  SearchCanvasDocumentsInput,
  UpdateCanvasDocumentStatusInput
} from './types.js'
import { CANVAS_WORKSPACE_FILES_RUNTIME_CAPABILITY } from './types.js'
import {
  createCanvasYDoc,
  decodeCanvasYDoc,
  encodeCanvasYDoc,
  getCanvasYjsOperation,
  materializeCanvasYDoc,
  patchCanvasYDoc,
  writeCanvasSnapshotToYDoc
} from './canvas-yjs.js'
import { CANVAS_COLLABORATION_PROVIDER_KEY, CANVAS_COLLABORATION_SCHEMA_VERSION } from './constants.js'
import type { CanvasAwarenessV1 } from './types.js'
import { CanvasArtifactService } from './canvas-artifact.service.js'
import { CanvasArtifactExportService } from './canvas-artifact-export.service.js'
import {
  asCanvasAgentOperationMarker,
  assertMatchingOperation,
  assertRequestedRecordsSurvivedNormalization,
  createCanvasAgentOperationMarker,
  detailCanvasRecord,
  diffCanvasAgentRecords,
  listCanvasRecordSummaries,
  prepareCanvasAgentRecordBatch
} from './canvas-agent-records.js'

type ScopedEntity = {
  tenantId?: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
}

type SnapshotImageFileFields = {
  snapshotImagePath?: string
  snapshotImageUrl?: string
  snapshotImageMimeType?: string
  snapshotImageSize?: number
  snapshotImageChecksum?: string
  workspaceCatalog?: CanvasWorkspaceFileScope['catalog']
  workspaceScopeId?: string
}

const SNAPSHOT_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const SAVE_SNAPSHOT_REQUIRED_MESSAGE =
  'canvas_save_snapshot requires a complete tldraw snapshot; do not call it after canvas_insert_image unless you are replacing the whole canvas.'

@Injectable()
export class CanvasService {
  constructor(
    @InjectRepository(CanvasDocument)
    private readonly documentRepository: Repository<CanvasDocument>,
    @InjectRepository(CanvasDocumentVersion)
    private readonly versionRepository: Repository<CanvasDocumentVersion>,
    @InjectRepository(CanvasActionLog)
    private readonly logRepository: Repository<CanvasActionLog>,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: AgentMiddlewareRuntimeCapabilityRegistry,
    @Optional()
    private readonly artifactService?: CanvasArtifactService,
    @Optional()
    private readonly artifactExportService?: CanvasArtifactExportService
  ) {}

  async createDocument(scope: CanvasScope, input: CreateCanvasDocumentInput) {
    const title = normalizeRequired(input.title, 'Canvas title is required.')
    const document = await this.documentRepository.save(
      this.documentRepository.create({
        ...scopedCreate(scope),
        assistantId: scope.assistantId ?? null,
        conversationId: scope.conversationId ?? null,
        title,
        description: normalizeOptional(input.description),
        kind: input.kind ?? 'canvas',
        status: 'draft',
        tags: normalizeStringArray(input.tags),
        source: normalizeOptional(input.source),
        currentVersionNumber: 0,
        lastEditedById: scope.userId ?? null,
        lastEditedAt: new Date()
      })
    )

    await this.writeLog(scope, {
      documentId: document.id,
      action: 'document_created',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: `Canvas "${title}" was created.`,
      snapshot: { title, kind: document.kind, source: document.source }
    })

    if (hasSnapshotContent(input)) {
      const snapshot = normalizeSnapshotInput(input.snapshot)
      const imageFields = input.snapshotImage
        ? await this.uploadSnapshotImage(scope, document, input.snapshotImage, {
            mode: 'current',
            sourceType: input.source === 'import' ? 'import' : scope.assistantId ? 'agent_snapshot' : 'workbench',
            versionNumber: document.currentVersionNumber ?? 0
          })
        : undefined
      await this.saveWorkingCopy(scope, document, {
        snapshot,
        viewState: normalizeObject(input.viewState),
        selectionSummary: normalizeObject(input.selectionSummary),
        imageFields
      })
    }

    await this.ensureCollaborationDocument(document.id as string)

    return this.getDocument(scope, { documentId: document.id as string, includeSnapshot: true })
  }

  async saveSnapshot(scope: CanvasScope, input: SaveCanvasSnapshotInput) {
    const snapshot = normalizeRequiredSnapshotInput(input.snapshot)
    if (input.sourceType && input.sourceType !== 'workbench') {
      throw new BadRequestException('Canvas versions can only be created from the human Workbench New Version action.')
    }
    const document = await this.requireCanonicalDocument(scope, input.documentId)
    const version = await this.createVersion(scope, document, {
      sourceType: 'workbench',
      snapshot,
      viewState: normalizeObject(input.viewState),
      selectionSummary: normalizeObject(input.selectionSummary),
      snapshotImage: input.snapshotImage,
      changeSummary: normalizeOptional(input.changeSummary) ?? 'Canvas snapshot saved'
    })

    await this.writeLog(scope, {
      documentId: document.id,
      versionId: version.id,
      action: 'snapshot_saved',
      actorType: 'user',
      message: input.changeSummary,
      snapshot: summarizeSnapshot(version.snapshot)
    })

    return {
      success: true,
      message: 'Canvas snapshot was saved.',
      document: compactDocument(document),
      version: compactVersion(version)
    }
  }

  /** Replace the current working copy from a human file import without creating a version. */
  async importSnapshotToWorkingCopy(scope: CanvasScope, input: SaveCanvasSnapshotInput) {
    const snapshot = normalizeRequiredSnapshotInput(input.snapshot)
    const current = await this.requireCanonicalDocument(scope, input.documentId)
    const document = await this.replaceCanvasSnapshot(scope, current, snapshot, 'canvas:user:import_snapshot')
    await this.writeLog(scope, {
      documentId: document.id,
      action: 'snapshot_imported',
      actorType: 'user',
      message: input.changeSummary ?? 'Canvas snapshot imported into the working copy.',
      snapshot: summarizeSnapshot(snapshot)
    })
    return {
      success: true,
      message: 'Canvas snapshot was imported into the working copy.',
      document: compactDocument(document),
      workingCopyRevision: currentWorkingCopyRevision(document),
      snapshotChecksum: document.snapshotChecksum ?? checksumSnapshot(snapshot)
    }
  }

  async autosaveSnapshot(scope: CanvasScope, input: AutosaveCanvasSnapshotInput) {
    const document = await this.requireCanonicalDocument(scope, input.documentId)
    const snapshot = normalizeSnapshotInput(document.autosaveSnapshot ?? input.snapshot)
    const viewState = normalizeObject(input.viewState)
    const selectionSummary = normalizeObject(input.selectionSummary)
    const imageFields = await this.uploadSnapshotImage(scope, document, input.snapshotImage, {
      mode: 'current',
      sourceType: 'workbench',
      versionNumber: document.currentVersionNumber ?? 0
    })
    const autosaveUpdatedAt = new Date()
    const savedDocument = await this.documentRepository.save({
      ...document,
      autosaveViewState: viewState,
      autosaveSelectionSummary: selectionSummary,
      autosaveUpdatedAt,
      ...(imageFields ?? {}),
      lastEditedById: scope.userId ?? null,
      lastEditedAt: autosaveUpdatedAt
    })

    return {
      success: true,
      message: 'Canvas working copy was autosaved.',
      document: compactDocument(savedDocument),
      autosave: compactAutosave(savedDocument, snapshot)
    }
  }

  async patchRecords(scope: CanvasScope, input: PatchCanvasRecordsInput) {
    const document = await this.requireCanonicalDocument(scope, input.documentId)
    const currentState = await this.getCurrentCanvasState(scope, document)
    const snapshot = structuredClone(currentState.snapshot)
    if (!isCanvasSnapshot(snapshot)) {
      throw new BadRequestException('Current canvas snapshot is invalid.')
    }

    const nextStore: Record<string, CanvasRecord> = { ...snapshot.store }
    const removeIds = collectUniqueStrings(input.removeRecordIds ?? [], 'removeRecordIds')
    for (const id of removeIds) {
      delete nextStore[id]
    }
    for (const record of input.putRecords ?? []) {
      if (!isPlainObject(record) || typeof record.id !== 'string' || !record.id.trim()) {
        throw new BadRequestException('Every putRecords item must be a tldraw record with a non-empty id.')
      }
      nextStore[record.id] = record
    }

    const normalized = normalizeSnapshotInput({
      ...snapshot,
      store: nextStore
    })
    const viewState = {
      ...normalizeObject(currentState.viewState),
      ...normalizeObject(input.viewStatePatch)
    }
    const selectionSummary =
      input.selectionSummary === undefined ? normalizeObject(currentState.selectionSummary) : normalizeObject(input.selectionSummary)
    const savedDocument = await this.mutateCanvas(scope, document, 'canvas:agent:patch_records', {
      putRecords: (input.putRecords ?? []).map((record) => normalized.store[record.id]),
      removeRecordIds: removeIds
    })
    savedDocument.autosaveViewState = viewState
    savedDocument.autosaveSelectionSummary = selectionSummary
    await this.documentRepository.save(savedDocument)

    await this.writeLog(scope, {
      documentId: document.id,
      versionId: currentState.version?.id,
      action: 'records_patched',
      actorType: 'agent',
      message: input.changeSummary,
      snapshot: {
        putRecordCount: input.putRecords?.length ?? 0,
        removeRecordIds: removeIds,
        summary: summarizeSnapshot(normalized)
      }
    })

    return {
      success: true,
      message: 'Canvas records were patched in the working copy.',
      document: compactDocument(savedDocument),
      autosave: compactAutosave(savedDocument, normalized)
    }
  }

  /** Apply one bounded Agent stage. Existing records use checksum preconditions; new records remain CRDT-mergeable. */
  async applyAgentRecordBatch(scope: CanvasScope, input: ApplyCanvasRecordBatchInput) {
    const document = await this.requireCanonicalDocument(scope, input.documentId)
    const collaborationDocument = await this.ensureCollaborationDocument(input.documentId)
    const state = await this.collaboration().getDocumentState({ documentId: collaborationDocument.id })
    const ydoc = decodeCanvasYDoc(state.updateBase64)
    const operationValue = getCanvasYjsOperation(ydoc, input.operationId)
    const existingOperation = asCanvasAgentOperationMarker(operationValue)
    if (operationValue && !existingOperation) {
      throw new ConflictException(`[CANVAS_OPERATION_MARKER_INVALID] operationId ${input.operationId} has an invalid stored marker.`)
    }
    if (existingOperation) {
      assertMatchingOperation(existingOperation, input)
      return recordBatchReceipt({
        input,
        marker: existingOperation,
        duplicate: true,
        revisionBefore: existingOperation.baseRevision,
        workingCopyRevision: state.sequenceNumber
      })
    }
    if (input.baseRevision > state.sequenceNumber) {
      throw new ConflictException(
        `[CANVAS_REVISION_CONFLICT] baseRevision ${input.baseRevision} is newer than current revision ${state.sequenceNumber}. Read the Canvas summary again.`
      )
    }

    const snapshot = normalizeSnapshotInput(materializeCanvasYDoc(ydoc))
    const prepared = prepareCanvasAgentRecordBatch(snapshot, input)
    const validation = sanitizeCanvasSnapshot(prepared.candidate)
    if (!validation.snapshot) {
      const details = validation.skippedRecords.length
        ? validation.skippedRecords.map((issue) => `${issue.id}: ${issue.reason}`).join('; ')
        : '(snapshot): tldraw rejected the candidate snapshot without a validation detail'
      throw new BadRequestException(`[CANVAS_INVALID_RECORD_BATCH] ${details}`)
    }
    const normalized = validation.snapshot
    assertRequestedRecordsSurvivedNormalization(normalized, [
      ...prepared.createdRecordIds,
      ...prepared.updatedRecordIds
    ], validation.skippedRecords)
    const delta = diffCanvasAgentRecords(snapshot, normalized)
    const marker = createCanvasAgentOperationMarker(input, prepared)
    const expectedSequence = prepared.updatedRecordIds.length || prepared.removedRecordIds.length
      ? state.sequenceNumber
      : undefined
    const update = patchCanvasYDoc(ydoc, {
      ...delta,
      operation: marker
    }, `canvas:agent:stage:${input.operationId}`)
    let applied: Awaited<ReturnType<ReturnType<CanvasService['collaboration']>['applyUpdate']>>
    try {
      applied = await this.collaboration().applyUpdate({
        documentId: collaborationDocument.id,
        updateBase64: Buffer.from(update).toString('base64'),
        origin: `canvas:agent:stage:${input.operationId}`,
        expectedSequence,
        actor: {
          actorType: 'agent',
          actorKey: scope.assistantId ?? scope.userId ?? null,
          displayName: scope.assistantDisplayName ?? null
        }
      })
    } catch (error) {
      if (expectedSequence !== undefined) {
        const latest = await this.collaboration().getDocumentState({ documentId: collaborationDocument.id })
        if (latest.sequenceNumber !== state.sequenceNumber) {
          throw new ConflictException(
            `[CANVAS_REVISION_CONFLICT] Canvas advanced from revision ${state.sequenceNumber} to ${latest.sequenceNumber}. Read the affected records and retry this stage with a new operationId.`
          )
        }
      }
      throw error
    }

    await this.requireCanonicalDocument(scope, input.documentId)
    const cascadedRecordIds = delta.removeRecordIds.filter((recordId) => !prepared.removedRecordIds.includes(recordId))
    await this.writeLog(scope, {
      documentId: document.id,
      action: 'records_patched',
      actorType: 'agent',
      message: input.changeSummary,
      snapshot: {
        operationId: input.operationId,
        batchId: input.batchId,
        stageIndex: input.stageIndex,
        isFinalStage: input.isFinalStage,
        createdRecordIds: prepared.createdRecordIds,
        updatedRecordIds: prepared.updatedRecordIds,
        removedRecordIds: prepared.removedRecordIds,
        cascadedRecordIds
      }
    })

    return recordBatchReceipt({
      input,
      marker,
      duplicate: Boolean(applied.duplicate),
      revisionBefore: state.sequenceNumber,
      workingCopyRevision: applied.sequenceNumber,
      cascadedRecordIds
    })
  }

  async insertImage(scope: CanvasScope, input: InsertCanvasImageInput) {
    requireInsertImageSource(input)
    const target = normalizeInsertionTargetInput(input)
    const documentId = normalizeOptional(input.documentId) ?? target.documentId
    if (!documentId) {
      throw new BadRequestException('canvas_insert_image requires documentId or target.documentId. Use env.canvasDocumentId for the current Workbench canvas.')
    }
    const document = await this.requireCanonicalDocument(scope, documentId)
    const dataUrl = await this.resolveInsertImageData(scope, document, input)
    const imageSize = readImageSizeFromDataUrl(dataUrl, input)
    const currentState = await this.getCurrentCanvasState(scope, document)
    const snapshot = structuredClone(currentState.snapshot)
    if (!isCanvasSnapshot(snapshot)) {
      throw new BadRequestException('Current canvas snapshot is invalid.')
    }

    const originalStore = snapshot.store
    const store: Record<string, CanvasRecord> = { ...snapshot.store }
    const anchorShape = target.anchorShapeId ? store[target.anchorShapeId] : null
    let pageId = target.pageId ?? findPageIdForShape(store, anchorShape?.id) ?? findFirstPageId(store)
    if (!pageId || !isPageRecord(store[pageId])) {
      ensureDefaultCanvasPage(store)
      pageId = (pageId && isPageRecord(store[pageId]) ? pageId : null) ?? findFirstPageId(store)
    }
    if (!pageId || !isPageRecord(store[pageId])) {
      throw new BadRequestException('Could not determine target canvas page.')
    }

    const holderPlacement = isAiImageHolder(anchorShape)
    const imageAnchorReplacement = isImageShape(anchorShape) && target.replaceExistingForAnchor
    const parentId = imageAnchorReplacement
      ? anchorShape.parentId ?? pageId
      : holderPlacement
        ? anchorShape.id
        : anchorShape?.parentId && store[anchorShape.parentId]?.typeName === 'page'
          ? anchorShape.parentId
          : pageId
    const anchorBounds = holderPlacement ? null : pageBoundsForShape(store, anchorShape)
    const holderBounds = holderPlacement ? pageBoundsForShape(store, anchorShape) : null
    const matchAnchor = target.matchAnchor !== false && (holderBounds || anchorBounds)
    const displayWidth = target.displayWidth ?? (matchAnchor ? (holderBounds ?? anchorBounds)?.w : Math.min(imageSize.width, 512)) ?? imageSize.width
    const displayHeight =
      target.displayHeight ??
      (matchAnchor ? (holderBounds ?? anchorBounds)?.h : Math.round(displayWidth * (imageSize.height / imageSize.width))) ??
      imageSize.height
    const bounds = imageAnchorReplacement
      ? {
          x: finiteNumber(anchorShape.x, 0),
          y: finiteNumber(anchorShape.y, 0),
          w: displayWidth,
          h: displayHeight
        }
      : holderPlacement
        ? { x: 0, y: 0, w: displayWidth, h: displayHeight }
        : choosePlacement({
            store,
            pageId,
            parentId,
            anchorShape,
            width: displayWidth,
            height: displayHeight,
            margin: target.margin,
            placement: target.placement
          })

    const replaced = holderPlacement && target.replaceExistingForAnchor ? removeGeneratedImagesForAnchor(store, anchorShape.id) : { shapeIds: [], assetIds: [] }
    const sourceFileName = fileNameFromPath(input.workspaceFilePath)
    const seed = sanitizeIdPart(sourceFileName ?? `canvas-image-${Date.now()}`)
    const assetId = uniqueRecordId(store, 'asset', seed)
    const shapeId = imageAnchorReplacement ? anchorShape.id : uniqueRecordId(store, 'shape', seed)
    const fileName = sanitizeFileName(sourceFileName ?? `${seed}.${extensionFromMimeType(dataUrl.mimeType).replace('.', '')}`, dataUrl.mimeType)
    const fileSize = Buffer.byteLength(dataUrl.base64, 'base64')
    const index = imageAnchorReplacement ? anchorShape.index : chooseIndex(store, parentId)
    const replacedAssetId = imageAnchorReplacement && typeof anchorShape.props?.assetId === 'string' ? anchorShape.props.assetId : null

    const assetRecord: CanvasRecord = {
      id: assetId,
      typeName: 'asset',
      type: 'image',
      props: {
        name: fileName,
        src: dataUrl.url,
        w: imageSize.width,
        h: imageSize.height,
        fileSize,
        mimeType: dataUrl.mimeType,
        isAnimated: false
      },
      meta: {}
    }
    const shapeRecord: CanvasRecord = imageAnchorReplacement
      ? {
          ...anchorShape,
          id: shapeId,
          parentId,
          index,
          props: {
            ...normalizeObject(anchorShape.props),
            w: bounds.w,
            h: bounds.h,
            assetId,
            playing: true,
            url: '',
            crop: null,
            altText: normalizeOptional(typeof anchorShape.props?.altText === 'string' ? anchorShape.props.altText : undefined) ?? 'Canvas inserted image'
          },
          meta: {
            ...normalizeObject(anchorShape.meta),
            canvasGeneratedReplacement: true,
            source: 'canvas_insert_image'
          }
        }
      : {
          x: bounds.x,
          y: bounds.y,
          rotation: 0,
          isLocked: false,
          opacity: 1,
          meta: {
            ...(holderPlacement ? { canvasGeneratedForAiImageHolder: anchorShape.id } : { canvasGeneratedStandalone: true }),
            source: 'canvas_insert_image'
          },
          id: shapeId,
          type: 'image',
          props: {
            w: bounds.w,
            h: bounds.h,
            assetId,
            playing: true,
            url: '',
            crop: null,
            flipX: false,
            flipY: false,
            altText: 'Canvas inserted image'
          },
          parentId,
          index,
          typeName: 'shape'
        }

    store[assetId] = assetRecord
    store[shapeId] = shapeRecord
    const replacedByImageAnchor = imageAnchorReplacement ? removeUnusedAssets(store, replacedAssetId ? [replacedAssetId] : []) : { shapeIds: [], assetIds: [] }
    const replacedRecords = {
      shapeIds: imageAnchorReplacement ? [shapeId] : replaced.shapeIds,
      assetIds: [...replaced.assetIds, ...replacedByImageAnchor.assetIds]
    }

    const normalized = normalizeSnapshotInput({
      ...snapshot,
      store
    })
    const selectionSummary = {
      selectedShapes: [shapeRecord],
      insertedShapeId: shapeId,
      source: 'canvas_insert_image'
    }
    const delta = diffCanvasRecords(originalStore, normalized.store)
    const savedDocument = await this.mutateCanvas(scope, document, 'canvas:agent:insert_image', delta)
    savedDocument.autosaveViewState = normalizeObject(currentState.viewState)
    savedDocument.autosaveSelectionSummary = selectionSummary
    await this.documentRepository.save(savedDocument)

    await this.writeLog(scope, {
      documentId: document.id,
      versionId: currentState.version?.id,
      action: 'image_inserted',
      actorType: 'agent',
      message: input.changeSummary,
      snapshot: {
        assetId,
        shapeId,
        pageId,
        parentId,
        anchorShapeId: target.anchorShapeId,
        replacedShapeIds: replacedRecords.shapeIds,
        replacedAssetIds: replacedRecords.assetIds,
        bounds,
        imageSize
      }
    })

    return {
      success: true,
      message: 'Image was inserted into the canvas working copy.',
      document: compactDocument(savedDocument),
      autosave: compactAutosave(savedDocument, normalized),
      insertion: {
        pageId,
        parentId,
        anchorShapeId: target.anchorShapeId,
        assetId,
        shapeId,
        index,
        replacedShapeIds: replacedRecords.shapeIds,
        replacedAssetIds: replacedRecords.assetIds,
        imageSize,
        bounds
      }
    }
  }

  async searchDocuments(scope: CanvasScope, query: SearchCanvasDocumentsInput = {}) {
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.max(1, Math.min(query.pageSize ?? 20, 50))
    const search = query.search?.trim() ?? ''
    const baseWhere = scopedWhere(scope, {
      ...(query.status ? { status: query.status } : {}),
      ...(query.kind ? { kind: query.kind } : {})
    }) as FindOptionsWhere<CanvasDocument>
    const where = search
      ? [
          { ...baseWhere, title: ILike(`%${search}%`) },
          { ...baseWhere, description: ILike(`%${search}%`) }
        ]
      : baseWhere
    const [items, total] = await this.documentRepository.findAndCount({
      where,
      order: {
        updatedAt: 'DESC',
        id: 'ASC'
      },
      skip: (page - 1) * pageSize,
      take: pageSize
    })

    return {
      items,
      total,
      page,
      pageSize,
      search: search.toLowerCase()
    }
  }

  async getDocument(scope: CanvasScope, input: GetCanvasDocumentInput) {
    const document = await this.requireCanonicalDocument(scope, input.documentId)
    const versionLimit = Math.max(1, Math.min(input.versionLimit ?? 20, 100))
    const logLimit = Math.max(1, Math.min(input.logLimit ?? 10, 50))
    const logWhere = scopedWhere(scope, { documentId: document.id }) as object as FindOptionsWhere<CanvasActionLog>
    const [versions, logs] = await Promise.all([
      this.versionRepository.find({
        where: scopedWhere(scope, { documentId: document.id }),
        order: {
          versionNumber: 'DESC'
        },
        take: versionLimit
      }),
      input.includeLogs
        ? this.logRepository.find({
            where: logWhere,
            order: {
              createdAt: 'DESC'
            },
            take: logLimit
          })
        : Promise.resolve([])
    ])
    const currentVersion = versions.find((version) => version.id === document.currentVersionId) ?? versions[0] ?? null
    const requestedVersion = selectRequestedVersion({ currentVersion, versions }, input)
    const explicitVersion = hasExplicitVersionRequest(input)
    const workingCopy = formatWorkingCopy(document, Boolean(input.includeSnapshot))
    const effectiveSnapshot = explicitVersion ? requestedVersion?.snapshot ?? null : document.autosaveSnapshot ?? currentVersion?.snapshot ?? null
    const effectiveSceneSource = explicitVersion ? 'version' : document.autosaveSnapshot ? 'autosave' : 'version'

    return {
      item: document,
      currentVersion: formatVersionForResponse(currentVersion, Boolean(input.includeSnapshot)),
      requestedVersion: requestedVersion && requestedVersion.id !== currentVersion?.id ? formatVersionForResponse(requestedVersion, Boolean(input.includeSnapshot)) : null,
      workingCopy,
      workingCopyRevision: currentWorkingCopyRevision(document),
      snapshotChecksum: document.snapshotChecksum ?? checksumSnapshot(document.autosaveSnapshot) ?? (isCanvasSnapshot(effectiveSnapshot) ? checksumSnapshot(effectiveSnapshot) : null),
      versions: versions.map((version) => compactVersion(version)),
      logs,
      snapshotSummary: summarizeSnapshot(effectiveSnapshot),
      scene: input.includeSnapshot ? effectiveSnapshot : compactSnapshotForAgent(effectiveSnapshot),
      sceneSource: effectiveSceneSource,
      snapshotImagePath: explicitVersion ? requestedVersion?.snapshotImagePath ?? null : document.snapshotImagePath ?? currentVersion?.snapshotImagePath ?? null,
      snapshotImageUrl: explicitVersion ? requestedVersion?.snapshotImageUrl ?? null : document.snapshotImageUrl ?? currentVersion?.snapshotImageUrl ?? null,
      snapshotImageUpdatedAt: explicitVersion ? requestedVersion?.createdAt ?? null : document.autosaveUpdatedAt ?? currentVersion?.createdAt ?? null,
      nextActions: [
        'Open the Canvas Workbench to review or edit the canvas.',
        'Use canvas_list_records for bounded discovery and canvas_get_record for one exact record.',
        'Use staged canvas_patch_records calls for Agent edits. A human can create a version from the Workbench version panel.'
      ]
    }
  }

  async getDocumentSummaryForAgent(scope: CanvasScope, input: GetCanvasDocumentSummaryInput) {
    const document = await this.requireCanonicalDocument(scope, input.documentId)
    const workingCopyRevision = currentWorkingCopyRevision(document)
    assertCanvasRevision(input.expectedRevision, workingCopyRevision)
    const snapshot = isCanvasSnapshot(document.autosaveSnapshot) ? document.autosaveSnapshot : createEmptyCanvasSnapshot()
    return {
      documentId: document.id,
      title: document.title,
      description: document.description,
      kind: document.kind,
      status: document.status,
      tags: document.tags,
      currentVersionId: document.currentVersionId,
      currentVersionNumber: document.currentVersionNumber,
      workingCopyRevision,
      snapshotChecksum: document.snapshotChecksum ?? checksumSnapshot(snapshot),
      snapshotSummary: summarizeSnapshot(snapshot),
      hasSnapshotImage: Boolean(document.snapshotImagePath),
      snapshotImageUpdatedAt: document.autosaveUpdatedAt,
      updatedAt: document.updatedAt,
      availableReads: [
        'canvas_list_records: page through bounded record summaries and discover ids/checksums.',
        'canvas_get_record: inspect one exact record before updating or removing it.'
      ],
      nextAction: 'List only the page, shape, asset, or binding records needed for the next stage.'
    }
  }

  async listRecordsForAgent(scope: CanvasScope, input: ListCanvasRecordsInput) {
    const document = await this.requireCanonicalDocument(scope, input.documentId)
    const workingCopyRevision = currentWorkingCopyRevision(document)
    assertCanvasRevision(input.expectedRevision, workingCopyRevision)
    if (!isCanvasSnapshot(document.autosaveSnapshot)) {
      throw new NotFoundException('Canvas working-copy records were not found.')
    }
    return {
      documentId: document.id,
      workingCopyRevision,
      ...listCanvasRecordSummaries(document.autosaveSnapshot, input),
      availableReads: ['canvas_get_record: fetch one exact record by id before updating or removing it.']
    }
  }

  async getRecord(scope: CanvasScope, input: GetCanvasRecordInput) {
    const explicitVersion = hasExplicitVersionRequest(input)
    const payload = await this.getDocument(scope, {
      documentId: input.documentId,
      versionId: input.versionId,
      versionNumber: input.versionNumber,
      includeSnapshot: true
    })
    const version = explicitVersion ? payload.requestedVersion ?? payload.currentVersion : payload.currentVersion
    const snapshot = explicitVersion && isVersionWithSnapshot(version) ? version.snapshot : payload.scene
    if (!isCanvasSnapshot(snapshot)) {
      throw new NotFoundException('Canvas snapshot was not found.')
    }
    const record = snapshot.store[input.recordId]
    if (!record) {
      throw new NotFoundException('Canvas record was not found.')
    }
    return {
      document: payload.item,
      version: compactVersion(isVersionWithSnapshot(version) ? version : null),
      sceneSource: payload.sceneSource,
      record
    }
  }

  async getRecordForAgent(scope: CanvasScope, input: GetCanvasRecordForAgentInput) {
    const document = await this.requireCanonicalDocument(scope, input.documentId)
    const workingCopyRevision = currentWorkingCopyRevision(document)
    assertCanvasRevision(input.expectedRevision, workingCopyRevision)
    if (!isCanvasSnapshot(document.autosaveSnapshot)) {
      throw new NotFoundException('Canvas working-copy records were not found.')
    }
    const record = document.autosaveSnapshot.store[input.recordId]
    if (!record) {
      throw new NotFoundException('Canvas record was not found.')
    }
    return {
      documentId: document.id,
      workingCopyRevision,
      sceneSource: 'working_copy',
      record: detailCanvasRecord(record),
      nextAction: 'Use the returned checksum in canvas_patch_records.updateRecords or removeRecords.'
    }
  }

  async updateDocumentStatus(scope: CanvasScope, input: UpdateCanvasDocumentStatusInput) {
    const document = await this.requireDocument(scope, input.documentId)
    if (input.status === 'archived') await this.artifactService?.archiveForDocument(scope, document)
    document.status = input.status
    document.lastEditedById = scope.userId ?? null
    document.lastEditedAt = new Date()
    await this.documentRepository.save(document)
    await this.writeLog(scope, {
      documentId: document.id,
      action: input.status === 'archived' ? 'document_archived' : 'status_updated',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: input.reason,
      snapshot: { status: input.status }
    })

    return {
      success: true,
      message: `Canvas status updated to ${input.status}.`,
      document: compactDocument(document)
    }
  }

  async reportFailure(scope: CanvasScope, input: ReportCanvasFailureInput) {
    await this.writeLog(scope, {
      documentId: input.documentId,
      versionId: input.versionId,
      action: 'failure_reported',
      actorType: 'agent',
      message: input.operation,
      errorMessage: normalizeRequired(input.errorMessage, 'Error message is required.'),
      snapshot: {
        operation: input.operation,
        recoverable: input.recoverable ?? true,
        evidence: input.evidence
      }
    })
    return {
      success: true,
      message: 'Canvas failure was recorded.'
    }
  }

  async restoreVersion(scope: CanvasScope, documentId: string, versionId: string, changeSummary?: string) {
    const document = await this.requireCanonicalDocument(scope, documentId)
    const version = await this.versionRepository.findOne({
      where: scopedWhere(scope, { documentId: document.id, id: versionId })
    })
    if (!version) {
      throw new NotFoundException('Canvas version was not found.')
    }
    const snapshot = normalizeSnapshotInput(version.snapshot)
    const restoredDocument = await this.replaceCanvasSnapshot(scope, document, snapshot, 'canvas:user:restore_version')
    restoredDocument.autosaveViewState = normalizeObject(version.viewState)
    restoredDocument.autosaveSelectionSummary = normalizeObject(version.selectionSummary)
    await this.documentRepository.save(restoredDocument)
    await this.writeLog(scope, {
      documentId: document.id,
      versionId: version.id,
      action: 'version_restored',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: changeSummary,
      snapshot: { restoredVersionId: version.id, restoredVersionNumber: version.versionNumber }
    })
    return {
      success: true,
      message: 'Canvas version was restored to the working copy.',
      document: compactDocument(restoredDocument),
      restoredVersion: compactVersion(version),
      autosave: compactAutosave(restoredDocument, snapshot)
    }
  }

  async deleteVersion(scope: CanvasScope, documentId: string, versionId: string) {
    const document = await this.requireDocument(scope, documentId)
    const version = await this.versionRepository.findOne({
      where: scopedWhere(scope, { documentId: document.id, id: versionId })
    })
    if (!version) {
      throw new NotFoundException('Canvas version was not found.')
    }
    const workspaceFiles = this.runtimeCapabilities?.get<CanvasWorkspaceFilesApi>(CANVAS_WORKSPACE_FILES_RUNTIME_CAPABILITY)
    if (workspaceFiles && version.snapshotImagePath) {
      try {
        await workspaceFiles.deleteFile({
          ...resolveVersionWorkspaceScope(scope, version),
          filePath: version.snapshotImagePath
        })
      } catch {
        // Version snapshot image cleanup is best-effort.
      }
    }

    await this.versionRepository.delete(scopedWhere(scope, { documentId: document.id, id: version.id }))
    const remaining = await this.versionRepository.find({
      where: scopedWhere(scope, { documentId: document.id }),
      order: {
        versionNumber: 'DESC'
      }
    })
    const nextCurrent = remaining[0] ?? null
    if (document.currentVersionId === version.id) {
      document.currentVersionId = nextCurrent?.id ?? null
      document.currentVersionNumber = nextCurrent?.versionNumber ?? 0
    }
    if (document.autosaveBaseVersionId === version.id) {
      document.autosaveBaseVersionId = nextCurrent?.id ?? null
    }
    document.lastEditedById = scope.userId ?? null
    document.lastEditedAt = new Date()
    await this.documentRepository.save(document)
    await this.writeLog(scope, {
      documentId: document.id,
      action: 'version_deleted',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: `Deleted version ${version.versionNumber}`,
      snapshot: { deletedVersionId: version.id, deletedVersionNumber: version.versionNumber }
    })

    return {
      success: true,
      message: 'Canvas version was deleted.',
      document: compactDocument(document),
      deletedVersionId: version.id,
      currentVersionId: document.currentVersionId ?? null,
      currentVersionNumber: document.currentVersionNumber ?? 0
    }
  }

  async deleteDocument(scope: CanvasScope, documentId: string) {
    const document = await this.requireDocument(scope, documentId)
    const versions = await this.versionRepository.find({
      where: scopedWhere(scope, { documentId: document.id })
    })
    await this.artifactExportService?.deleteForDocument(scope, document.id as string)
    await this.artifactService?.deleteForDocument(scope, document)
    const workspaceFiles = this.runtimeCapabilities?.get<CanvasWorkspaceFilesApi>(CANVAS_WORKSPACE_FILES_RUNTIME_CAPABILITY)
    if (workspaceFiles) {
      const cleanupTargets = [
        document.snapshotImagePath
          ? {
              filePath: document.snapshotImagePath,
              scope: resolveDocumentWorkspaceScope(scope, document)
            }
          : null,
        ...versions.map((version) =>
          version.snapshotImagePath
            ? {
                filePath: version.snapshotImagePath,
                scope: resolveVersionWorkspaceScope(scope, version)
              }
            : null
        )
      ].filter(Boolean) as Array<{ filePath: string; scope: CanvasWorkspaceFileScope }>
      await Promise.all(
        cleanupTargets.map(async (target) => {
          try {
            await workspaceFiles.deleteFile({
              ...target.scope,
              filePath: target.filePath
            })
          } catch {
            // Workspace file cleanup is best-effort; database deletion is authoritative.
          }
        })
      )
    }
    await this.collaboration().deleteDocument({
      providerKey: CANVAS_COLLABORATION_PROVIDER_KEY,
      resourceId: documentId
    })
    await Promise.all([
      this.versionRepository.delete(scopedWhere(scope, { documentId: document.id })),
      this.logRepository.delete(scopedWhere(scope, { documentId: document.id }))
    ])
    await this.documentRepository.delete(scopedWhere(scope, { id: document.id }))
    return {
      success: true,
      message: 'Canvas document was deleted.',
      deletedDocumentId: document.id
    }
  }

  async prepareAssistantPrompt(scope: CanvasScope, input: PrepareCanvasAssistantPromptInput) {
    const document = await this.requireDocument(scope, input.documentId)
    const instruction = normalizeOptional(input.instruction) ?? '请根据当前画布内容继续协助我。'
    const imagePath = normalizeOptional(document.snapshotImagePath)
    const lines = [
      `当前 Canvas 文档 id: ${document.id}`,
      `标题: ${document.title}`,
      `当前版本: ${document.currentVersionNumber ?? 0}`,
      `当前场景来源: ${document.autosaveSnapshot ? 'autosave' : 'version'}`,
      ...(imagePath
        ? [
            `当前 viewport 快照图片路径: ${imagePath}`,
            `快照更新时间: ${document.autosaveUpdatedAt?.toISOString?.() ?? ''}`,
            `请先调用 view_image，参数 path 为 "${imagePath}"，读取这张图片后再分析画布视觉内容。`
          ]
        : ['当前画布还没有可供 view_image 读取的 viewport 快照图片；如需视觉分析，请先在 Workbench 自动保存或保存画布。']),
      '',
      instruction,
      '',
      '如果需要精确修改 shape，请使用 Canvas middleware tools 读取 document/record 后再 patch。'
    ]

    return {
      commandKey: 'assistant.chat.send_message',
      payload: {
        text: lines.join('\n')
      },
      documentId: document.id,
      snapshotImagePath: imagePath ?? null,
      snapshotImageUpdatedAt: document.autosaveUpdatedAt ?? null
    }
  }

  /** Issue one short-lived browser session for the platform-owned Canvas Yjs document. */
  async openDocument(scope: CanvasScope, documentId: string) {
    const detail = await this.getDocument(scope, {
      documentId,
      includeSnapshot: true,
      includeLogs: true,
      versionLimit: 30,
      logLimit: 20
    })
    return { ...detail, collab: await this.createCollaborationSession(scope, documentId) }
  }

  async createCollaborationSession(scope: CanvasScope, documentId: string) {
    await this.requireDocument(scope, documentId)
    const document = await this.ensureCollaborationDocument(documentId)
    const session = await this.collaboration().createSession({ documentId: document.id, access: 'write' })
    return { ...session, canvasDocumentId: documentId }
  }

  /** Authorize the exact Canvas business resource within the Provider's platform scope. */
  async authorizeCollaborationDocument(context: CollaborationProviderContext) {
    if (!context.tenantId) return false
    const where = scopedWhere(collaborationScope(context), { id: context.resourceId }) as FindOptionsWhere<CanvasDocument>
    if (context.xpertId) where.assistantId = context.xpertId
    return Boolean(
      await this.documentRepository.findOne({
        where
      })
    )
  }

  /** Import the legacy materialized tldraw snapshot when the platform first sees this Canvas. */
  async initializeCollaborationDocument(context: CollaborationProviderContext) {
    const scope = collaborationScope(context)
    const document = await this.requireDocument(scope, context.resourceId)
    const current = await this.getCurrentCanvasState(scope, document)
    const ydoc = createCanvasYDoc(normalizeSnapshotInput(current.snapshot))
    return {
      stateBase64: encodeCanvasYDoc(ydoc).stateBase64,
      schemaVersion: CANVAS_COLLABORATION_SCHEMA_VERSION,
      initialSequence: currentWorkingCopyRevision(document)
    }
  }

  /** Idempotently project the authoritative record map into the CanvasDocument query model. */
  async materializeCollaborationDocument(event: CollaborationMaterializationEvent) {
    const scope = collaborationScope(event)
    const snapshot = normalizeSnapshotInput(materializeCanvasYDoc(decodeCanvasYDoc(event.stateBase64)))
    await this.documentRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(CanvasDocument)
      const document = await repository.findOne({
        where: scopedWhere(scope, { id: event.resourceId }),
        lock: { mode: 'pessimistic_write' }
      })
      if (!document) throw new NotFoundException('Canvas document was not found during collaboration materialization.')
      document.autosaveSnapshot = snapshot
      document.autosaveUpdatedAt = new Date()
      document.autosaveBaseVersionId = document.currentVersionId ?? null
      document.workingCopyRevision = event.sequenceNumber
      document.snapshotChecksum = checksumSnapshot(snapshot)
      if (event.updateBase64 && document.status !== 'archived') document.status = 'draft'
      document.lastEditedById = scope.userId ?? scope.assistantId ?? event.actor?.presenceId ?? null
      document.lastEditedAt = new Date()
      await repository.save(document)
    })
  }

  createAgentCollaborationActor(scope: CanvasScope, documentId: string) {
    const identity = [
      scope.tenantId,
      scope.organizationId ?? '-',
      scope.assistantId ?? 'agent',
      scope.conversationId ?? '-',
      documentId
    ].join(':')
    const digest = createHash('sha256').update(identity).digest()
    const digestBase64 = createHash('sha256').update(identity).digest('base64url')
    const hue = Math.round((digest[0] / 255) * 330)
    return {
      presenceId: `agent_${digestBase64.slice(0, 22)}`,
      displayName: (normalizeOptional(scope.assistantDisplayName) ?? 'Canvas Agent').slice(0, 64),
      color: hslToHex(hue, 76, 46),
      actorType: 'agent' as const,
      avatarUrl: null
    }
  }

  /** Publish semantic Agent activity without opening a browser socket. */
  async publishAgentAwareness(
    scope: CanvasScope,
    documentId: string,
    actor: ReturnType<CanvasService['createAgentCollaborationActor']>,
    awareness: CanvasAwarenessV1
  ) {
    const document = await this.ensureCollaborationDocument(documentId)
    return this.collaboration().upsertVirtualPresence({
      documentId: document.id,
      actor: {
        actorType: 'agent',
        actorKey: actor.presenceId,
        displayName: actor.displayName,
        avatarUrl: actor.avatarUrl
      },
      presence: canvasPresencePatch(awareness)
    })
  }

  async removeAgentAwareness(documentId: string, actorKey: string) {
    const document = await this.ensureCollaborationDocument(documentId)
    await this.collaboration().removeVirtualPresence({ documentId: document.id, actorKey })
  }

  /** Apply one record-level mutation to the authoritative Yjs document and repair the projection. */
  private async mutateCanvas(
    scope: CanvasScope,
    document: CanvasDocument,
    origin: string,
    mutation: Parameters<typeof patchCanvasYDoc>[1],
    expectedSequence?: number
  ) {
    const documentId = requireEntityId(document.id, 'Canvas document id is required for Yjs mutation.')
    const collaborationDocument = await this.ensureCollaborationDocument(documentId)
    const state = await this.collaboration().getDocumentState({ documentId: collaborationDocument.id })
    if (expectedSequence !== undefined && state.sequenceNumber !== expectedSequence) {
      throw new ConflictException(`Canvas collaboration revision conflict. Current revision is ${state.sequenceNumber}.`)
    }
    const ydoc = decodeCanvasYDoc(state.updateBase64)
    const update = patchCanvasYDoc(ydoc, mutation, origin)
    await this.collaboration().applyUpdate({
      documentId: collaborationDocument.id,
      updateBase64: Buffer.from(update).toString('base64'),
      origin,
      expectedSequence,
      actor: {
        actorType: origin.includes(':agent:') ? 'agent' : 'user',
        actorKey: scope.assistantId ?? scope.userId ?? null,
        displayName: scope.assistantDisplayName ?? null
      }
    })
    return this.requireCanonicalDocument(scope, documentId)
  }

  /** Replace all records through Yjs for destructive full-snapshot operations. */
  private async replaceCanvasSnapshot(scope: CanvasScope, document: CanvasDocument, snapshot: CanvasSnapshotData, origin: string) {
    const documentId = requireEntityId(document.id, 'Canvas document id is required for Yjs replacement.')
    const collaborationDocument = await this.ensureCollaborationDocument(documentId)
    const state = await this.collaboration().getDocumentState({ documentId: collaborationDocument.id })
    const ydoc = decodeCanvasYDoc(state.updateBase64)
    const before = Y.encodeStateVector(ydoc)
    writeCanvasSnapshotToYDoc(ydoc, snapshot, origin)
    const update = Y.encodeStateAsUpdate(ydoc, before)
    await this.collaboration().applyUpdate({
      documentId: collaborationDocument.id,
      updateBase64: Buffer.from(update).toString('base64'),
      origin,
      expectedSequence: state.sequenceNumber,
      actor: {
        actorType: origin.includes(':agent:') ? 'agent' : 'user',
        actorKey: scope.assistantId ?? scope.userId ?? null,
        displayName: scope.assistantDisplayName ?? null
      }
    })
    return this.requireCanonicalDocument(scope, documentId)
  }

  private ensureCollaborationDocument(documentId: string) {
    return this.collaboration().ensureDocument({
      providerKey: CANVAS_COLLABORATION_PROVIDER_KEY,
      resourceId: documentId,
      schemaVersion: CANVAS_COLLABORATION_SCHEMA_VERSION
    })
  }

  /** Repair a stale SQL projection before reads, versions, exports, or Agent mutations. */
  private async requireCanonicalDocument(scope: CanvasScope, documentId: string) {
    const current = await this.requireDocument(scope, documentId)
    const collaborationDocument = await this.ensureCollaborationDocument(documentId)
    const state = await this.collaboration().getDocumentState({ documentId: collaborationDocument.id })
    if (currentWorkingCopyRevision(current) !== state.sequenceNumber || !isCanvasSnapshot(current.autosaveSnapshot)) {
      await this.materializeCollaborationDocument({
        ...scope,
        providerKey: CANVAS_COLLABORATION_PROVIDER_KEY,
        resourceId: documentId,
        operation: 'materialize',
        documentId: collaborationDocument.id,
        stateBase64: state.updateBase64,
        stateVectorBase64: state.stateVectorBase64,
        sequenceNumber: state.sequenceNumber,
        origin: 'canvas:canonical-read'
      })
    }
    return this.requireDocument(scope, documentId)
  }

  /** Editing has one authority; missing platform Collaboration is a deployment error. */
  private collaboration() {
    const capability = this.runtimeCapabilities?.get(CollaborationRuntimeCapability)
    if (!capability) throw new Error('Platform collaboration capability is not available.')
    return capability
  }

  private async resolveInsertImageData(scope: CanvasScope, document: CanvasDocument, input: InsertCanvasImageInput) {
    const inline = normalizeInlineImageDataUrl(input)
    if (inline) {
      return inline
    }

    const filePath = normalizeOptional(input.workspaceFilePath)
    if (!filePath) {
      throw new BadRequestException('Canvas image insertion requires dataUrl, base64, or workspaceFilePath.')
    }
    const workspaceFiles = this.workspaceFiles()
    if (typeof workspaceFiles.readBuffer !== 'function') {
      throw new BadRequestException('Xpert workspace file runtime capability must provide readBuffer for Canvas workspace image insertion.')
    }
    const workspaceFile = await workspaceFiles.readBuffer({
      ...resolveInputWorkspaceScope(scope, document),
      filePath
    })
    if (!workspaceFile.buffer || workspaceFile.buffer.byteLength === 0) {
      throw new BadRequestException('Canvas workspace image file is empty.')
    }
    const detectedMimeType = detectImageMimeType(workspaceFile.buffer)
    if (!detectedMimeType || !SNAPSHOT_IMAGE_MIME_TYPES.has(detectedMimeType)) {
      throw new BadRequestException('Canvas workspace image files must be PNG, JPEG, or WebP.')
    }
    const declaredMimeType = normalizeOptional(input.mimeType) ?? normalizeOptional(workspaceFile.mimeType)
    if (declaredMimeType?.startsWith('image/') && normalizeMimeType(declaredMimeType) !== detectedMimeType) {
      throw new BadRequestException('Canvas workspace image file bytes do not match the declared MIME type.')
    }
    const base64 = workspaceFile.buffer.toString('base64')
    return {
      mimeType: detectedMimeType,
      base64,
      url: `data:${detectedMimeType};base64,${base64}`
    }
  }

  private workspaceFiles() {
    const files = this.runtimeCapabilities?.get<CanvasWorkspaceFilesApi>(CANVAS_WORKSPACE_FILES_RUNTIME_CAPABILITY)
    if (!files) {
      throw new BadRequestException('Xpert workspace file runtime capability is required for Canvas snapshot image storage.')
    }
    return files
  }

  private async uploadSnapshotImage(
    scope: CanvasScope,
    document: CanvasDocument,
    image: CanvasSnapshotImageInput | null | undefined,
    options: {
      mode: 'current' | 'version'
      sourceType: CanvasDocumentVersion['sourceType']
      versionNumber: number
    }
  ): Promise<SnapshotImageFileFields> {
    if (!image) {
      throw new BadRequestException('Canvas snapshot image is required.')
    }
    const normalized = normalizeSnapshotImageData(image)
    const checksumValue = checksum(normalized.buffer)
    const workspaceScope = resolveDocumentWorkspaceScope(scope, document)
    const documentId = requireEntityId(document.id, 'Canvas document id is required.')
    const folder =
      options.mode === 'current'
        ? buildCanvasSnapshotFolder(documentId)
        : `${buildCanvasSnapshotFolder(documentId)}/versions`
    const fileName = options.mode === 'current' ? 'current.png' : `v${options.versionNumber}-${checksumValue.slice(0, 8)}.png`
    const workspaceFile = await this.workspaceFiles().uploadBuffer({
      ...workspaceScope,
      buffer: normalized.buffer,
      originalName: normalizeOptional(image.fileName) ?? fileName,
      mimeType: normalized.mimeType,
      size: normalized.buffer.byteLength,
      folder,
      fileName,
      metadata: {
        documentType: 'canvas-snapshot-image',
        documentId,
        versionNumber: options.versionNumber,
        sourceType: options.sourceType,
        snapshotImageRole: options.mode,
        pageId: normalizeOptional(image.pageId),
        capturedAt: normalizeOptional(image.capturedAt),
        width: image.width,
        height: image.height,
        camera: image.camera
      }
    })

    return {
      snapshotImagePath: workspaceFile.filePath,
      snapshotImageUrl: normalizeOptional(workspaceFile.fileUrl) ?? normalizeOptional(workspaceFile.url),
      snapshotImageMimeType: normalized.mimeType,
      snapshotImageSize: normalized.buffer.byteLength,
      snapshotImageChecksum: checksumValue,
      workspaceCatalog: workspaceScope.catalog,
      workspaceScopeId: workspaceScope.scopeId
    }
  }

  private async getCurrentCanvasState(scope: CanvasScope, document: CanvasDocument) {
    const currentVersion = await this.getCurrentVersion(scope, document)
    if (isCanvasSnapshot(document.autosaveSnapshot)) {
      return {
        source: 'autosave' as const,
        version: currentVersion,
        snapshot: document.autosaveSnapshot,
        viewState: normalizeObject(document.autosaveViewState),
        selectionSummary: normalizeObject(document.autosaveSelectionSummary)
      }
    }
    return {
      source: 'version' as const,
      version: currentVersion,
      snapshot: currentVersion?.snapshot ?? createEmptyCanvasSnapshot(),
      viewState: normalizeObject(currentVersion?.viewState),
      selectionSummary: normalizeObject(currentVersion?.selectionSummary)
    }
  }

  private async saveWorkingCopy(
    scope: CanvasScope,
    document: CanvasDocument,
    input: {
      snapshot: CanvasSnapshotData
      viewState?: CanvasJsonObject | null
      selectionSummary?: CanvasJsonObject | null
      imageFields?: SnapshotImageFileFields | null
    }
  ) {
    const autosaveUpdatedAt = new Date()
    const workingCopyRevision = nextWorkingCopyRevision(document)
    const snapshotChecksum = checksumSnapshot(input.snapshot)
    return this.documentRepository.save({
      ...document,
      autosaveSnapshot: input.snapshot,
      autosaveViewState: input.viewState ?? null,
      autosaveSelectionSummary: input.selectionSummary ?? null,
      autosaveUpdatedAt,
      autosaveBaseVersionId: document.currentVersionId ?? null,
      workingCopyRevision,
      snapshotChecksum,
      ...(input.imageFields ?? {}),
      status: document.status === 'archived' ? document.status : 'draft',
      lastEditedById: scope.userId ?? scope.assistantId ?? null,
      lastEditedAt: autosaveUpdatedAt
    })
  }

  private async createVersion(
    scope: CanvasScope,
    document: CanvasDocument,
    input: {
      sourceType: CanvasDocumentVersion['sourceType']
      snapshot: CanvasSnapshotData
      viewState?: CanvasJsonObject | null
      selectionSummary?: CanvasJsonObject | null
      snapshotImage?: CanvasSnapshotImageInput | null
      changeSummary?: string
    }
  ) {
    const versionNumber = (document.currentVersionNumber ?? 0) + 1
    const [latestImageFields, versionImageFields] = input.snapshotImage
      ? await Promise.all([
          this.uploadSnapshotImage(scope, document, input.snapshotImage, {
            mode: 'current',
            sourceType: input.sourceType ?? 'workbench',
            versionNumber
          }),
          this.uploadSnapshotImage(scope, document, input.snapshotImage, {
            mode: 'version',
            sourceType: input.sourceType ?? 'workbench',
            versionNumber
          })
        ])
      : [null, null]
    const version = await this.versionRepository.save(
      this.versionRepository.create({
        ...scopedCreate(scope),
        documentId: document.id as string,
        versionNumber,
        sourceType: input.sourceType,
        snapshot: input.snapshot,
        viewState: input.viewState ?? null,
        selectionSummary: input.selectionSummary ?? null,
        ...(versionImageFields ?? {}),
        changeSummary: normalizeOptional(input.changeSummary),
        assistantId: scope.assistantId ?? null,
        conversationId: scope.conversationId ?? null
      })
    )

    document.currentVersionId = version.id
    document.currentVersionNumber = version.versionNumber
    document.autosaveSnapshot = input.snapshot
    document.autosaveViewState = input.viewState ?? null
    document.autosaveSelectionSummary = input.selectionSummary ?? null
    document.autosaveUpdatedAt = new Date()
    document.autosaveBaseVersionId = version.id
    document.workingCopyRevision = currentWorkingCopyRevision(document)
    document.snapshotChecksum = checksumSnapshot(input.snapshot)
    if (latestImageFields) {
      document.snapshotImagePath = latestImageFields.snapshotImagePath
      document.snapshotImageUrl = latestImageFields.snapshotImageUrl
      document.snapshotImageMimeType = latestImageFields.snapshotImageMimeType
      document.snapshotImageSize = latestImageFields.snapshotImageSize
      document.snapshotImageChecksum = latestImageFields.snapshotImageChecksum
      document.workspaceCatalog = latestImageFields.workspaceCatalog
      document.workspaceScopeId = latestImageFields.workspaceScopeId
    }
    document.lastEditedById = scope.userId ?? scope.assistantId ?? null
    document.lastEditedAt = new Date()
    await this.documentRepository.save(document)

    return version
  }

  private async getCurrentVersion(scope: CanvasScope, document: CanvasDocument) {
    if (!document.currentVersionId) {
      return null
    }
    return this.versionRepository.findOne({
      where: scopedWhere(scope, { id: document.currentVersionId, documentId: document.id as string })
    })
  }

  private async requireDocument(scope: CanvasScope, documentId: string) {
    const document = await this.documentRepository.findOne({
      where: scopedWhere(scope, { id: normalizeRequired(documentId, 'Canvas document id is required.') })
    })
    if (!document) {
      throw new NotFoundException('Canvas document was not found.')
    }
    return document
  }

  private async writeLog(
    scope: CanvasScope,
    input: {
      documentId?: string
      versionId?: string
      action: CanvasActionType
      actorType?: CanvasActorType
      message?: string
      errorMessage?: string
      snapshot?: CanvasJsonValue
    }
  ) {
    return this.logRepository.save(
      this.logRepository.create({
        ...scopedCreate(scope),
        documentId: input.documentId ?? null,
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

function normalizeSnapshotInput(snapshot: CanvasSnapshotData | CanvasJsonObject | null | undefined): CanvasSnapshotData {
  try {
    return normalizeCanvasSnapshot(snapshot ?? createEmptyCanvasSnapshot())
  } catch (error) {
    if (error instanceof CanvasSnapshotValidationError) {
      throw new BadRequestException(error.message)
    }
    throw error
  }
}

function normalizeSnapshotImageData(input: CanvasSnapshotImageInput) {
  const dataUrl = normalizeOptional(input.dataUrl)
  let mimeType: string
  let base64: string
  if (dataUrl) {
    const parsed = parseDataUrl(dataUrl)
    if (!parsed) {
      throw new BadRequestException('snapshotImage.dataUrl must be a valid image data URL.')
    }
    mimeType = parsed.mimeType
    base64 = parsed.base64
  } else {
    base64 = normalizeRequired(input.base64, 'snapshotImage base64 or dataUrl is required.')
    mimeType = normalizeMimeType(input.mimeType)
  }
  if (!SNAPSHOT_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new BadRequestException('Canvas snapshot images must be PNG, JPEG, or WebP.')
  }
  const buffer = Buffer.from(base64, 'base64')
  if (buffer.byteLength === 0) {
    throw new BadRequestException('Canvas snapshot image is empty.')
  }
  if (detectImageMimeType(buffer) !== mimeType) {
    throw new BadRequestException('Canvas snapshot image bytes do not match the declared MIME type.')
  }
  return {
    mimeType,
    buffer
  }
}

function requireInsertImageSource(input: InsertCanvasImageInput) {
  if (
    normalizeOptional(input.dataUrl) ||
    normalizeOptional(input.base64) ||
    normalizeOptional(input.workspaceFilePath)
  ) {
    return
  }
  throw new BadRequestException('Canvas image insertion requires dataUrl, base64, or workspaceFilePath.')
}

function normalizeInlineImageDataUrl(input: InsertCanvasImageInput) {
  const explicit = normalizeOptional(input.dataUrl)
  if (explicit) {
    const parsed = parseDataUrl(explicit)
    if (!parsed) {
      throw new BadRequestException('dataUrl must be a valid image data URL.')
    }
    return parsed
  }
  const base64 = normalizeOptional(input.base64)
  if (!base64) {
    return null
  }
  const mimeType = normalizeMimeType(input.mimeType)
  return {
    mimeType,
    base64,
    url: `data:${mimeType};base64,${base64}`
  }
}

function detectImageMimeType(buffer: Buffer) {
  if (buffer.length >= 24 && buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return 'image/png'
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  if (buffer.length >= 16 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  return null
}

function parseDataUrl(value: string) {
  const match = /^data:([^;,]+)?(?:;[^,]*)?,(.*)$/s.exec(value)
  if (!match) {
    return null
  }
  const mimeType = normalizeMimeType(match[1])
  const encoded = match[2]
  const isBase64 = /^data:[^,]*;base64,/i.test(value)
  const base64 = isBase64 ? encoded : Buffer.from(decodeURIComponent(encoded)).toString('base64')
  return {
    mimeType,
    base64,
    url: `data:${mimeType};base64,${base64}`
  }
}

function readImageSizeFromDataUrl(dataUrl: { base64: string; mimeType: string }, input: InsertCanvasImageInput) {
  const explicitWidth = positiveNumber(input.target?.width)
  const explicitHeight = positiveNumber(input.target?.height)
  if (explicitWidth && explicitHeight) {
    return { width: explicitWidth, height: explicitHeight }
  }
  const buffer = Buffer.from(dataUrl.base64, 'base64')
  const detected = detectImageSize(buffer)
  return {
    width: explicitWidth ?? detected?.width ?? 512,
    height: explicitHeight ?? detected?.height ?? 512
  }
}

function detectImageSize(buffer: Buffer) {
  if (buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }
  if (buffer.length >= 10 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2
    while (offset < buffer.length - 9) {
      if (buffer[offset] !== 0xff) {
        break
      }
      const marker = buffer[offset + 1]
      const size = buffer.readUInt16BE(offset + 2)
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) }
      }
      offset += 2 + size
    }
  }
  if (buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buffer.toString('ascii', 12, 16)
    if (chunk === 'VP8X') {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3)
      }
    }
  }
  return null
}

function selectRequestedVersion(
  payload: { currentVersion?: CanvasDocumentVersion | null; versions?: CanvasDocumentVersion[] },
  input: { versionId?: string; versionNumber?: number }
) {
  const versions = Array.isArray(payload.versions) ? payload.versions : []
  if (input.versionId) {
    const version = versions.find((candidate) => candidate.id === input.versionId)
    if (!version) {
      throw new NotFoundException('Requested Canvas version was not found.')
    }
    return version
  }
  if (input.versionNumber !== undefined) {
    const version = versions.find((candidate) => candidate.versionNumber === input.versionNumber)
    if (!version) {
      throw new NotFoundException('Requested Canvas version was not found.')
    }
    return version
  }
  return payload.currentVersion ?? versions[0] ?? null
}

function hasExplicitVersionRequest(input: { versionId?: string; versionNumber?: number }) {
  return Boolean(input.versionId || input.versionNumber !== undefined)
}

function formatWorkingCopy(document: CanvasDocument, includeSnapshot: boolean) {
  if (!isCanvasSnapshot(document.autosaveSnapshot)) {
    return null
  }
  return {
    snapshot: includeSnapshot ? document.autosaveSnapshot : undefined,
    scene: includeSnapshot ? undefined : compactSnapshotForAgent(document.autosaveSnapshot),
    viewState: document.autosaveViewState,
    selectionSummary: document.autosaveSelectionSummary,
    autosaveUpdatedAt: document.autosaveUpdatedAt,
    autosaveBaseVersionId: document.autosaveBaseVersionId,
    snapshotImagePath: document.snapshotImagePath,
    snapshotImageUrl: document.snapshotImageUrl,
    snapshotImageMimeType: document.snapshotImageMimeType,
    snapshotImageSize: document.snapshotImageSize,
    snapshotImageChecksum: document.snapshotImageChecksum,
    workingCopyRevision: currentWorkingCopyRevision(document),
    snapshotChecksum: document.snapshotChecksum ?? checksumSnapshot(document.autosaveSnapshot),
    snapshotSummary: summarizeSnapshot(document.autosaveSnapshot)
  }
}

function scopedCreate(scope: CanvasScope): ScopedEntity & { createdById?: string | null } {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null,
    projectId: scope.projectId ?? null,
    createdById: scope.userId ?? null
  }
}

function scopedWhere<T extends object>(scope: CanvasScope, extra?: T): T & Partial<ScopedEntity> {
  const where = {
    tenantId: scope.tenantId
  } as Partial<ScopedEntity>
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
  } as T & Partial<ScopedEntity>
}

function formatVersionForResponse(version: CanvasDocumentVersion | null, includeSnapshot: boolean) {
  if (!version) {
    return null
  }
  return includeSnapshot
    ? version
    : {
        ...compactVersion(version),
        scene: compactSnapshotForAgent(version.snapshot)
    }
}

function compactDocument(document: CanvasDocument | null | undefined) {
  if (!document) {
    return null
  }
  return {
    id: document.id,
    title: document.title,
    kind: document.kind,
    status: document.status,
    currentVersionId: document.currentVersionId,
    currentVersionNumber: document.currentVersionNumber,
    autosaveUpdatedAt: document.autosaveUpdatedAt,
    workingCopyRevision: currentWorkingCopyRevision(document),
    snapshotChecksum: document.snapshotChecksum ?? checksumSnapshot(document.autosaveSnapshot),
    snapshotImagePath: document.snapshotImagePath,
    snapshotImageUrl: document.snapshotImageUrl,
    snapshotImageMimeType: document.snapshotImageMimeType,
    snapshotImageSize: document.snapshotImageSize,
    snapshotImageChecksum: document.snapshotImageChecksum,
    updatedAt: document.updatedAt
  }
}

function compactAutosave(document: CanvasDocument, snapshot?: CanvasSnapshotData) {
  return {
    documentId: document.id,
    autosaveUpdatedAt: document.autosaveUpdatedAt,
    autosaveBaseVersionId: document.autosaveBaseVersionId,
    workingCopyRevision: currentWorkingCopyRevision(document),
    snapshotChecksum: document.snapshotChecksum ?? (snapshot ? checksumSnapshot(snapshot) : checksumSnapshot(document.autosaveSnapshot)),
    snapshotImagePath: document.snapshotImagePath,
    snapshotImageUrl: document.snapshotImageUrl,
    snapshotImageChecksum: document.snapshotImageChecksum,
    snapshotSummary: snapshot ? summarizeSnapshot(snapshot) : undefined
  }
}

function recordBatchReceipt(input: {
  input: ApplyCanvasRecordBatchInput
  marker: ReturnType<typeof createCanvasAgentOperationMarker>
  duplicate: boolean
  revisionBefore: number
  workingCopyRevision: number
  cascadedRecordIds?: string[]
}) {
  const marker = input.marker
  const changedRecordIds = [...marker.createdRecordIds, ...marker.updatedRecordIds]
  return {
    success: true,
    duplicate: input.duplicate,
    documentId: input.input.documentId,
    operationId: marker.operationId,
    batchId: marker.batchId,
    stageIndex: marker.stageIndex,
    stageLabel: marker.stageLabel,
    isFinalStage: marker.isFinalStage,
    baseRevision: marker.baseRevision,
    revisionBefore: input.revisionBefore,
    workingCopyRevision: input.workingCopyRevision,
    createdRecordIds: marker.createdRecordIds,
    updatedRecordIds: marker.updatedRecordIds,
    changedRecordIds,
    removedRecordIds: marker.removedRecordIds,
    cascadedRecordIds: input.cascadedRecordIds ?? [],
    counts: {
      created: marker.createdRecordIds.length,
      updated: marker.updatedRecordIds.length,
      removed: marker.removedRecordIds.length,
      cascaded: input.cascadedRecordIds?.length ?? 0
    },
    nextAction: marker.isFinalStage
      ? 'The requested staged edit is complete. Read the summary only if verification is needed.'
      : 'Submit the next bounded stage with the returned workingCopyRevision as baseRevision and a new operationId.'
  }
}

function compactVersion(version: CanvasDocumentVersion | null) {
  if (!version) {
    return null
  }
  return {
    id: version.id,
    documentId: version.documentId,
    versionNumber: version.versionNumber,
    sourceType: version.sourceType,
    viewState: version.viewState,
    selectionSummary: version.selectionSummary,
    snapshotImagePath: version.snapshotImagePath,
    snapshotImageUrl: version.snapshotImageUrl,
    snapshotImageMimeType: version.snapshotImageMimeType,
    snapshotImageSize: version.snapshotImageSize,
    snapshotImageChecksum: version.snapshotImageChecksum,
    changeSummary: version.changeSummary,
    createdAt: version.createdAt,
    snapshotSummary: summarizeSnapshot(version.snapshot)
  }
}

function isVersionWithSnapshot(value: object | null | undefined): value is CanvasDocumentVersion {
  return Boolean(value && 'snapshot' in value)
}

function normalizeRequiredSnapshotInput(snapshot: CanvasSnapshotData | null | undefined) {
  if (!snapshot || !isCanvasSnapshot(snapshot)) {
    throw new BadRequestException(SAVE_SNAPSHOT_REQUIRED_MESSAGE)
  }
  return normalizeSnapshotInput(snapshot)
}

function assertCanvasRevision(expectedRevision: number | undefined, currentRevision: number) {
  if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
    throw new ConflictException(
      `[CANVAS_REVISION_CONFLICT] Expected revision ${expectedRevision}, but current revision is ${currentRevision}. Read the Canvas summary again.`
    )
  }
}

function hasSnapshotContent(input: { snapshot?: CanvasSnapshotData | null; viewState?: CanvasJsonObject | null; selectionSummary?: CanvasJsonObject | null }) {
  return Boolean(input.snapshot || input.viewState || input.selectionSummary)
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

function normalizeStringArray(values: string[] | undefined | null) {
  const normalized = (values ?? []).map((value) => normalizeOptional(value)).filter(isString)
  return normalized.length ? Array.from(new Set(normalized)) : undefined
}

function normalizeObject(value: CanvasJsonValue | object | null | undefined): CanvasJsonObject {
  return isPlainObject(value) ? value : {}
}

function normalizeMimeType(value: string | null | undefined) {
  const normalized = typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : 'image/png'
  return normalized.startsWith('image/') ? normalized : 'image/png'
}

function collectUniqueStrings(values: string[], label: string) {
  const seen = new Set<string>()
  for (const value of values) {
    const normalized = normalizeRequired(value, `${label} must contain non-empty strings.`)
    if (seen.has(normalized)) {
      throw new BadRequestException(`${label} contains duplicate id "${normalized}".`)
    }
    seen.add(normalized)
  }
  return Array.from(seen)
}

function isString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPlainObject(value: CanvasJsonValue | object | null | undefined): value is CanvasJsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function positiveNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null
}

function normalizeInsertionTargetInput(input: InsertCanvasImageInput) {
  const target = input.target ?? {}
  return {
    documentId: normalizeOptional(target.documentId),
    pageId: normalizeOptional(target.pageId),
    anchorShapeId: normalizeOptional(target.shapeId),
    displayWidth: positiveNumber(target.width),
    displayHeight: positiveNumber(target.height),
    placement: 'right' as CanvasPlacement,
    margin: 40,
    matchAnchor: true,
    replaceExistingForAnchor: true
  }
}

function sanitizeFileName(name: string, mimeType: string) {
  const extension = extname(name) || extensionFromMimeType(mimeType)
  const rawBase = name.slice(0, name.length - extname(name).length)
  const baseName = rawBase.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return `${baseName || 'image'}${extension}`
}

function fileNameFromPath(path: string | null | undefined) {
  const normalized = normalizeOptional(path)
  if (!normalized) {
    return undefined
  }
  return normalized.split('/').filter(Boolean).at(-1)
}

function extensionFromMimeType(mimeType: string) {
  switch (mimeType) {
    case 'image/apng':
      return '.apng'
    case 'image/avif':
      return '.avif'
    case 'image/gif':
      return '.gif'
    case 'image/jpeg':
      return '.jpg'
    case 'image/svg+xml':
      return '.svg'
    case 'image/webp':
      return '.webp'
    default:
      return '.png'
  }
}

function sanitizeIdPart(value: string) {
  return (
    value
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || randomUUID()
  )
}

function resolveDocumentWorkspaceScope(scope: CanvasScope, document: CanvasDocument): CanvasWorkspaceFileScope {
  if (document.workspaceCatalog === 'projects' && document.workspaceScopeId) {
    return {
      tenantId: scope.tenantId,
      userId: scope.userId,
      catalog: 'projects',
      scopeId: document.workspaceScopeId,
      projectId: document.workspaceScopeId
    }
  }
  if (document.workspaceCatalog === 'xperts' && document.workspaceScopeId) {
    return {
      tenantId: scope.tenantId,
      userId: scope.userId,
      catalog: 'xperts',
      scopeId: document.workspaceScopeId,
      xpertId: document.workspaceScopeId,
      isolateByUser: false
    }
  }
  const projectId = normalizeOptional(scope.projectId) ?? normalizeOptional(document.projectId)
  if (projectId) {
    return {
      tenantId: scope.tenantId,
      userId: scope.userId,
      catalog: 'projects',
      scopeId: projectId,
      projectId
    }
  }
  const xpertId = normalizeOptional(scope.assistantId) ?? normalizeOptional(document.assistantId)
  if (!xpertId) {
    throw new BadRequestException('Canvas workspace storage requires an assistant or project scope.')
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

function resolveInputWorkspaceScope(scope: CanvasScope, document: CanvasDocument): CanvasWorkspaceFileScope {
  return resolveDocumentWorkspaceScope(scope, document)
}

function resolveVersionWorkspaceScope(scope: CanvasScope, version: CanvasDocumentVersion): CanvasWorkspaceFileScope {
  if (version.workspaceCatalog === 'projects' && version.workspaceScopeId) {
    return {
      tenantId: scope.tenantId,
      userId: scope.userId,
      catalog: 'projects',
      scopeId: version.workspaceScopeId,
      projectId: version.workspaceScopeId
    }
  }
  if (version.workspaceCatalog === 'xperts' && version.workspaceScopeId) {
    return {
      tenantId: scope.tenantId,
      userId: scope.userId,
      catalog: 'xperts',
      scopeId: version.workspaceScopeId,
      xpertId: version.workspaceScopeId,
      isolateByUser: false
    }
  }
  const projectId = normalizeOptional(scope.projectId)
  if (projectId) {
    return {
      tenantId: scope.tenantId,
      userId: scope.userId,
      catalog: 'projects',
      scopeId: projectId,
      projectId
    }
  }
  const xpertId = normalizeOptional(scope.assistantId)
  if (!xpertId) {
    throw new BadRequestException('Canvas version workspace scope is missing.')
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

function normalizeWorkspaceCatalog(value: string | null | undefined): CanvasWorkspaceFileScope['catalog'] | undefined {
  const normalized = normalizeOptional(value)
  return normalized === 'projects' || normalized === 'xperts' ? normalized : undefined
}

function buildCanvasSnapshotFolder(documentId: string) {
  return `files/canvas/documents/${normalizePathSegment(documentId, 'Canvas document id is required.')}/snapshots`
}

function normalizePathSegment(value: string, message: string) {
  const normalized = normalizeRequired(value, message)
  const segment = normalized.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!segment || segment === '.' || segment === '..') {
    throw new BadRequestException('Invalid workspace path segment.')
  }
  return segment
}

function requireEntityId(value: string | undefined, message: string) {
  return normalizeRequired(value, message)
}

function checksum(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function checksumSnapshot(snapshot: CanvasSnapshotData | null | undefined) {
  if (!isCanvasSnapshot(snapshot)) {
    return null
  }
  return createHash('sha256').update(stableStringifyCanvasJson(snapshot)).digest('hex')
}

function stableStringifyCanvasJson(value: CanvasJsonValue | undefined): string {
  if (value === undefined || value === null || typeof value !== 'object') {
    return JSON.stringify(value ?? null)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringifyCanvasJson(item)).join(',')}]`
  }
  const entries = Object.keys(value)
    .sort()
    .filter((key) => value[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringifyCanvasJson(value[key])}`)
  return `{${entries.join(',')}}`
}

function currentWorkingCopyRevision(document: CanvasDocument) {
  return document.workingCopyRevision ?? 0
}

function nextWorkingCopyRevision(document: CanvasDocument) {
  return currentWorkingCopyRevision(document) + 1
}

type ShapeBounds = { x: number; y: number; w: number; h: number }
type CanvasPlacement = 'right' | 'left' | 'below' | 'center'

function uniqueRecordId(store: Record<string, CanvasRecord>, prefix: string, seed: string) {
  const cleanSeed = sanitizeIdPart(seed)
  let candidate = `${prefix}:${cleanSeed}`
  let counter = 2
  while (store[candidate]) {
    candidate = `${prefix}:${cleanSeed}-${counter}`
    counter += 1
  }
  return candidate
}

function chooseIndex(store: Record<string, CanvasRecord>, parentId: string) {
  const siblingIndexes = Object.values(store)
    .filter((record) => record.typeName === 'shape' && record.parentId === parentId && typeof record.index === 'string')
    .map((record) => record.index)
    .sort()
  return generateKeyBetween(siblingIndexes.at(-1) ?? null, null)
}

function findFirstPageId(store: Record<string, CanvasRecord>) {
  return Object.values(store).find(isPageRecord)?.id
}

function isPageRecord(record: CanvasRecord | null | undefined) {
  return Boolean(record?.typeName === 'page')
}

function ensureDefaultCanvasPage(store: Record<string, CanvasRecord>) {
  const existingPageId = findFirstPageId(store)
  if (existingPageId) {
    return existingPageId
  }
  const emptySnapshot = createEmptyCanvasSnapshot()
  for (const [id, record] of Object.entries(emptySnapshot.store)) {
    store[id] = store[id] ?? record
  }
  return findFirstPageId(store)
}

function findPageIdForShape(store: Record<string, CanvasRecord>, shapeId: string | undefined) {
  if (!shapeId) {
    return null
  }
  let record = store[shapeId]
  const visited = new Set<string>()
  while (record && !visited.has(record.id)) {
    visited.add(record.id)
    if (record.typeName === 'page') {
      return record.id
    }
    const parentId = record.parentId
    if (!parentId) {
      break
    }
    const parent = store[parentId]
    if (parent?.typeName === 'page') {
      return parent.id
    }
    record = parent
  }
  return null
}

function isAiImageHolder(shape: CanvasRecord | null | undefined) {
  return Boolean(shape?.typeName === 'shape' && shape.type === 'frame' && (shape.meta?.canvasAiImageHolder === true || shape.meta?.cowartAiImageHolder === true))
}

function isImageShape(shape: CanvasRecord | null | undefined): shape is CanvasRecord {
  return Boolean(shape?.typeName === 'shape' && shape.type === 'image')
}

function removeGeneratedImagesForAnchor(store: Record<string, CanvasRecord>, anchorShapeId: string) {
  const shapeIds: string[] = []
  const candidateAssetIds: string[] = []
  for (const record of Object.values(store)) {
    if (!isGeneratedImageForAnchor(record, anchorShapeId)) {
      continue
    }
    shapeIds.push(record.id)
    const assetId = record.props?.assetId
    if (typeof assetId === 'string' && assetId.trim()) {
      candidateAssetIds.push(assetId)
    }
  }
  for (const shapeId of shapeIds) {
    delete store[shapeId]
  }

  const assetIds: string[] = []
  for (const assetId of candidateAssetIds) {
    const stillUsed = Object.values(store).some((record) => record.typeName === 'shape' && record.props?.assetId === assetId)
    if (!stillUsed) {
      delete store[assetId]
      assetIds.push(assetId)
    }
  }
  return { shapeIds, assetIds }
}

function removeUnusedAssets(store: Record<string, CanvasRecord>, candidateAssetIds: string[]) {
  const assetIds: string[] = []
  for (const assetId of candidateAssetIds) {
    const stillUsed = Object.values(store).some((record) => record.typeName === 'shape' && record.props?.assetId === assetId)
    if (!stillUsed) {
      delete store[assetId]
      assetIds.push(assetId)
    }
  }
  return { shapeIds: [], assetIds }
}

function isGeneratedImageForAnchor(record: CanvasRecord, anchorShapeId: string) {
  return (
    record.typeName === 'shape' &&
    record.type === 'image' &&
    record.parentId === anchorShapeId &&
    (record.meta?.canvasGeneratedForAiImageHolder === anchorShapeId || record.meta?.cowartGeneratedForAiImageHolder === anchorShapeId)
  )
}

function diffCanvasRecords(previous: Record<string, CanvasRecord>, next: Record<string, CanvasRecord>) {
  const removeRecordIds = Object.keys(previous).filter((recordId) => !(recordId in next))
  const putRecords = Object.entries(next)
    .filter(([recordId, record]) => !(recordId in previous) || JSON.stringify(previous[recordId]) !== JSON.stringify(record))
    .map(([, record]) => record)
  return { putRecords, removeRecordIds }
}

function collaborationScope(value: CollaborationProviderContext): CanvasScope {
  return {
    tenantId: value.tenantId ?? '',
    organizationId: value.organizationId ?? null,
    workspaceId: value.workspaceId ?? null,
    projectId: value.projectId ?? null,
    userId: value.userId ?? null,
    assistantId: value.xpertId ?? null
  }
}

function canvasPresencePatch(awareness: CanvasAwarenessV1): CollaborationPresencePatch {
  const selectedRecordIds = (awareness.selectedRecordIds ?? []).filter((recordId) => Boolean(recordId))
  return {
    pageId: awareness.pageId ?? null,
    pointer: awareness.pointer
      ? { ...awareness.pointer, pageId: awareness.pageId ?? null }
      : null,
    focus: awareness.focusedRecordId
      ? {
          kind: 'element',
          key: awareness.focusedRecordId,
          elementId: awareness.focusedRecordId,
          pageId: awareness.pageId ?? null
        }
      : null,
    selection: selectedRecordIds.length
      ? { kind: 'elements', elementIds: selectedRecordIds }
      : null,
    viewport: awareness.viewport ?? null,
    mode: awareness.mode ?? 'edit',
    status: awareness.status ?? null,
    toolName: awareness.toolName ?? null,
    operationLabel: awareness.operationLabel ?? null
  }
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const s = saturation / 100
  const l = lightness / 100
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const segment = hue / 60
  const intermediate = chroma * (1 - Math.abs((segment % 2) - 1))
  const [red, green, blue] = segment < 1 ? [chroma, intermediate, 0]
    : segment < 2 ? [intermediate, chroma, 0]
      : segment < 3 ? [0, chroma, intermediate]
        : segment < 4 ? [0, intermediate, chroma]
          : segment < 5 ? [intermediate, 0, chroma]
            : [chroma, 0, intermediate]
  const offset = l - chroma / 2
  return `#${[red, green, blue].map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, '0')).join('')}`
}

function localBoundsForShape(shape: CanvasRecord | null | undefined): ShapeBounds | null {
  if (!shape || shape.typeName !== 'shape') {
    return null
  }
  if (shape.type === 'arrow') {
    const start = normalizePoint(shape.props?.start)
    const end = normalizePoint(shape.props?.end)
    const minX = Math.min(start.x, end.x)
    const minY = Math.min(start.y, end.y)
    const maxX = Math.max(start.x, end.x)
    const maxY = Math.max(start.y, end.y)
    return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) }
  }
  const w = typeof shape.props?.w === 'number' ? shape.props.w : shape.type === 'text' ? 160 : 1
  const h = typeof shape.props?.h === 'number' ? shape.props.h : shape.type === 'text' ? 40 : 1
  return { x: 0, y: 0, w, h }
}

function pageBoundsForShape(store: Record<string, CanvasRecord>, shape: CanvasRecord | null | undefined): ShapeBounds | null {
  const local = localBoundsForShape(shape)
  if (!shape || !local) {
    return null
  }
  let x = finiteNumber(shape.x, 0) + local.x
  let y = finiteNumber(shape.y, 0) + local.y
  let parent = store[shape.parentId]
  const visited = new Set([shape.id])
  while (parent?.typeName === 'shape' && !visited.has(parent.id)) {
    visited.add(parent.id)
    x += finiteNumber(parent.x, 0)
    y += finiteNumber(parent.y, 0)
    parent = store[parent.parentId]
  }
  return { x, y, w: local.w, h: local.h }
}

function choosePlacement(input: {
  store: Record<string, CanvasRecord>
  pageId: string
  parentId: string
  anchorShape: CanvasRecord | null | undefined
  width: number
  height: number
  margin: number
  placement: CanvasPlacement
}): ShapeBounds {
  if (input.placement === 'center' || !input.anchorShape) {
    return { x: 0, y: 0, w: input.width, h: input.height }
  }
  const anchorBounds = pageBoundsForShape(input.store, input.anchorShape)
  let x = anchorBounds ? anchorBounds.x + anchorBounds.w + input.margin : 0
  let y = anchorBounds ? anchorBounds.y : 0

  if (input.placement === 'left' && anchorBounds) {
    x = anchorBounds.x - input.width - input.margin
  }
  if (input.placement === 'below' && anchorBounds) {
    x = anchorBounds.x
    y = anchorBounds.y + anchorBounds.h + input.margin
  }

  const pageShapes = getPageShapes(input.store, input.pageId)
  const obstacles = pageShapes
    .filter((shape) => shape.parentId === input.parentId && shape.id !== input.anchorShape?.id)
    .map((shape) => pageBoundsForShape(input.store, shape))
    .filter(Boolean)
  const stepX = Math.max(input.width + input.margin, 1)
  const stepY = Math.max(input.height + input.margin, 1)
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const candidate = { x, y, w: input.width, h: input.height }
    if (!obstacles.some((bounds) => rectsOverlap(candidate, bounds, input.margin / 2))) {
      return candidate
    }
    if (input.placement === 'below') {
      y += stepY
    } else if (input.placement === 'left') {
      x -= stepX
    } else {
      x += stepX
    }
  }
  return { x, y, w: input.width, h: input.height }
}

function getPageShapes(store: Record<string, CanvasRecord>, pageId: string) {
  const shapes: CanvasRecord[] = []
  const byParent = new Map<string, CanvasRecord[]>()
  for (const record of Object.values(store)) {
    if (record.typeName !== 'shape') {
      continue
    }
    const siblings = byParent.get(record.parentId) ?? []
    siblings.push(record)
    byParent.set(record.parentId, siblings)
  }
  const queue = [...(byParent.get(pageId) ?? [])]
  while (queue.length > 0) {
    const shape = queue.shift()
    shapes.push(shape)
    queue.push(...(byParent.get(shape.id) ?? []))
  }
  return shapes
}

function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, padding = 0) {
  return !(a.x + a.w + padding <= b.x || b.x + b.w + padding <= a.x || a.y + a.h + padding <= b.y || b.y + b.h + padding <= a.y)
}

function normalizePoint(value: CanvasJsonValue | undefined) {
  const object = isPlainObject(value) ? value : {}
  return {
    x: finiteNumber(object.x, 0),
    y: finiteNumber(object.y, 0)
  }
}

function finiteNumber(value: CanvasJsonValue | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
