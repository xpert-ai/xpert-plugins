import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import {
  ArtifactsRuntimeCapability,
  CollaborationRuntimeCapability,
  isSandboxJobRuntimeError,
  MANAGED_QUEUE_SERVICE_TOKEN,
  SandboxJobsRuntimeCapability,
  SYSTEM_GLOBAL_SCOPE,
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type AgentMiddlewareRuntimeCapabilityRegistry,
  type ArtifactAccessMode,
  type ArtifactLinkVersionMode,
  type ArtifactsApi,
  type CollaborationMaterializationEvent,
  type CollaborationPresencePatch,
  type CollaborationProviderContext,
  type ManagedQueueService,
  type SandboxJobErrorCode,
  type SandboxJobsApi,
  type WorkspaceFile,
  type WorkspaceFilesApi,
  type WorkspacePortableFileReference,
  WORKSPACE_FILES_SOURCE
} from '@xpert-ai/plugin-sdk'
import { Repository, type FindOptionsWhere } from 'typeorm'
import * as Y from 'yjs'
import {
  DASHIAI_UPSTREAM_COMMIT,
  PRESENTATION_COLLABORATION_PROVIDER_KEY,
  PRESENTATION_EXPORT_JOB,
  PRESENTATION_EXPORT_KINDS,
  PRESENTATION_EXPORT_QUEUE,
  PRESENTATION_STATUSES,
  PRESENTATION_STUDIO_PLUGIN_NAME,
  PRESENTATION_THEME_PACKS
} from './constants.js'
import {
  PresentationActionLog,
  PresentationAsset,
  PresentationDeck,
  PresentationDeckVersion,
  PresentationExport
} from './entities/index.js'
import { PresentationCatalogService } from './presentation-catalog.service.js'
import { PresentationConfigService } from './presentation-config.service.js'
import { PresentationRendererService } from './presentation-renderer.service.js'
import {
  createPresentationYDoc,
  decodeYDoc,
  encodeYDoc,
  ensurePresentationYDocSchemaV2,
  materializePresentationYDoc,
  patchPresentationYDoc,
  patchSlideYMap,
  setPresentationYText,
  slideToYMap,
  writeDeckToYDoc
} from './presentation-yjs.js'
import type {
  PresentationAssetReference,
  PresentationAwarenessV2,
  PresentationDeckSpec,
  PresentationEditorState,
  PresentationExportJobData,
  PresentationExportKind,
  PresentationJsonObject,
  PresentationJsonValue,
  PresentationScope,
  PresentationSlideSpec,
  PresentationSlideStatus,
  PresentationStatus,
  PresentationThemePack,
  PresentationVersionSource,
  PresentationWorkbenchAgentContext,
  PresentationWorkbenchQuery
} from './types.js'

interface CreateDeckInput {
  title: string
  goal: string
  audience?: string
  owner?: string
  themePack: PresentationThemePack
  pageCount: number
}

interface AddSlideInput {
  deckId: string
  position?: number
  layout: string
  props: PresentationJsonObject
  changeSummary?: string
}

interface PatchSlideInput {
  deckId: string
  slideId: string
  layout?: string
  status?: PresentationSlideStatus
  propsPatch?: PresentationJsonObject
  textPatch?: Record<string, string>
  expectedRevision?: number
  changeSummary?: string
}

const WORKING_EXPORT_SNAPSHOT_KEY = '__presentationWorkingSnapshot'
const WORKBENCH_AGENT_CONTEXT_TTL_SECONDS = 30 * 60
/** Business façade for deck state, collaboration, versioning, exports, and sharing. */
@Injectable()
export class PresentationStudioService {
  private readonly workbenchAgentContexts = new Map<string, { value: PresentationWorkbenchAgentContext; expiresAt: number }>()

  constructor(
    @InjectRepository(PresentationDeck) private readonly deckRepository: Repository<PresentationDeck>,
    @InjectRepository(PresentationDeckVersion) private readonly versionRepository: Repository<PresentationDeckVersion>,
    @Optional() @Inject('PRESENTATION_STUDIO_LEGACY_UPDATE_REPOSITORY') private readonly legacyUpdateRepository: unknown,
    @InjectRepository(PresentationAsset) private readonly assetRepository: Repository<PresentationAsset>,
    @InjectRepository(PresentationExport) private readonly exportRepository: Repository<PresentationExport>,
    @InjectRepository(PresentationActionLog) private readonly logRepository: Repository<PresentationActionLog>,
    private readonly catalog: PresentationCatalogService,
    private readonly renderer: PresentationRendererService,
    private readonly config: PresentationConfigService,
    @Optional() @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly queue?: ManagedQueueService,
    @Optional() @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtimeCapabilities?: AgentMiddlewareRuntimeCapabilityRegistry
  ) {}

  async createDeck(scope: PresentationScope, input: CreateDeckInput) {
    const title = requireText(input.title, 'Presentation title is required.')
    const goal = requireText(input.goal, 'Presentation goal is required.')
    const themePack = requireTheme(input.themePack)
    const pageCount = clampPageCount(input.pageCount, this.config.get().maxPageCount)
    const spec: PresentationDeckSpec = {
      title,
      goal,
      audience: optionalText(input.audience),
      owner: optionalText(input.owner),
      themePack,
      pageCount,
      preview: { autosave: false, themeSwitcher: false },
      slides: []
    }
    const doc = createPresentationYDoc(spec)
    const encoded = encodeYDoc(doc)
    const checksum = checksumJson(spec)
    const deck = await this.deckRepository.save(this.deckRepository.create({
      ...scopeFields(scope),
      title,
      goal,
      audience: optionalText(input.audience),
      owner: optionalText(input.owner),
      themePack,
      status: 'draft',
      revision: 0,
      currentVersionNumber: 0,
      deckSpec: spec,
      editorState: materializePresentationYDoc(doc).editorState,
      yjsStateBase64: encoded.stateBase64,
      yjsStateVectorBase64: encoded.stateVectorBase64,
      yjsUpdateCount: 0,
      checksum,
      createdById: optionalText(scope.userId),
      lastEditedById: optionalText(scope.userId),
      lastEditedAt: new Date()
    }))
    await this.log(scope, { deckId: deck.id, action: 'deck_created', actor: 'agent', message: title })
    return compactDeck(deck, 'Deck created. Search and inspect layouts before adding slides.')
  }

  async searchDecks(scope: PresentationScope, query: PresentationWorkbenchQuery) {
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20))
    const where = scopedDeckWhere(scope)
    if (query.status) where.status = requireStatus(query.status)
    const [items, total] = await this.deckRepository.findAndCount({
      where,
      order: { lastEditedAt: 'DESC', updatedAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
    const search = optionalText(query.search)?.toLowerCase()
    const filtered = search ? items.filter((item) => `${item.title} ${item.goal}`.toLowerCase().includes(search)) : items
    return {
      tableKey: 'decks',
      table: { key: 'decks', items: filtered.map((item) => compactDeck(item)), total: search ? filtered.length : total, page, pageSize },
      items: filtered.map((item) => compactDeck(item)),
      total: search ? filtered.length : total,
      page,
      pageSize,
      exportCapabilities: await this.renderer.getExportCapabilities()
    }
  }

  async getDeck(scope: PresentationScope, deckId: string, includeSlides = true) {
    const deck = await this.requireDeck(scope, deckId)
    const [versions, exportRecords, assets, exportCapabilities] = await Promise.all([
      this.versionRepository.find({ where: scopedVersionWhere(scope, deckId), order: { versionNumber: 'DESC' }, take: 20 }),
      this.exportRepository.find({ where: scopedExportWhere(scope, { deckId }), order: { createdAt: 'DESC' }, take: 20 }),
      this.assetRepository.find({ where: scopedAssetWhere(scope, deckId), order: { createdAt: 'DESC' }, take: 100 }),
      this.renderer.getExportCapabilities()
    ])
    const exports = await this.reconcileExportRecords(scope, exportRecords)
    return {
      item: { ...compactDeck(deck), ...(includeSlides ? { deckSpec: deck.deckSpec, editorState: deck.editorState } : {}) },
      versions: versions.map(compactVersion),
      exports: exports.map(compactExport),
      assets: assets.map(compactAsset),
      exportCapabilities
    }
  }

  async openDeck(scope: PresentationScope, deckId: string) {
    await this.migrateWorkingSchema(scope, deckId)
    const detail = await this.getDeck(scope, deckId, true)
    return { ...detail, collab: await this.createCollabSession(scope, deckId) }
  }

  async loadThemeRuntime(scope: PresentationScope, deckId: string) {
    const deck = await this.requireDeck(scope, deckId)
    const payload = await this.catalog.loadNativeThemeRuntime(deck.themePack)
    if (Buffer.byteLength(payload.script, 'utf8') > this.config.get().maxPreviewBytes) {
      throw new BadRequestException('Native presentation theme runtime exceeds the configured preview limit.')
    }
    return payload
  }

  async loadAssetPreviews(scope: PresentationScope, deckId: string, assetIds: string[]) {
    await this.requireDeck(scope, deckId)
    const ids = [...new Set(assetIds)].filter(Boolean)
    if (!ids.length || ids.length > 8) throw new BadRequestException('Request between 1 and 8 presentation asset previews.')
    const assets = await this.assetRepository.find({ where: scopedAssetWhere(scope, deckId) })
    const selected = ids.map((id) => assets.find((asset) => asset.id === id)).filter((asset): asset is PresentationAsset => Boolean(asset))
    if (selected.length !== ids.length) throw new NotFoundException('One or more presentation assets were not found.')
    let totalBytes = 0
    const previews = []
    for (const asset of selected) {
      const file = await this.workspaceFiles().readRuntimeBuffer(asset.fileReference.reference)
      totalBytes += file.buffer.byteLength
      if (totalBytes > this.config.get().maxPreviewBytes) throw new BadRequestException('Presentation asset previews exceed the configured preview limit.')
      const mimeType = asset.mimeType ?? file.mimeType ?? 'application/octet-stream'
      previews.push({
        id: requireId(asset.id, 'Asset id is required.'),
        fileName: asset.fileName,
        mimeType,
        size: file.buffer.byteLength,
        dataUrl: `data:${mimeType};base64,${file.buffer.toString('base64')}`
      })
    }
    return { deckId, items: previews }
  }

  async addSlide(scope: PresentationScope, input: AddSlideInput) {
    const deck = await this.requireDeck(scope, input.deckId)
    await this.catalog.requireLayout(input.layout, deck.themePack)
    const validation = await this.catalog.validateLayoutProps(input.layout, input.props)
    if (deck.deckSpec.slides.some((slide) => slide.layout === input.layout && slide.status !== 'deleted')) {
      throw new BadRequestException(`Layout ${input.layout} is already used in this deck.`)
    }
    if (activeSlides(deck.deckSpec).length >= deck.deckSpec.pageCount) {
      throw new BadRequestException(`Deck already contains its requested ${deck.deckSpec.pageCount} active slides.`)
    }
    const slide: PresentationSlideSpec = { id: randomUUID(), layout: input.layout, status: 'active', props: input.props }
    const result = await this.mutateDeck(scope, deck, `presentation:agent:presentation_add_slide:${slide.id}`, ({ slideOrder, slides }) => {
      slides.set(slide.id, slideToYMap(slide))
      const position = Math.min(slideOrder.length, Math.max(0, input.position ?? slideOrder.length))
      slideOrder.insert(position, [slide.id])
    })
    await this.log(scope, { deckId: deck.id, action: 'slide_added', actor: 'agent', message: input.changeSummary, summary: { slideId: slide.id, layout: slide.layout } })
    return {
      message: 'Slide added.', deckId: deck.id, slideId: slide.id, revision: result.revision,
      activeSlides: activeSlides(result.deckSpec).length, warnings: validation.warnings
    }
  }

  async patchSlide(scope: PresentationScope, input: PatchSlideInput) {
    const deck = await this.requireDeck(scope, input.deckId)
    const current = deck.deckSpec.slides.find((slide) => slide.id === input.slideId)
    if (!current) throw new NotFoundException('Presentation slide was not found.')
    if ((input.layout || input.status === 'deleted') && input.expectedRevision !== deck.revision) {
      throw new BadRequestException(`Presentation revision conflict. Current revision is ${deck.revision}.`)
    }
    if (input.layout) {
      await this.catalog.requireLayout(input.layout, deck.themePack)
      if (deck.deckSpec.slides.some((slide) => slide.id !== input.slideId && slide.layout === input.layout && slide.status !== 'deleted')) {
        throw new BadRequestException(`Layout ${input.layout} is already used in this deck.`)
      }
    }
    if (input.status === 'active' && current.status !== 'active' && activeSlides(deck.deckSpec).length >= deck.deckSpec.pageCount) {
      throw new BadRequestException(`Deck already contains its requested ${deck.deckSpec.pageCount} active slides.`)
    }
    const validation = input.propsPatch || input.layout
      ? await this.catalog.validateLayoutProps(input.layout ?? current.layout, mergePresentationObjects(current.props, input.propsPatch ?? {}))
      : { warnings: [] }
    validateTextPatch(input.textPatch)
    const result = await this.mutateDeck(scope, deck, `presentation:agent:presentation_patch_slide:${input.slideId}`, ({ slides, texts }) => {
      const slide = slides.get(input.slideId)
      if (!slide) throw new NotFoundException('Presentation slide was not found in Yjs state.')
      const patch: PresentationJsonObject = {}
      if (input.layout) patch.layout = input.layout
      if (input.status) patch.status = input.status
      if (input.propsPatch) patch.props = input.propsPatch
      patchSlideYMap(slide, patch)
      for (const [key, value] of Object.entries(input.textPatch ?? {})) setPresentationYText(texts, key, value)
    }, input.layout || input.status === 'deleted' ? input.expectedRevision : undefined)
    await this.log(scope, { deckId: deck.id, action: 'slide_patched', actor: 'agent', message: input.changeSummary, summary: { slideId: input.slideId } })
    return { message: 'Slide patched.', deckId: deck.id, slideId: input.slideId, revision: result.revision, warnings: validation.warnings }
  }

  async reorderSlides(scope: PresentationScope, deckId: string, slideIds: string[], expectedRevision: number) {
    const deck = await this.requireDeck(scope, deckId)
    if (expectedRevision !== deck.revision) throw new BadRequestException(`Presentation revision conflict. Current revision is ${deck.revision}.`)
    const existing = deck.deckSpec.slides.map((slide) => slide.id).sort()
    const requested = [...new Set(slideIds)].sort()
    if (existing.length !== requested.length || existing.some((id, index) => id !== requested[index])) {
      throw new BadRequestException('slideIds must contain every current slide id exactly once.')
    }
    const result = await this.mutateDeck(scope, deck, 'presentation:agent:presentation_reorder_slides', ({ slideOrder }) => {
      slideOrder.delete(0, slideOrder.length)
      slideOrder.insert(0, slideIds)
    }, expectedRevision)
    return { message: 'Slides reordered.', deckId, revision: result.revision }
  }

  async registerRuntimeAsset(
    scope: PresentationScope,
    input: { deckId: string; role: string; slideId?: string; evidence?: PresentationJsonValue },
    file: { name: string; mimeType?: string; size?: number; buffer: Buffer; reference: WorkspacePortableFileReference }
  ) {
    const deck = await this.requireDeck(scope, input.deckId)
    validateAssetType(file.name, file.mimeType)
    const size = file.size ?? file.buffer.byteLength
    await this.validateAssetSize(scope, deck.id as string, size)
    const sha256 = createHash('sha256').update(file.buffer).digest('hex')
    const reference: PresentationAssetReference = {
      reference: file.reference,
      fileName: file.name,
      mimeType: file.mimeType,
      size,
      sha256,
      workspacePath: file.reference.workspacePath
    }
    const asset = await this.assetRepository.save(this.assetRepository.create({
      ...scopeFields(scope), deckId: deck.id, slideId: optionalText(input.slideId), role: requireText(input.role, 'Asset role is required.'),
      fileName: file.name, mimeType: file.mimeType, size, sha256, fileReference: reference, evidence: input.evidence, createdById: optionalText(scope.userId)
    }))
    return { message: 'Asset registered.', deckId: deck.id, assetId: asset.id, reference: `asset://${asset.id}`, fileName: asset.fileName, mimeType: asset.mimeType, size }
  }

  async uploadAsset(scope: PresentationScope, input: { deckId: string; role: string; slideId?: string; fileName: string; mimeType?: string }, buffer: Buffer) {
    const deck = await this.requireDeck(scope, input.deckId)
    validateAssetType(input.fileName, input.mimeType)
    await this.validateAssetSize(scope, deck.id as string, buffer.byteLength)
    const files = this.workspaceFiles()
    const workspaceScope = explicitWorkspaceScope(deck, scope)
    const uploaded = await files.uploadBuffer({
      ...workspaceScope, buffer, originalName: input.fileName, mimeType: input.mimeType, size: buffer.byteLength,
      folder: `files/presentation-studio/${deck.id}/assets`
    })
    const reference = portableReference(uploaded, workspaceScope, input.fileName, input.mimeType, buffer.byteLength)
    return this.registerRuntimeAsset(scope, input, {
      name: input.fileName, mimeType: input.mimeType, size: buffer.byteLength, buffer, reference
    })
  }

  async finalizeDeck(scope: PresentationScope, deckId: string, expectedRevision: number, source: PresentationVersionSource, changeSummary?: string) {
    const deck = await this.requireCanonicalDeck(scope, deckId)
    if (deck.revision !== expectedRevision) throw new BadRequestException(`Presentation revision conflict. Current revision is ${deck.revision}.`)
    await this.validateDeck(deck)
    const assets = await this.assetRepository.find({ where: scopedAssetWhere(scope, deckId) })
    const temporaryVersion = this.versionRepository.create({
      deckId, versionNumber: deck.currentVersionNumber + 1, source, deckSpec: deck.deckSpec,
      editorState: deck.editorState as PresentationEditorState, checksum: checksumJson(deck.deckSpec), rendererVersion: '0.1.0', upstreamCommit: DASHIAI_UPSTREAM_COMMIT
    })
    const rendered = await this.renderer.renderVersion(temporaryVersion, assets)
    await this.renderer.cleanup(rendered.directory)
    const version = await this.createVersion(scope, deck, source, changeSummary)
    await this.log(scope, { deckId, versionId: version.id, action: 'deck_finalized', actor: source === 'agent' ? 'agent' : 'workbench', message: changeSummary })
    return { message: 'Deck finalized.', deckId, versionId: version.id, versionNumber: version.versionNumber, revision: deck.revision, checksum: version.checksum }
  }

  async restoreVersion(scope: PresentationScope, deckId: string, versionId: string, expectedRevision: number) {
    const deck = await this.requireCanonicalDeck(scope, deckId)
    if (deck.revision !== expectedRevision) throw new BadRequestException(`Presentation revision conflict. Current revision is ${deck.revision}.`)
    const version = await this.requireVersion(scope, deckId, versionId)
    const collaboration = this.collaboration()
    const document = await collaboration.ensureDocument({ providerKey: PRESENTATION_COLLABORATION_PROVIDER_KEY, resourceId: deckId, schemaVersion: 2 })
    const state = await collaboration.getDocumentState({ documentId: document.id })
    if (state.sequenceNumber !== expectedRevision) throw new BadRequestException(`Presentation revision conflict. Current revision is ${state.sequenceNumber}.`)
    const doc = decodeYDoc(state.updateBase64)
    const before = Y.encodeStateVector(doc)
    writeDeckToYDoc(doc, version.deckSpec, version.editorState, deck.status)
    const update = Y.encodeStateAsUpdate(doc, before)
    await collaboration.applyUpdate({
      documentId: document.id,
      updateBase64: Buffer.from(update).toString('base64'),
      origin: `workbench:restore-version:${version.id}`,
      expectedSequence: expectedRevision,
      actor: { actorType: 'user', actorKey: scope.userId ?? null }
    })
    const restoredDeck = await this.requireCanonicalDeck(scope, deckId)
    const restored = await this.createVersion(scope, restoredDeck, 'restore', `Restored version ${version.versionNumber}.`)
    return { message: 'Version restored as a new version.', deckId, versionId: restored.id, revision: restoredDeck.revision }
  }

  async deleteVersion(scope: PresentationScope, deckId: string, versionId: string) {
    const deck = await this.requireDeck(scope, deckId)
    const version = await this.requireVersion(scope, deckId, versionId)
    const deletedVersionId = requireId(version.id, 'Version id is required for deletion.')
    await this.versionRepository.delete(scopedVersionIdWhere(scope, deckId, deletedVersionId))
    if (deck.currentVersionId === deletedVersionId || deck.currentVersionNumber === version.versionNumber) {
      const remaining = await this.versionRepository.find({
        where: scopedVersionWhere(scope, deckId),
        order: { versionNumber: 'DESC' },
        take: 1
      })
      const nextCurrent = remaining[0] ?? null
      deck.currentVersionId = nextCurrent?.id
      deck.currentVersionNumber = nextCurrent?.versionNumber ?? 0
      await this.deckRepository.save(deck)
    }
    await this.log(scope, {
      deckId,
      versionId: deletedVersionId,
      action: 'version_deleted',
      actor: 'workbench',
      message: `Deleted version ${version.versionNumber}.`,
      summary: { deletedVersionId, deletedVersionNumber: version.versionNumber }
    })
    return {
      message: 'Presentation version deleted.',
      deckId,
      deletedVersionId,
      currentVersionId: deck.currentVersionId ?? null,
      currentVersionNumber: deck.currentVersionNumber
    }
  }

  async updateStatus(scope: PresentationScope, deckId: string, status: PresentationStatus, reason?: string, actor: 'agent' | 'workbench' = 'agent') {
    const deck = await this.requireDeck(scope, deckId)
    const nextStatus = requireStatus(status)
    const origin = actor === 'agent' ? 'presentation:agent:presentation_update_status' : 'workbench:update-status'
    const result = await this.mutateDeck(scope, deck, origin, ({ deck: deckMap }) => {
      deckMap.set('status', nextStatus)
    }, undefined, (current) => {
      current.failureReason = nextStatus === 'failed' ? optionalText(reason) : undefined
    })
    await this.log(scope, { deckId, action: 'status_updated', actor, message: reason, summary: { status } })
    return { message: `Deck status updated to ${status}.`, deckId, status, revision: result.revision }
  }

  async renameDeck(scope: PresentationScope, deckId: string, title: string, expectedRevision: number) {
    const deck = await this.requireDeck(scope, deckId)
    const nextTitle = requireText(title, 'Presentation title is required.')
    const result = await this.mutateDeck(scope, deck, 'workbench:rename-deck', ({ deck: deckMap }) => {
      deckMap.set('title', nextTitle)
    }, expectedRevision)
    await this.log(scope, { deckId, action: 'deck_renamed', actor: 'workbench', summary: { title: nextTitle } })
    return { message: 'Presentation renamed.', deckId, title: nextTitle, revision: result.revision }
  }

  async reportFailure(scope: PresentationScope, input: { deckId?: string; operation: string; errorMessage: string; recoverable?: boolean; evidence?: PresentationJsonValue }) {
    if (input.deckId) await this.requireDeck(scope, input.deckId)
    const log = await this.log(scope, {
      deckId: input.deckId, action: requireText(input.operation, 'Failure operation is required.'), actor: 'agent', status: 'failed',
      errorMessage: requireText(input.errorMessage, 'Failure errorMessage is required.'), summary: { recoverable: Boolean(input.recoverable), ...(input.evidence !== undefined ? { evidence: input.evidence } : {}) }
    })
    return { message: 'Presentation failure recorded.', deckId: input.deckId, logId: log.id }
  }

  /**
   * Rejects unavailable browser formats before creating business state, then
   * queues only the Export id in the format-specific execution pool.
   */
  async requestExport(scope: PresentationScope, input: { deckId: string; versionId?: string; kind: PresentationExportKind; fileName?: string; expectedRevision?: number }) {
    const deck = await this.requireCanonicalDeck(scope, input.deckId)
    const kind = requireExportKind(input.kind)
    if (kind !== 'html') {
      const capability = (await this.renderer.getExportCapabilities())[kind]
      if (!capability.available) {
        throw new BadRequestException(
          capability.message ?? `${kind.toUpperCase()} export is unavailable: ${capability.reason ?? 'unknown reason'}.`
        )
      }
    }
    let version: PresentationDeckVersion
    let workingRevision: number | undefined
    if (input.versionId) {
      version = await this.requireVersion(scope, deck.id as string, input.versionId)
    } else {
      if (input.expectedRevision !== deck.revision) throw new BadRequestException(`Presentation revision conflict. Current revision is ${deck.revision}.`)
      await this.validateDeck(deck)
      workingRevision = deck.revision
      version = this.workingExportVersion(deck)
    }
    if (!this.queue) throw new Error('Platform managed queue service is not available.')
    const report = workingRevision === undefined ? undefined : {
      [WORKING_EXPORT_SNAPSHOT_KEY]: serializeWorkingExportVersion(version, workingRevision)
    }
    const exportRecord = await this.exportRepository.save(this.exportRepository.create({
      ...scopeFields(scope), userId: optionalText(scope.userId), deckId: deck.id, versionId: version.id, kind, status: 'queued',
      progress: 0, stage: 'queued', checksum: version.checksum, fileName: normalizeExportName(input.fileName ?? deck.title, kind),
      report, createdById: optionalText(scope.userId)
    }))
    const exportId = requireId(exportRecord.id, 'Export id is required.')
    const jobId = `presentation-studio-${exportId}`
    const payload: PresentationExportJobData = {
      exportId,
      tenantId: optionalText(scope.tenantId), organizationId: optionalText(scope.organizationId)
    }
    try {
      const queued = await this.queue.enqueue({
        pluginName: PRESENTATION_STUDIO_PLUGIN_NAME, queueName: PRESENTATION_EXPORT_QUEUE, jobName: PRESENTATION_EXPORT_JOB,
        payload, tenantId: scope.tenantId, organizationId: scope.organizationId,
        scopeKey: SYSTEM_GLOBAL_SCOPE,
        userId: scope.userId, jobId, attempts: 3, backoffMs: { type: 'exponential', delay: 1500 },
        executionPool: exportExecutionPool(kind),
        removeOnComplete: { age: 24 * 60 * 60, count: 100 }, removeOnFail: { age: 7 * 24 * 60 * 60, count: 100 }
      })
      exportRecord.jobId = queued.jobId
      await this.exportRepository.save(exportRecord)
      return {
        message: 'Presentation export queued.', deckId: deck.id,
        versionId: workingRevision === undefined ? version.id : null,
        ...(workingRevision === undefined ? {} : { workingRevision }),
        exportId, jobId: queued.jobId, status: exportRecord.status, kind
      }
    } catch (error) {
      exportRecord.status = 'failed'
      exportRecord.stage = 'queueing'
      exportRecord.errorMessage = errorMessage(error)
      await this.exportRepository.save(exportRecord)
      throw error
    }
  }

  async getExport(scope: PresentationScope, exportId: string) {
    const item = await this.requireScopedExport(scope, exportId)
    return compactExport(await this.reconcileExportRecord(scope, item))
  }

  async shareHtmlExport(
    scope: PresentationScope,
    input: {
      deckId?: string | null
      exportId: string
      versionMode?: ArtifactLinkVersionMode | null
      accessMode?: ArtifactAccessMode | null
      allowDownload?: boolean | null
      actor?: 'agent' | 'workbench' | null
      preserveExistingLink?: boolean | null
    }
  ) {
    const item = await this.requireScopedExport(scope, input.exportId)
    if (input.deckId && item.deckId !== input.deckId) throw new BadRequestException('Presentation export does not belong to the requested deck.')
    if (item.kind !== 'html') throw new BadRequestException('Only HTML presentation exports can be shared as interactive artifacts.')
    if (item.status !== 'succeeded') throw new BadRequestException('Only completed HTML exports can be shared.')
    const deck = await this.requireDeck(scope, item.deckId)
    const { artifactId, artifactVersionId } = await this.ensureHtmlExportArtifactVersion(scope, item, deck)
    const versionMode = normalizeArtifactLinkVersionMode(input.versionMode)
    const accessMode = normalizeArtifactAccessMode(input.accessMode)
    if (
      item.artifactLinkId &&
      item.artifactPublicUrl &&
      isCurrentArtifactPublicUrl(item.artifactPublicUrl) &&
      (input.preserveExistingLink === true || (
        item.artifactLinkVersionMode === versionMode &&
        item.artifactLinkAccessMode === accessMode
      ))
    ) {
      return {
        message: 'Presentation HTML share link is ready.',
        ...compactExport(item),
        publicUrl: item.artifactPublicUrl,
        artifactId,
        artifactVersionId,
        artifactLinkId: item.artifactLinkId,
        versionMode: item.artifactLinkVersionMode ?? versionMode,
        accessMode: item.artifactLinkAccessMode ?? accessMode
      }
    }
    if (item.artifactLinkId) await this.revokeArtifactLinkBestEffort(item.artifactLinkId)
    const link = await this.artifacts().createArtifactLink({
      artifactId,
      artifactVersionId: versionMode === 'version' ? artifactVersionId : null,
      versionMode,
      access: {
        mode: accessMode,
        userConfirmedPublicLink: accessMode === 'public_link' ? true : null
      },
      presentation: {
        disposition: 'inline',
        allowDownload: input.allowDownload !== false,
        safeHtmlProfile: 'interactive'
      },
      metadata: artifactMetadata(item, deck, { action: 'share_html_export' })
    })
    item.artifactLinkId = link.id
    item.artifactLinkVersionMode = link.versionMode
    item.artifactLinkAccessMode = link.accessMode
    item.artifactPublicUrl = link.publicUrl
    item.artifactSharedAt = new Date()
    await this.exportRepository.save(item)
    await this.log(scope, {
      deckId: item.deckId,
      versionId: item.versionId,
      exportId: requireId(item.id, 'Export id is required for share logging.'),
      action: 'export_shared',
      actor: input.actor ?? 'workbench',
      message: 'Shared HTML export as an Artifact link.',
      summary: { artifactId, artifactVersionId, artifactLinkId: link.id, versionMode: link.versionMode, accessMode: link.accessMode }
    })
    return {
      message: 'Presentation HTML share link is ready.',
      ...compactExport(item),
      publicUrl: link.publicUrl,
      artifactId,
      artifactVersionId,
      artifactLinkId: link.id,
      versionMode: link.versionMode,
      accessMode: link.accessMode
    }
  }

  async shareDeckHtmlExport(
    scope: PresentationScope,
    input: {
      deckId: string
      expectedRevision?: number | null
      versionMode?: ArtifactLinkVersionMode | null
      accessMode?: ArtifactAccessMode | null
      allowDownload?: boolean | null
      actor?: 'agent' | 'workbench' | null
      preserveExistingLink?: boolean | null
    }
  ) {
    const deck = await this.requireDeck(scope, input.deckId)
    const deckId = requireId(deck.id, 'Deck id is required for sharing.')
    const currentChecksum = deck.checksum ?? checksumJson(deck.deckSpec)
    const completed = await this.exportRepository.findOne({
      where: { ...scopedExportWhere(scope, { deckId }), kind: 'html', status: 'succeeded', checksum: currentChecksum },
      order: { createdAt: 'DESC' }
    })
    if (completed) {
      return this.shareHtmlExport(scope, {
        deckId,
        exportId: requireId(completed.id, 'Export id is required.'),
        versionMode: input.versionMode,
        accessMode: input.accessMode,
        allowDownload: input.allowDownload,
        actor: input.actor,
        preserveExistingLink: input.preserveExistingLink
      })
    }

    const pending = await this.exportRepository.findOne({
      where: { ...scopedExportWhere(scope, { deckId }), kind: 'html', status: 'running' },
      order: { createdAt: 'DESC' }
    }) ?? await this.exportRepository.findOne({
      where: { ...scopedExportWhere(scope, { deckId }), kind: 'html', status: 'queued' },
      order: { createdAt: 'DESC' }
    })
    if (pending) {
      const item = await this.reconcileExportRecord(scope, pending)
      return {
        message: 'Presentation HTML export is being prepared before sharing.',
        sharePending: true,
        ...compactExport(item)
      }
    }

    const queued = await this.requestExport(scope, {
      deckId,
      kind: 'html',
      fileName: deck.title,
      expectedRevision: input.expectedRevision ?? deck.revision
    })
    return {
      ...queued,
      message: 'Presentation HTML export queued before sharing.',
      sharePending: true,
      shareUrl: null,
      publicUrl: null
    }
  }

  async cancelExport(scope: PresentationScope, exportId: string) {
    const item = await this.requireScopedExport(scope, exportId)
    if (!item.jobId || !this.queue) throw new BadRequestException('Presentation export cannot be cancelled.')
    if (item.sandboxJobId) {
      await this.sandboxJobs()?.cancel({ jobId: item.sandboxJobId }).catch(() => undefined)
    }
    const result = await this.queue.cancel({ jobId: item.jobId, executionPool: exportExecutionPool(item.kind) })
    if (result.success) {
      item.status = 'cancelled'; item.stage = 'cancelled'; await this.exportRepository.save(item)
    } else if (result.reason === 'not_found' && (item.status === 'queued' || item.status === 'running')) {
      item.status = 'failed'; item.stage = 'queue-missing'; item.errorMessage = 'Managed queue job was not found before the export completed.'
      await this.exportRepository.save(item)
    }
    return { ...result, exportId }
  }

  async deleteExport(scope: PresentationScope, exportId: string) {
    const item = await this.requireScopedExport(scope, exportId)
    if ((item.status === 'queued' || item.status === 'running') && item.jobId && this.queue) {
      try {
        if (item.sandboxJobId) await this.sandboxJobs()?.cancel({ jobId: item.sandboxJobId }).catch(() => undefined)
        await this.queue.cancel({ jobId: item.jobId, executionPool: exportExecutionPool(item.kind) })
      } catch {
        // Queue cleanup is best-effort; the export row deletion is authoritative for the Workbench.
      }
    }
    const linkRevoked = await this.revokeArtifactLinkBestEffort(item.artifactLinkId)
    const fileDeleted = await this.deleteWorkspaceFile(item.fileReference?.reference)
    await this.exportRepository.delete(scopedExportWhere(scope, { id: exportId }))
    await this.log(scope, {
      deckId: item.deckId,
      exportId,
      action: 'export_deleted',
      actor: 'workbench',
      message: `Deleted ${item.kind.toUpperCase()} export.`,
      summary: { deletedExportId: exportId, kind: item.kind, fileDeleted, linkRevoked }
    })
    return { message: 'Presentation export deleted.', exportId, deckId: item.deckId, fileDeleted, linkRevoked }
  }

  async processExportJob(data: PresentationExportJobData) {
    const scope: PresentationScope = { tenantId: data.tenantId, organizationId: data.organizationId }
    const item = await this.exportRepository.findOne({ where: scopedExportWhere(scope, { id: data.exportId }) })
    if (!item || item.status === 'cancelled' || item.status === 'succeeded') return
    const deckId = requireId(item.deckId, 'Presentation export deck id is required.')
    const versionId = requireId(item.versionId, 'Presentation export version id is required.')
    const checksum = requireText(item.checksum, 'Presentation export checksum is required.')
    const deck = await this.requireDeck(scope, deckId)
    const version = deserializeWorkingExportVersion(item.report, this.versionRepository)
      ?? await this.requireVersion(scope, deckId, versionId)
    if (version.checksum !== checksum) throw new Error('Presentation export checksum mismatch.')
    item.status = 'running'; item.stage = 'rendering'; item.progress = 10; await this.exportRepository.save(item)
    let rendered
    try {
      const assets = await this.assetRepository.find({ where: scopedAssetWhere(scope, deckId) })
      const workspaceScope = explicitWorkspaceScope(deck, { ...scope, userId: item.userId })
      if (item.kind !== 'html' && this.config.get().exportBackend === 'sandbox-job') {
        item.sandboxJobId = data.exportId
        item.stage = 'sandbox-starting'; item.progress = 20; await this.exportRepository.save(item)
        const tenantId = optionalText(deck.tenantId) ?? optionalText(scope.tenantId)
        if (!tenantId) throw new Error('Presentation Sandbox Job requires a tenant id.')
        const result = await this.renderer.exportVersionInSandbox({
          exportId: data.exportId,
          checksum,
          version,
          assets,
          kind: item.kind,
          title: deck.title,
          fileName: item.fileName ?? normalizeExportName(deck.title, item.kind),
          tenantId,
          organizationId: deck.organizationId ?? scope.organizationId,
          userId: item.userId,
          destination: { ...workspaceScope, folder: `files/presentation-studio/${deck.id}/exports` }
        })
        if (await this.exportWasCancelled(scope, data.exportId)) return
        item.sandboxJobId = result.jobId
        item.status = 'succeeded'; item.stage = 'complete'; item.progress = 100
        item.mimeType = result.output.mimeType; item.size = result.output.size
        item.fileReference = {
          reference: result.output.reference,
          fileName: result.output.originalName,
          mimeType: result.output.mimeType,
          size: result.output.size,
          sha256: result.output.sha256,
          fileUrl: result.output.fileUrl,
          workspacePath: result.output.workspacePath
        }
        item.report = result.report
        await this.exportRepository.save(item)
        return
      }
      rendered = await this.renderer.renderVersion(version, assets)
      if (await this.exportWasCancelled(scope, data.exportId)) return
      item.stage = 'exporting'; item.progress = 55; await this.exportRepository.save(item)
      const output = await this.renderer.exportRendered(rendered, item.kind, deck.title)
      if (await this.exportWasCancelled(scope, data.exportId)) return
      item.stage = 'uploading'; item.progress = 85; await this.exportRepository.save(item)
      const uploaded = await this.workspaceFiles().uploadBuffer({
        ...workspaceScope, buffer: output.buffer, originalName: item.fileName ?? normalizeExportName(deck.title, item.kind),
        mimeType: output.mimeType, size: output.buffer.byteLength, folder: `files/presentation-studio/${deck.id}/exports`
      })
      if (await this.exportWasCancelled(scope, data.exportId)) return
      const reference = portableReference(uploaded, workspaceScope, item.fileName ?? deck.title, output.mimeType, output.buffer.byteLength)
      item.status = 'succeeded'; item.stage = 'complete'; item.progress = 100; item.mimeType = output.mimeType; item.size = output.buffer.byteLength
      item.fileReference = { reference, fileName: item.fileName ?? deck.title, mimeType: output.mimeType, size: output.buffer.byteLength,
        sha256: createHash('sha256').update(output.buffer).digest('hex'), fileUrl: uploaded.fileUrl ?? uploaded.url, workspacePath: uploaded.workspacePath }
      item.report = output.report
      await this.exportRepository.save(item)
      await this.tryEnsureHtmlExportArtifactVersion(scope, item, deck)
    } catch (error) {
      if (await this.exportWasCancelled(scope, data.exportId)) return
      const code = isSandboxJobRuntimeError(error) ? error.code : null
      item.status = code === 'SANDBOX_CANCELLED' ? 'cancelled' : 'failed'
      item.stage = 'failed'; item.errorMessage = errorMessage(error); await this.exportRepository.save(item)
      if (!code || isRetryableSandboxError(code)) throw error
    } finally {
      if (rendered) await this.renderer.cleanup(rendered.directory)
    }
  }

  private async exportWasCancelled(scope: PresentationScope, exportId: string) {
    const current = await this.exportRepository.findOne({ where: scopedExportWhere(scope, { id: exportId }) })
    return current?.status === 'cancelled'
  }

  private async reconcileExportRecords(scope: PresentationScope, items: PresentationExport[]) {
    return Promise.all(items.map((item) => this.reconcileExportRecord(scope, item)))
  }

  private async reconcileExportRecord(scope: PresentationScope, item: PresentationExport) {
    if (!this.queue || !item.jobId || (item.status !== 'queued' && item.status !== 'running')) return item
    let job
    try {
      job = await this.queue.getJob({ jobId: item.jobId, executionPool: exportExecutionPool(item.kind) })
    } catch {
      return item
    }
    if (!job) {
      return this.failPendingExport(scope, item, 'queue-missing', 'Managed queue job was not found before the export completed.')
    }
    if (job.state === 'active' && item.status === 'queued') {
      item.status = 'running'
      item.stage = 'starting'
      item.progress = Math.max(1, item.progress)
      return this.exportRepository.save(item)
    }
    if (job.state === 'failed') {
      return this.failPendingExport(scope, item, 'queue-failed', 'Managed queue job failed before the export processor completed.')
    }
    if (job.state === 'completed') {
      return this.failPendingExport(scope, item, 'queue-inconsistent', 'Managed queue job completed without a persisted export result.')
    }
    return item
  }

  private async failPendingExport(scope: PresentationScope, item: PresentationExport, stage: string, message: string) {
    const latest = item.id
      ? await this.exportRepository.findOne({ where: scopedExportWhere(scope, { id: item.id }) })
      : item
    if (!latest || (latest.status !== 'queued' && latest.status !== 'running')) return latest ?? item
    latest.status = 'failed'
    latest.stage = stage
    latest.errorMessage = message
    return this.exportRepository.save(latest)
  }

  async getWorkbenchData(scope: PresentationScope, query: PresentationWorkbenchQuery) {
    if (query.deckId || query.table === 'deck_detail') return this.getDeck(scope, requireText(query.deckId, 'Deck id is required.'), true)
    return this.searchDecks(scope, query)
  }

  async setWorkbenchAgentContext(
    scope: PresentationScope,
    input: Omit<PresentationWorkbenchAgentContext, 'updatedAt'> & { updatedAt?: number }
  ) {
    const deckId = requireText(input.deckId, 'Deck id is required.')
    const deck = await this.requireDeck(scope, deckId)
    const slides = activeSlides(deck.deckSpec)
    const requestedSlideId = optionalText(input.slideId)
    const activeIndex = Number.isFinite(input.activeIndex ?? NaN) ? Math.max(0, Math.trunc(input.activeIndex as number)) : undefined
    const inferredSlide = requestedSlideId
      ? slides.find((slide) => slide.id === requestedSlideId)
      : activeIndex !== undefined
        ? slides[activeIndex]
        : slides[0]
    const context: PresentationWorkbenchAgentContext = {
      deckId,
      slideId: inferredSlide?.id ?? requestedSlideId ?? null,
      deckTitle: optionalText(input.deckTitle) ?? deck.title,
      themePack: optionalText(input.themePack) ?? deck.themePack,
      slideLayout: optionalText(input.slideLayout) ?? inferredSlide?.layout ?? null,
      slideLabel: optionalText(input.slideLabel) ?? null,
      activeIndex: activeIndex ?? (inferredSlide ? slides.findIndex((slide) => slide.id === inferredSlide.id) : null),
      slideCount: Number.isFinite(input.slideCount ?? NaN) ? Math.max(0, Math.trunc(input.slideCount as number)) : slides.length,
      revision: Number.isFinite(input.revision ?? NaN) ? Math.max(0, Math.trunc(input.revision as number)) : deck.revision,
      currentVersionNumber: Number.isFinite(input.currentVersionNumber ?? NaN) ? Math.max(0, Math.trunc(input.currentVersionNumber as number)) : deck.currentVersionNumber,
      assistantDisplayName: optionalText(input.assistantDisplayName) ?? optionalText(scope.assistantDisplayName) ?? null,
      updatedAt: Date.now()
    }
    await this.writeWorkbenchAgentContext(scope, context)
    return context
  }

  async getWorkbenchAgentContext(scope: PresentationScope) {
    for (const key of workbenchAgentContextKeys(scope)) {
      const local = this.workbenchAgentContexts.get(key)
      if (local && local.expiresAt >= Date.now()) return local.value
      if (local) this.workbenchAgentContexts.delete(key)
      if (!this.queue) continue
      const redis = await this.queue.getRedis()
      const raw = await redis.get(key)
      const parsed = raw ? parseWorkbenchAgentContext(raw) : null
      if (parsed) {
        this.workbenchAgentContexts.set(key, { value: parsed, expiresAt: Date.now() + WORKBENCH_AGENT_CONTEXT_TTL_SECONDS * 1000 })
        return parsed
      }
    }
    return null
  }

  /** Issue browser credentials for the canonical collaboration document behind a Deck. */
  async createCollabSession(scope: PresentationScope, deckId: string) {
    const collaboration = this.collaboration()
    const document = await collaboration.ensureDocument({
      providerKey: PRESENTATION_COLLABORATION_PROVIDER_KEY,
      resourceId: deckId,
      schemaVersion: 2
    })
    const session = await collaboration.createSession({ documentId: document.id, access: 'write' })
    return { ...session, deckId }
  }

  createAgentCollabActor(scope: PresentationScope, deckId: string) {
    const identity = [
      scope.tenantId ?? '-',
      scope.organizationId ?? '-',
      scope.assistantId ?? scope.agentKey ?? 'agent',
      scope.conversationId ?? '-',
      deckId
    ].join(':')
    const digest = createHash('sha256').update(identity).digest()
    const digestBase64 = createHash('sha256').update(identity).digest('base64url')
    const hue = Math.round((digest[0] / 255) * 330)
    const displayName = optionalText(scope.assistantDisplayName) ?? optionalText(scope.agentKey) ?? 'Presentation Agent'
    return {
      presenceId: `agent_${digestBase64.slice(0, 22)}`,
      displayName: displayName.slice(0, 64),
      color: hslToHex(hue, 76, 46),
      actorType: 'agent' as const,
      avatarUrl: null
    }
  }

  /** Represent a middleware tool execution as an Agent presence without opening a socket. */
  async publishAgentAwareness(
    scope: PresentationScope,
    deckId: string,
    actor: ReturnType<PresentationStudioService['createAgentCollabActor']>,
    awareness: PresentationAwarenessV2
  ) {
    const collaboration = this.collaboration()
    const document = await collaboration.ensureDocument({ providerKey: PRESENTATION_COLLABORATION_PROVIDER_KEY, resourceId: deckId, schemaVersion: 2 })
    return collaboration.upsertVirtualPresence({
      documentId: document.id,
      actor: {
        actorType: 'agent',
        actorKey: actor.presenceId,
        displayName: actor.displayName
      },
      presence: presentationPresencePatch(awareness)
    })
  }

  async removeAgentAwareness(scope: PresentationScope, deckId: string, agentPresenceId: string) {
    const collaboration = this.collaboration()
    const document = await collaboration.ensureDocument({ providerKey: PRESENTATION_COLLABORATION_PROVIDER_KEY, resourceId: deckId, schemaVersion: 2 })
    await collaboration.removeVirtualPresence({ documentId: document.id, actorKey: agentPresenceId })
  }

  /**
   * Read the platform snapshot, produce one Yjs delta, and submit it with optional sequence CAS.
   * The Deck entity is read only after provider materialization has projected the accepted state.
   */
  private async mutateDeck(
    scope: PresentationScope,
    deck: PresentationDeck,
    origin: string,
    mutation: Parameters<typeof patchPresentationYDoc>[1],
    expectedRevision?: number,
    entityMutation?: (deck: PresentationDeck) => void
  ) {
    const deckId = requireId(deck.id, 'Deck id is required for Yjs mutation.')
    const collaboration = this.collaboration()
    const document = await collaboration.ensureDocument({ providerKey: PRESENTATION_COLLABORATION_PROVIDER_KEY, resourceId: deckId, schemaVersion: 2 })
    const state = await collaboration.getDocumentState({ documentId: document.id })
    if (expectedRevision !== undefined && state.sequenceNumber !== expectedRevision) {
      throw new BadRequestException(`Presentation revision conflict. Current revision is ${state.sequenceNumber}.`)
    }
    const doc = decodeYDoc(state.updateBase64)
    const update = patchPresentationYDoc(doc, mutation, origin)
    await collaboration.applyUpdate({
      documentId: document.id,
      updateBase64: Buffer.from(update).toString('base64'),
      origin,
      expectedSequence: expectedRevision,
      actor: {
        actorType: origin.includes(':agent:') ? 'agent' : 'user',
        actorKey: scope.assistantId ?? scope.agentKey ?? scope.userId ?? null,
        displayName: scope.assistantDisplayName ?? scope.agentKey ?? null
      }
    })
    const persisted = await this.deckRepository.findOne({ where: scopedDeckWhere(scope, deckId) })
    if (!persisted) throw new NotFoundException('Presentation deck was not found after collaboration update.')
    if (entityMutation) {
      entityMutation(persisted)
      await this.deckRepository.save(persisted)
    }
    Object.assign(deck, persisted)
    return deck
  }

  /** Authorize collaboration by resolving the Deck inside the exact plugin scope. */
  async authorizeCollaborationDocument(context: CollaborationProviderContext) {
    return Boolean(await this.deckRepository.findOne({ where: scopedDeckWhere(collaborationScope(context), context.resourceId) }))
  }

  /** Import a legacy Deck Yjs snapshot and preserve its revision as the initial sequence. */
  async initializeCollaborationDocument(context: CollaborationProviderContext) {
    const scope = collaborationScope(context)
    const deck = await this.deckRepository.findOne({ where: scopedDeckWhere(scope, context.resourceId) })
    if (!deck) throw new NotFoundException('Presentation deck was not found for collaboration initialization.')
    const doc = decodeYDoc(deck.yjsStateBase64)
    ensurePresentationYDocSchemaV2(doc)
    const encoded = encodeYDoc(doc)
    return { stateBase64: encoded.stateBase64, schemaVersion: 2, initialSequence: deck.revision }
  }

  /** Idempotently project authoritative state into DeckSpec, editor state, checksum, and revision. */
  async materializeCollaborationDocument(event: CollaborationMaterializationEvent) {
    const scope = collaborationScope(event)
    await this.deckRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(PresentationDeck)
      const deck = await repository.findOne({ where: scopedDeckWhere(scope, event.resourceId), lock: { mode: 'pessimistic_write' } })
      if (!deck) throw new NotFoundException('Presentation deck was not found during collaboration materialization.')
      const doc = decodeYDoc(event.stateBase64)
      const encoded = { stateBase64: event.stateBase64, stateVectorBase64: event.stateVectorBase64 }
      applyMaterializedDeck(deck, materializePresentationYDoc(doc), encoded)
      deck.revision = event.sequenceNumber
      deck.yjsUpdateCount += event.updateBase64 ? 1 : 0
      deck.checksum = checksumJson(deck.deckSpec)
      deck.lastEditedById = optionalText(scope.userId)
      deck.lastEditedAt = new Date()
      await repository.save(deck)
    })
  }

  /** Require the platform capability so editing never silently falls back to a second authority. */
  private collaboration() {
    const capability = this.runtimeCapabilities?.get(CollaborationRuntimeCapability)
    if (!capability) throw new Error('Platform collaboration capability is not available.')
    return capability
  }

  private sandboxJobs(): SandboxJobsApi | undefined {
    return this.runtimeCapabilities?.get(SandboxJobsRuntimeCapability)
  }

  private async createVersion(scope: PresentationScope, deck: PresentationDeck, source: PresentationVersionSource, changeSummary?: string) {
    const deckId = requireId(deck.id, 'Deck id is required for version creation.')
    return this.deckRepository.manager.transaction(async (manager) => {
      const deckRepository = manager.getRepository(PresentationDeck)
      const versionRepository = manager.getRepository(PresentationDeckVersion)
      const persisted = await deckRepository.findOne({
        where: scopedDeckWhere(scope, deckId),
        lock: { mode: 'pessimistic_write' }
      })
      if (!persisted) throw new NotFoundException('Presentation deck was not found during version creation.')
      if (persisted.revision !== deck.revision || checksumJson(persisted.deckSpec) !== checksumJson(deck.deckSpec)) {
        throw new BadRequestException(`Presentation revision conflict. Current revision is ${persisted.revision}.`)
      }
      const versionNumber = persisted.currentVersionNumber + 1
      const version = await versionRepository.save(versionRepository.create({
        ...scopeFields(scope), deckId, versionNumber, source, deckSpec: deck.deckSpec,
        editorState: deck.editorState as PresentationEditorState, yjsStateBase64: deck.yjsStateBase64, yjsStateVectorBase64: deck.yjsStateVectorBase64,
        yjsUpdateCount: deck.yjsUpdateCount, checksum: checksumJson(deck.deckSpec), rendererVersion: '0.1.0', upstreamCommit: DASHIAI_UPSTREAM_COMMIT,
        changeSummary: optionalText(changeSummary), createdById: optionalText(scope.userId)
      }))
      persisted.currentVersionId = version.id
      persisted.currentVersionNumber = versionNumber
      persisted.checksum = version.checksum
      await deckRepository.save(persisted)
      deck.currentVersionId = persisted.currentVersionId
      deck.currentVersionNumber = persisted.currentVersionNumber
      deck.checksum = persisted.checksum
      return version
    })
  }

  private workingExportVersion(deck: PresentationDeck) {
    const deckId = requireId(deck.id, 'Deck id is required for export.')
    return this.versionRepository.create({
      id: `working-r${deck.revision}`,
      deckId,
      versionNumber: deck.currentVersionNumber,
      source: 'workbench',
      deckSpec: deck.deckSpec,
      editorState: deck.editorState as PresentationEditorState,
      yjsStateBase64: deck.yjsStateBase64,
      yjsStateVectorBase64: deck.yjsStateVectorBase64,
      yjsUpdateCount: deck.yjsUpdateCount,
      checksum: deck.checksum ?? checksumJson(deck.deckSpec),
      rendererVersion: '0.1.0',
      upstreamCommit: DASHIAI_UPSTREAM_COMMIT
    })
  }

  private async validateDeck(deck: PresentationDeck) {
    const slides = activeSlides(deck.deckSpec)
    if (slides.length < 3 || slides.length > this.config.get().maxPageCount) {
      throw new BadRequestException(`Presentation must contain between 3 and ${this.config.get().maxPageCount} active slides.`)
    }
    if (deck.deckSpec.pageCount !== slides.length) {
      throw new BadRequestException(`Expected ${deck.deckSpec.pageCount} active slides but found ${slides.length}.`)
    }
    if (new Set(slides.map((slide) => slide.layout)).size !== slides.length) throw new BadRequestException('Every active slide must use a unique layout.')
    for (const slide of slides) await this.catalog.requireLayout(slide.layout, deck.themePack)
  }

  private async validateAssetSize(scope: PresentationScope, deckId: string, size: number) {
    const config = this.config.get()
    if (!Number.isFinite(size) || size <= 0 || size > config.maxAssetBytes) throw new BadRequestException('Presentation asset exceeds the configured size limit.')
    const assets = await this.assetRepository.find({ where: scopedAssetWhere(scope, deckId) })
    if (assets.reduce((sum, asset) => sum + asset.size, 0) + size > config.maxDeckMediaBytes) throw new BadRequestException('Presentation media total exceeds the configured deck limit.')
  }

  private workspaceFiles(): WorkspaceFilesApi {
    const files = this.runtimeCapabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!files) throw new Error('Platform workspace files capability is not available.')
    return files
  }

  private artifacts(): ArtifactsApi {
    const artifacts = this.runtimeCapabilities?.get(ArtifactsRuntimeCapability)
    if (!artifacts) throw new Error('Platform artifacts capability is not available.')
    return artifacts
  }

  private async tryEnsureHtmlExportArtifactVersion(scope: PresentationScope, item: PresentationExport, deck: PresentationDeck) {
    if (item.kind !== 'html' || item.status !== 'succeeded') return null
    if (!this.runtimeCapabilities?.has?.(ArtifactsRuntimeCapability)) return null
    try {
      return await this.ensureHtmlExportArtifactVersion(scope, item, deck)
    } catch {
      return null
    }
  }

  private async ensureHtmlExportArtifactVersion(scope: PresentationScope, item: PresentationExport, deck: PresentationDeck) {
    if (item.kind !== 'html') throw new BadRequestException('Only HTML presentation exports can be shared as artifacts.')
    if (item.status !== 'succeeded') throw new BadRequestException('Only completed presentation exports can be shared.')
    const reference = item.fileReference?.reference
    if (!reference?.filePath) throw new BadRequestException('Presentation HTML export does not have a Workspace Files reference.')
    const exportId = requireId(item.id, 'Export id is required for artifact registration.')
    const artifacts = this.artifacts()
    const artifact = await artifacts.createArtifact({
      source: {
        pluginName: PRESENTATION_STUDIO_PLUGIN_NAME,
        resourceType: 'presentation_deck_html',
        resourceId: requireId(deck.id, 'Deck id is required for artifact registration.'),
        checksum: item.checksum
      },
      kind: 'html',
      title: deck.title,
      description: deck.goal,
      scope: artifactScope(deck, scope, item),
      metadata: artifactMetadata(item, deck, { action: 'html_export_artifact' })
    })
    item.artifactId = artifact.id
    if (!item.artifactVersionId) {
      const version = await artifacts.createArtifactVersion({
        artifactId: artifact.id,
        workspaceFileRef: reference,
        mimeType: item.mimeType ?? item.fileReference?.mimeType ?? 'text/html',
        fileName: item.fileName ?? item.fileReference?.fileName ?? `${deck.title}.html`,
        title: deck.title,
        description: deck.goal,
        size: item.size ?? item.fileReference?.size ?? null,
        sha256: item.fileReference?.sha256 ?? null,
        sourceVersionId: item.versionId,
        checksum: item.checksum,
        setCurrent: true,
        metadata: artifactMetadata(item, deck, { action: 'html_export_artifact_version' })
      })
      item.artifactVersionId = version.id
    }
    await this.exportRepository.save(item)
    return {
      artifactId: item.artifactId,
      artifactVersionId: requireId(item.artifactVersionId, 'Artifact version id is required.')
    }
  }

  private async revokeArtifactLinkBestEffort(artifactLinkId?: string | null) {
    if (!artifactLinkId || !this.runtimeCapabilities?.has?.(ArtifactsRuntimeCapability)) return false
    try {
      await this.artifacts().revokeArtifactLink(artifactLinkId)
      return true
    } catch {
      return false
    }
  }

  private async deleteWorkspaceFile(reference?: WorkspacePortableFileReference | null) {
    if (!reference?.filePath) return false
    const files = this.runtimeCapabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!files) return false
    try {
      await files.deleteFile({ ...reference, filePath: reference.filePath })
      return true
    } catch {
      return false
    }
  }

  private async migrateWorkingSchema(scope: PresentationScope, deckId: string) {
    await this.deckRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(PresentationDeck)
      const deck = await repository.findOne({ where: scopedDeckWhere(scope, deckId), lock: { mode: 'pessimistic_write' } })
      if (!deck) throw new NotFoundException('Presentation deck was not found.')
      const doc = decodeYDoc(deck.yjsStateBase64)
      if (!ensurePresentationYDocSchemaV2(doc)) return
      applyMaterializedDeck(deck, materializePresentationYDoc(doc), encodeYDoc(doc))
      await repository.save(deck)
    })
  }

  private async requireDeck(scope: PresentationScope, deckId: string) {
    const deck = await this.deckRepository.findOne({ where: scopedDeckWhere(scope, deckId) })
    if (!deck) throw new NotFoundException('Presentation deck was not found.')
    return deck
  }

  /** Resolve a child export only after its owning Deck passes the current Xpert scope check. */
  private async requireScopedExport(scope: PresentationScope, exportId: string) {
    const item = await this.exportRepository.findOne({ where: scopedExportWhere(scope, { id: exportId }) })
    if (!item) throw new NotFoundException('Presentation export was not found.')
    await this.requireDeck(scope, item.deckId)
    return item
  }

  /** Repair a stale Deck projection before versioning, finalize, or export reads it. */
  private async requireCanonicalDeck(scope: PresentationScope, deckId: string) {
    const current = await this.requireDeck(scope, deckId)
    const collaboration = this.runtimeCapabilities?.get(CollaborationRuntimeCapability)
    if (!collaboration) return current
    const document = await collaboration.ensureDocument({ providerKey: PRESENTATION_COLLABORATION_PROVIDER_KEY, resourceId: deckId, schemaVersion: 2 })
    const state = await collaboration.getDocumentState({ documentId: document.id })
    if (current.revision !== state.sequenceNumber || current.yjsStateVectorBase64 !== state.stateVectorBase64) {
      await this.materializeCollaborationDocument({
        ...scope,
        providerKey: PRESENTATION_COLLABORATION_PROVIDER_KEY,
        resourceId: deckId,
        operation: 'materialize',
        documentId: document.id,
        stateBase64: state.updateBase64,
        stateVectorBase64: state.stateVectorBase64,
        sequenceNumber: state.sequenceNumber,
        origin: 'presentation:canonical-read'
      })
    }
    return this.requireDeck(scope, deckId)
  }

  private async requireVersion(scope: PresentationScope, deckId: string, versionId: string) {
    const version = await this.versionRepository.findOne({ where: scopedVersionIdWhere(scope, deckId, versionId) })
    if (!version) throw new NotFoundException('Presentation version was not found.')
    return version
  }

  private log(scope: PresentationScope, input: {
    deckId?: string; versionId?: string; exportId?: string; action: string; actor: PresentationActionLog['actor']; status?: PresentationActionLog['status'];
    message?: string; summary?: PresentationJsonObject; errorMessage?: string
  }) {
    return this.logRepository.save(this.logRepository.create({
      ...scopeFields(scope), ...input,
      message: sanitizeAuditText(input.message),
      errorMessage: sanitizeAuditText(input.errorMessage),
      summary: input.summary ? sanitizeAuditObject(input.summary) : undefined,
      status: input.status ?? 'succeeded', createdById: optionalText(scope.userId)
    }))
  }

  private async writeWorkbenchAgentContext(scope: PresentationScope, context: PresentationWorkbenchAgentContext) {
    const expiresAt = Date.now() + WORKBENCH_AGENT_CONTEXT_TTL_SECONDS * 1000
    const keys = workbenchAgentContextKeys(scope)
    for (const key of keys) this.workbenchAgentContexts.set(key, { value: context, expiresAt })
    if (!this.queue) return
    const redis = await this.queue.getRedis()
    const value = JSON.stringify(context)
    await Promise.all(keys.map((key) => redis.set(key, value, 'EX', WORKBENCH_AGENT_CONTEXT_TTL_SECONDS)))
  }
}

function workbenchAgentContextKeys(scope: PresentationScope) {
  const base = [
    scope.tenantId ?? '-',
    scope.organizationId ?? '-',
    scope.workspaceId ?? '-',
    scope.projectId ?? '-',
    scope.assistantId ?? scope.agentKey ?? '-',
    scope.userId ?? '-'
  ]
  const withConversation = [...base, scope.conversationId ?? '-'].join(':')
  const withoutConversation = [...base, '-'].join(':')
  return [...new Set([withConversation, withoutConversation])].map((value) => `presentation-studio:agent-context:${createHash('sha256').update(value).digest('hex')}`)
}

function parseWorkbenchAgentContext(value: string): PresentationWorkbenchAgentContext | null {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const input = parsed as Partial<PresentationWorkbenchAgentContext>
    const deckId = optionalText(input.deckId)
    if (!deckId) return null
    return {
      deckId,
      slideId: optionalText(input.slideId) ?? null,
      deckTitle: optionalText(input.deckTitle) ?? null,
      themePack: optionalText(input.themePack) ?? null,
      slideLayout: optionalText(input.slideLayout) ?? null,
      slideLabel: optionalText(input.slideLabel) ?? null,
      activeIndex: typeof input.activeIndex === 'number' && Number.isFinite(input.activeIndex) ? input.activeIndex : null,
      slideCount: typeof input.slideCount === 'number' && Number.isFinite(input.slideCount) ? input.slideCount : null,
      revision: typeof input.revision === 'number' && Number.isFinite(input.revision) ? input.revision : null,
      currentVersionNumber: typeof input.currentVersionNumber === 'number' && Number.isFinite(input.currentVersionNumber) ? input.currentVersionNumber : null,
      assistantDisplayName: optionalText(input.assistantDisplayName) ?? null,
      updatedAt: typeof input.updatedAt === 'number' && Number.isFinite(input.updatedAt) ? input.updatedAt : Date.now()
    }
  } catch {
    return null
  }
}

function collaborationScope(value: CollaborationProviderContext): PresentationScope {
  return {
    tenantId: value.tenantId ?? null,
    organizationId: value.organizationId ?? null,
    workspaceId: value.workspaceId ?? null,
    projectId: value.projectId ?? null,
    xpertId: value.xpertId ?? null,
    assistantId: value.xpertId ?? null,
    userId: value.userId ?? null
  }
}

function presentationPresencePatch(awareness: PresentationAwarenessV2): CollaborationPresencePatch {
  return {
    pageId: awareness.slideId ?? null,
    pointer: awareness.pointer ? { ...awareness.pointer, pageId: awareness.slideId ?? null } : null,
    focus: awareness.focus ? {
      kind: awareness.focus.kind,
      key: awareness.focus.key ?? null,
      pageId: awareness.slideId ?? null,
      elementId: awareness.focus.kind === 'element' ? awareness.focus.key ?? null : null,
      fieldKey: awareness.focus.kind === 'text' || awareness.focus.kind === 'control' ? awareness.focus.key ?? null : null
    } : null,
    selection: awareness.selection ? {
      kind: 'text',
      fieldKey: awareness.selection.textKey,
      anchorRelativeBase64: awareness.selection.anchorRelativeBase64,
      headRelativeBase64: awareness.selection.headRelativeBase64
    } : null,
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

function scopeFields(scope: PresentationScope) {
  const xpertId = scopeXpertId(scope)
  return {
    tenantId: optionalText(scope.tenantId), organizationId: optionalText(scope.organizationId), workspaceId: optionalText(scope.workspaceId),
    projectId: optionalText(scope.projectId), assistantId: xpertId, conversationId: optionalText(scope.conversationId)
  }
}

function scopedDeckWhere(scope: PresentationScope, id?: string): FindOptionsWhere<PresentationDeck> {
  const xpertId = scopeXpertId(scope)
  return { ...(id ? { id } : {}), ...scopeFilter(scope), ...(xpertId ? { assistantId: xpertId } : {}) }
}
function scopedVersionWhere(scope: PresentationScope, deckId: string) { return { deckId, ...scopeFilter(scope) } }
function scopedVersionIdWhere(scope: PresentationScope, deckId: string, id: string) { return { id, deckId, ...scopeFilter(scope) } }
function scopedAssetWhere(scope: PresentationScope, deckId: string) { return { deckId, ...scopeFilter(scope) } }
function scopedExportWhere(scope: PresentationScope, value: { id?: string; deckId?: string }) { return { ...value, ...scopeFilter(scope) } }
function scopeFilter(scope: PresentationScope) {
  return {
    ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
    ...(scope.organizationId ? { organizationId: scope.organizationId } : {}),
    ...(scope.workspaceId ? { workspaceId: scope.workspaceId } : {}),
    ...(scope.projectId ? { projectId: scope.projectId } : {})
  }
}

/** Resolve the current Xpert id while retaining existing assistantId persistence compatibility. */
function scopeXpertId(scope: PresentationScope) {
  return optionalText(scope.xpertId) ?? optionalText(scope.assistantId)
}

function explicitWorkspaceScope(deck: PresentationDeck, scope: PresentationScope) {
  if (deck.projectId) return { tenantId: deck.tenantId, userId: scope.userId, catalog: 'projects' as const, scopeId: deck.projectId, projectId: deck.projectId }
  if (deck.assistantId) return { tenantId: deck.tenantId, userId: scope.userId, catalog: 'xperts' as const, scopeId: deck.assistantId, xpertId: deck.assistantId, isolateByUser: false }
  throw new BadRequestException('Presentation deck has no project or Xpert workspace scope.')
}

function portableReference(
  file: WorkspaceFile,
  scope: ReturnType<typeof explicitWorkspaceScope>,
  originalName: string,
  mimeType: string | undefined,
  size: number
): WorkspacePortableFileReference {
  return {
    source: WORKSPACE_FILES_SOURCE, filePath: file.filePath, workspacePath: file.workspacePath,
    catalog: scope.catalog, scopeId: scope.scopeId, tenantId: scope.tenantId, userId: scope.userId,
    ...('projectId' in scope ? { projectId: scope.projectId } : {}), ...('xpertId' in scope ? { xpertId: scope.xpertId, isolateByUser: false } : {}),
    originalName, name: file.name, mimeType: file.mimeType ?? mimeType, size: file.size ?? size
  }
}

function artifactScope(deck: PresentationDeck, scope: PresentationScope, item?: PresentationExport) {
  return {
    tenantId: deck.tenantId ?? optionalText(scope.tenantId) ?? null,
    organizationId: deck.organizationId ?? optionalText(scope.organizationId) ?? null,
    userId: optionalText(item?.userId) ?? optionalText(scope.userId) ?? null,
    workspaceId: deck.workspaceId ?? optionalText(scope.workspaceId) ?? null,
    projectId: deck.projectId ?? optionalText(scope.projectId) ?? null,
    xpertId: deck.assistantId ?? optionalText(scope.assistantId) ?? null
  }
}

function artifactMetadata(item: PresentationExport, deck: PresentationDeck, extra?: Record<string, unknown>) {
  return {
    deckId: deck.id,
    deckTitle: deck.title,
    exportId: item.id,
    exportKind: item.kind,
    presentationVersionId: item.versionId,
    checksum: item.checksum,
    ...extra
  }
}

function normalizeArtifactLinkVersionMode(value: ArtifactLinkVersionMode | null | undefined): ArtifactLinkVersionMode {
  return value === 'version' ? 'version' : 'latest'
}

function normalizeArtifactAccessMode(value: ArtifactAccessMode | null | undefined): ArtifactAccessMode {
  if (!value) return 'public_link'
  const allowed = new Set<ArtifactAccessMode>(['owner_only', 'workspace_all', 'organization_all', 'public_link'])
  if (allowed.has(value)) return value
  throw new BadRequestException(`Unsupported artifact access mode: ${value}`)
}

function compactDeck(deck: PresentationDeck, message?: string) {
  return {
    ...(message ? { message } : {}), deckId: deck.id, title: deck.title, goal: deck.goal, audience: deck.audience, owner: deck.owner,
    themePack: deck.themePack, status: deck.status, revision: deck.revision, currentVersionId: deck.currentVersionId,
    currentVersionNumber: deck.currentVersionNumber, pageCount: deck.deckSpec?.pageCount ?? 0,
    activeSlides: activeSlides(deck.deckSpec).length, checksum: deck.checksum, updatedAt: deck.updatedAt
  }
}
function compactVersion(version: PresentationDeckVersion) { return { id: version.id, versionNumber: version.versionNumber, source: version.source, checksum: version.checksum, changeSummary: version.changeSummary, createdAt: version.createdAt } }
function compactAsset(asset: PresentationAsset) { return { id: asset.id, role: asset.role, slideId: asset.slideId, fileName: asset.fileName, mimeType: asset.mimeType, size: asset.size, sha256: asset.sha256, reference: `asset://${asset.id}`, createdAt: asset.createdAt } }
function compactExport(item: PresentationExport) {
  const workingRevision = item.versionId.startsWith('working-r') ? Number(item.versionId.slice('working-r'.length)) : undefined
  return { exportId: item.id, deckId: item.deckId, versionId: workingRevision === undefined ? item.versionId : null,
    ...(workingRevision === undefined || !Number.isFinite(workingRevision) ? {} : { workingRevision }), kind: item.kind, status: item.status, jobId: item.jobId, sandboxJobId: item.sandboxJobId,
    progress: item.progress, stage: item.stage, fileName: item.fileName, mimeType: item.mimeType, size: item.size,
    fileRef: item.fileReference?.reference, fileUrl: item.fileReference?.fileUrl, workspacePath: item.fileReference?.workspacePath,
    artifactId: item.artifactId, artifactVersionId: item.artifactVersionId, artifactLinkId: item.artifactLinkId,
    artifactLinkVersionMode: item.artifactLinkVersionMode, artifactLinkAccessMode: item.artifactLinkAccessMode,
    shareUrl: isCurrentArtifactPublicUrl(item.artifactPublicUrl) ? item.artifactPublicUrl : undefined, artifactSharedAt: item.artifactSharedAt,
    report: compactExportReport(item.report), errorMessage: item.errorMessage, createdAt: item.createdAt, updatedAt: item.updatedAt }
}

function isCurrentArtifactPublicUrl(value: string | null | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) return false
  const shortArtifactLinkPath = /(^|\/)artifacts\/share\/[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{12}$/
  try {
    const parsed = new URL(trimmed, 'http://xpert.local')
    return shortArtifactLinkPath.test(parsed.pathname)
  } catch {
    return shortArtifactLinkPath.test(trimmed.split(/[?#]/, 1)[0] ?? '')
  }
}

function compactExportReport(report: PresentationJsonObject | undefined) {
  if (!report) return undefined
  const { [WORKING_EXPORT_SNAPSHOT_KEY]: _workingSnapshot, ...publicReport } = report
  if (!Object.keys(publicReport).length) return undefined
  const warnings = Array.isArray(publicReport.warnings) ? publicReport.warnings : []
  return {
    ...publicReport,
    ...(warnings.length ? {
      warningCount: warnings.length,
      warnings: warnings.slice(0, 12),
      ...(warnings.length > 12 ? { warningsTruncated: true } : {})
    } : {})
  }
}

function serializeWorkingExportVersion(version: PresentationDeckVersion, revision: number): PresentationJsonObject {
  return {
    revision,
    deckId: version.deckId,
    versionNumber: version.versionNumber,
    source: version.source,
    deckSpec: version.deckSpec as unknown as PresentationJsonValue,
    editorState: (version.editorState ?? null) as unknown as PresentationJsonValue,
    yjsStateBase64: version.yjsStateBase64 ?? null,
    yjsStateVectorBase64: version.yjsStateVectorBase64 ?? null,
    yjsUpdateCount: version.yjsUpdateCount,
    checksum: version.checksum,
    rendererVersion: version.rendererVersion,
    upstreamCommit: version.upstreamCommit
  }
}

function deserializeWorkingExportVersion(
  report: PresentationJsonObject | undefined,
  repository: Repository<PresentationDeckVersion>
) {
  const value = report?.[WORKING_EXPORT_SNAPSHOT_KEY]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const deckSpec = value.deckSpec
  const editorState = value.editorState
  if (!deckSpec || typeof deckSpec !== 'object' || Array.isArray(deckSpec) || typeof value.deckId !== 'string' || typeof value.checksum !== 'string') return null
  return repository.create({
    id: `working-r${typeof value.revision === 'number' ? value.revision : 0}`,
    deckId: value.deckId,
    versionNumber: typeof value.versionNumber === 'number' ? value.versionNumber : 0,
    source: 'workbench',
    deckSpec: deckSpec as unknown as PresentationDeckSpec,
    editorState: editorState && typeof editorState === 'object' && !Array.isArray(editorState)
      ? editorState as unknown as PresentationEditorState
      : undefined,
    yjsStateBase64: typeof value.yjsStateBase64 === 'string' ? value.yjsStateBase64 : undefined,
    yjsStateVectorBase64: typeof value.yjsStateVectorBase64 === 'string' ? value.yjsStateVectorBase64 : undefined,
    yjsUpdateCount: typeof value.yjsUpdateCount === 'number' ? value.yjsUpdateCount : 0,
    checksum: value.checksum,
    rendererVersion: typeof value.rendererVersion === 'string' ? value.rendererVersion : '0.1.0',
    upstreamCommit: typeof value.upstreamCommit === 'string' ? value.upstreamCommit : DASHIAI_UPSTREAM_COMMIT
  })
}

function activeSlides(spec: PresentationDeckSpec) { return spec.slides.filter((slide) => slide.status === 'active') }
function requireText(value: string | null | undefined, message: string) { const text = optionalText(value); if (!text) throw new BadRequestException(message); return text }
function optionalText(value: string | null | undefined) { return typeof value === 'string' && value.trim() ? value.trim() : undefined }
function requireId(value: string | undefined, message: string) { if (!value) throw new Error(message); return value }
function requireTheme(value: string): PresentationThemePack { if ((PRESENTATION_THEME_PACKS as readonly string[]).includes(value)) return value as PresentationThemePack; throw new BadRequestException(`Unsupported presentation theme: ${value}`) }
function requireStatus(value: string): PresentationStatus { if ((PRESENTATION_STATUSES as readonly string[]).includes(value)) return value as PresentationStatus; throw new BadRequestException(`Unsupported presentation status: ${value}`) }
function requireExportKind(value: string): PresentationExportKind { if ((PRESENTATION_EXPORT_KINDS as readonly string[]).includes(value)) return value as PresentationExportKind; throw new BadRequestException(`Unsupported presentation export kind: ${value}`) }
function clampPageCount(value: number, max: number) { if (!Number.isFinite(value)) throw new BadRequestException('Presentation pageCount must be a number.'); return Math.min(max, Math.max(3, Math.trunc(value))) }
function checksumJson(value: PresentationJsonValue | PresentationDeckSpec) { return createHash('sha256').update(stableStringify(value)).digest('hex') }
function stableStringify(value: PresentationJsonValue | PresentationDeckSpec): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, PresentationJsonValue>)[key])}`).join(',')}}`
  return JSON.stringify(value)
}
function parseBase64(value: string, label: string) { const buffer = Buffer.from(value, 'base64'); if (!buffer.byteLength) throw new BadRequestException(`${label} must be non-empty base64.`); return buffer }
function normalizeExportName(value: string, kind: PresentationExportKind) { const base = requireText(value, 'Export fileName is required.').replace(/\.(html|pdf|pptx)$/i, '').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '') || 'presentation'; return `${base}.${kind}` }
function exportExecutionPool(kind: PresentationExportKind) { return kind === 'html' ? 'default' as const : 'sandbox-browser' as const }
function isRetryableSandboxError(code: SandboxJobErrorCode) {
  return code === 'SANDBOX_CAPACITY_UNAVAILABLE' || code === 'SANDBOX_START_FAILED' || code === 'BROWSER_LAUNCH_FAILED' || code === 'EXPORT_TIMEOUT' || code === 'EXPORT_OOM'
}
function errorMessage(error: unknown) { return error instanceof Error && error.message ? error.message : 'Presentation operation failed.' }

function mergePresentationObjects(base: PresentationJsonObject, patch: PresentationJsonObject): PresentationJsonObject {
  const merged: PresentationJsonObject = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    const current = merged[key]
    merged[key] = isPresentationObject(current) && isPresentationObject(value)
      ? mergePresentationObjects(current, value)
      : value
  }
  return merged
}

function isPresentationObject(value: PresentationJsonValue | undefined): value is PresentationJsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function validateTextPatch(patch: Record<string, string> | undefined) {
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (!key.startsWith('text:') || key.length > 512) {
      throw new BadRequestException('Presentation textPatch keys must be known Dashi editor IDs beginning with text:.')
    }
    if (/[<>]/.test(value)) {
      throw new BadRequestException('presentation_patch_slide textPatch accepts plain text only; write structured copy under propsPatch.')
    }
  }
}

function validateAssetType(fileName: string, mimeType?: string) {
  const extension = extname(fileName).toLowerCase()
  if (mimeType === 'image/svg+xml' || extension === '.svg') {
    throw new BadRequestException('User-supplied SVG media is not supported by Presentation Studio.')
  }
  const allowedExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.mp4', '.webm', '.mov'])
  const allowedMime = !mimeType
    || mimeType === 'application/octet-stream'
    || /^image\/(?:png|jpeg|webp|gif|avif)$/i.test(mimeType)
    || /^video\/(?:mp4|webm|quicktime)$/i.test(mimeType)
  if (!allowedMime || !allowedExtensions.has(extension)) {
    throw new BadRequestException('Presentation assets must be supported raster images or MP4/WebM/QuickTime videos.')
  }
}

function applyMaterializedDeck(
  deck: PresentationDeck,
  materialized: ReturnType<typeof materializePresentationYDoc>,
  encoded: ReturnType<typeof encodeYDoc>
) {
  deck.deckSpec = materialized.spec
  deck.editorState = materialized.editorState
  deck.title = materialized.spec.title
  deck.goal = materialized.spec.goal
  deck.audience = materialized.spec.audience ?? undefined
  deck.owner = materialized.spec.owner ?? undefined
  deck.themePack = materialized.spec.themePack
  deck.status = materialized.status
  deck.yjsStateBase64 = encoded.stateBase64
  deck.yjsStateVectorBase64 = encoded.stateVectorBase64
}

function sanitizeAuditObject(value: PresentationJsonObject): PresentationJsonObject {
  return sanitizeAuditValue(value, '', 0) as PresentationJsonObject
}

function sanitizeAuditValue(value: PresentationJsonValue, key: string, depth: number): PresentationJsonValue {
  if (/token|session|tenant|organization|authorization|cookie|base64|html|mediaContent/i.test(key)) return '[redacted]'
  if (typeof value === 'string') return sanitizeAuditText(value) ?? ''
  if (Array.isArray(value)) {
    if (depth >= 3) return `[${value.length} items]`
    return value.slice(0, 12).map((item) => sanitizeAuditValue(item, key, depth + 1))
  }
  if (!value || typeof value !== 'object') return value
  if (depth >= 3) return '[object]'
  return Object.fromEntries(
    Object.entries(value).slice(0, 24).map(([itemKey, item]) => [itemKey, sanitizeAuditValue(item, itemKey, depth + 1)])
  )
}

function sanitizeAuditText(value: string | undefined) {
  if (!value) return undefined
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[redacted-jwt]')
    .replace(/data:[^;,\s]+;base64,[A-Za-z0-9+/=]+/gi, '[redacted-data]')
    .slice(0, 2000)
}
