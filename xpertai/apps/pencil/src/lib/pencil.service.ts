import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, join } from 'node:path'
import type { DownloadedFontCache, ExportTarget, ToolDef } from '@open\u002dpencil/core'
import {
  CollaborationRuntimeCapability,
  type AgentMiddlewareRuntimeCapabilityRegistry,
  type CollaborationMaterializationEvent,
  type CollaborationProviderContext
} from '@xpert-ai/plugin-sdk'
import { Raw, type FindOptionsWhere, type Repository } from 'typeorm'
import * as Y from 'yjs'
import { PencilActionLog, PencilDocument, PencilDocumentVersion } from './entities/index.js'
import {
  PENCIL_CORE_TOOL_PREFIX,
  PENCIL_EXCLUDED_CORE_TOOL_NAMES,
  PENCIL_BASE_MIDDLEWARE_TOOL_NAMES,
  PENCIL_SELECTED_CORE_TOOL_NAMES
} from './constants.js'
import {
  checksumGraphSnapshot,
  compactGraphSnapshotForAgent,
  compactNodeForAgent,
  createEmptyPencilGraphSnapshot,
  getNodeFromSnapshot,
  graphFromSnapshot,
  normalizePencilGraphSnapshot,
  PencilGraphSnapshotError,
  repairPencilGraphForDisplay,
  snapshotFromGraph,
  summarizeGraphSnapshot
} from './pencil-graph.js'
import {
  diagnosePencilRenderError,
  isRecoverablePencilRenderError,
  normalizePencilCoreToolArgs,
  normalizePencilRenderJsx
} from './pencil-jsx.js'
import { createPencilDataCaseGraph } from './pencil-sample.js'
import {
  createPencilCollaborationDoc,
  decodePencilCollaborationState,
  encodePencilCollaborationState,
  materializePencilCollaborationDoc,
  PENCIL_COLLABORATION_PROVIDER_KEY,
  PENCIL_COLLABORATION_SCHEMA_VERSION,
  replacePencilCollaborationState
} from './pencil-collaboration.js'
import type {
  CreatePencilSampleDocumentInput,
  CreatePencilDocumentInput,
  ExecutePencilCoreToolInput,
  ExportPencilFileInput,
  ImportPencilBufferInput,
  ImportPencilRuntimeFileInput,
  PatchPencilRenderDraftInput,
  PencilActionType,
  PencilActorType,
  PencilExportFormat,
  PencilGraphSnapshot,
  PencilJsonObject,
  PencilJsonValue,
  PencilPendingRenderDraft,
  PencilPortableExport,
  PencilRenderDraftStatus,
  PencilScope,
  PencilVersionSource,
  PencilWorkspaceFilesApi,
  GetPencilDocumentInput,
  GetPencilNodeInput,
  RenamePencilDocumentInput,
  ReportPencilFailureInput,
  SavePencilVersionInput,
  SavePencilWorkingCopyInput,
  SearchPencilDocumentsInput,
  UpdatePencilDocumentStatusInput
} from './types.js'

type ScopedEntity = {
  tenantId?: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
}
type PencilCoreModule = typeof import('@open\u002dpencil/core')
type PencilCoreIoModule = typeof import('@open\u002dpencil/core/io')
type PencilCoreToolsModule = typeof import('@open\u002dpencil/core/tools')
type PencilSceneGraph = Awaited<ReturnType<typeof graphFromSnapshot>>
type PencilExportResult = {
  format: string
  mimeType: string
  extension: string
  data: string | Uint8Array
  encoding?: string
}
type ResolvedExportNodes = {
  pageId: string
  nodeIds: string[]
}

const PENCIL_IMPORT_EXTENSIONS = new Set(['fig', 'pen'])
const XPERT_RUNTIME_CAPABILITIES_TOKEN = 'XPERT_RUNTIME_CAPABILITIES'
const PENCIL_EXPORT_FORMATS = new Set<PencilExportFormat>(['fig', 'png', 'jpg', 'webp', 'svg', 'pdf', 'jsx'])
const PENCIL_RUNTIME_EXPORTS_FOLDER = 'files/pencil/exports'
const PENCIL_RENDER_DRAFT_TTL_MS = 24 * 60 * 60 * 1000
const SERVER_CJK_FONT_ALIAS_PREFIX = 'Pencil CJK'
const SERVER_CJK_FONT_STYLE = 'Regular'
const SERVER_BUNDLED_FONT_FILES = new Map<string, string>([
  ['Inter|Regular', 'Inter-Regular.ttf'],
  ['Inter|Medium', 'Inter-Medium.ttf'],
  ['Inter|SemiBold', 'Inter-SemiBold.ttf'],
  ['Inter|Semi Bold', 'Inter-SemiBold.ttf'],
  ['Inter|Bold', 'Inter-Bold.ttf'],
  ['Inter|ExtraBold', 'Inter-ExtraBold.ttf'],
  ['Inter|Extra Bold', 'Inter-ExtraBold.ttf'],
  ['Noto Naskh Arabic|Regular', 'NotoNaskhArabic-Regular.ttf']
])
const packageRequire = createRequire(import.meta.url)
let pencilCoreModulePromise: Promise<PencilCoreModule> | null = null
let pencilCoreIoModulePromise: Promise<PencilCoreIoModule> | null = null
let pencilCoreToolsModulePromise: Promise<PencilCoreToolsModule> | null = null
let pencilCoreToolsByNamePromise: Promise<Map<string, ToolDef>> | null = null
let serverPencilFontsPromise: Promise<void> | null = null
let serverPencilCoreAssetsRootPromise: Promise<string> | null = null
const serverBundledFontData = new Map<string, ArrayBuffer>()

/** Owns scoped persistence, graph conversion, versioning, file I/O, and core tool execution. */
@Injectable()
export class PencilService {
  constructor(
    @InjectRepository(PencilDocument)
    private readonly documentRepository: Repository<PencilDocument>,
    @InjectRepository(PencilDocumentVersion)
    private readonly versionRepository: Repository<PencilDocumentVersion>,
    @InjectRepository(PencilActionLog)
    private readonly logRepository: Repository<PencilActionLog>,
    @Optional() @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: AgentMiddlewareRuntimeCapabilityRegistry
  ) {}

  async getCoreToolDefinitions() {
    return Array.from((await getAllowedCoreToolMap()).values())
  }

  /** Authorize platform collaboration operations with the same scoped lookup as every Pencil action. */
  async authorizeCollaborationDocument(context: CollaborationProviderContext) {
    const scope = pencilScopeFromCollaboration(context)
    const document = await this.documentRepository.findOne({ where: scopedDocumentWhere(scope, { id: context.resourceId }) })
    return Boolean(document)
  }

  /** Lazily import the legacy mutable working copy without creating an immutable Pencil version. */
  async initializeCollaborationDocument(context: CollaborationProviderContext) {
    const scope = pencilScopeFromCollaboration(context)
    const document = await this.requireDocument(scope, context.resourceId)
    const current = await this.getLegacyCurrentGraphState(scope, document)
    const doc = createPencilCollaborationDoc(current.graphSnapshot, collaborativeDocumentMetadata(document))
    return {
      stateBase64: encodePencilCollaborationState(doc),
      schemaVersion: PENCIL_COLLABORATION_SCHEMA_VERSION,
      initialSequence: currentWorkingCopyRevision(document),
      metadata: { kind: 'pencil_document' }
    }
  }

  /** Project the platform-owned Yjs state into the query/export business aggregate. */
  async materializeCollaborationDocument(event: CollaborationMaterializationEvent) {
    const scope = pencilScopeFromCollaboration(event)
    const materialized = materializePencilCollaborationDoc(decodePencilCollaborationState(event.stateBase64))
    await this.documentRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(PencilDocument)
      const document = await repository.findOne({
        where: scopedDocumentWhere(scope, { id: event.resourceId }),
        lock: { mode: 'pessimistic_write' }
      })
      if (!document) throw new NotFoundException('Pencil document was not found during collaboration materialization.')
      const now = new Date()
      document.title = materialized.document.title
      document.description = materialized.document.description ?? undefined
      document.kind = materialized.document.kind
      document.status = materialized.document.status
      document.tags = materialized.document.tags
      document.workingGraph = normalizeSnapshotInput(materialized.graphSnapshot)
      document.workingCopyRevision = event.sequenceNumber
      document.graphChecksum = checksumGraphSnapshot(materialized.graphSnapshot) ?? undefined
      document.workingUpdatedAt = now
      document.lastEditedById = scope.userId ?? scope.assistantId ?? null
      document.lastEditedAt = now
      await repository.save(document)
    })
  }

  /** Issue a backend-derived, single-document browser collaboration session. */
  async createCollaborationSession(scope: PencilScope, documentId: string) {
    const collaboration = this.collaboration()
    const document = await collaboration.ensureDocument({
      providerKey: PENCIL_COLLABORATION_PROVIDER_KEY,
      resourceId: documentId,
      schemaVersion: PENCIL_COLLABORATION_SCHEMA_VERSION
    })
    const session = await collaboration.createSession({ documentId: document.id, access: 'write' })
    return { ...session, pencilDocumentId: documentId }
  }

  /** Represent a backend Agent tool execution in the same ephemeral presence list as users. */
  async upsertAgentPresence(
    scope: PencilScope,
    input: {
      documentId: string
      toolName: string
      status: 'thinking' | 'editing' | 'done' | 'failed'
      operationLabel?: string | null
      pageId?: string | null
      elementId?: string | null
    }
  ) {
    const collaboration = this.collaboration()
    const document = await collaboration.ensureDocument({
      providerKey: PENCIL_COLLABORATION_PROVIDER_KEY,
      resourceId: input.documentId,
      schemaVersion: PENCIL_COLLABORATION_SCHEMA_VERSION
    })
    const actorKey = pencilAgentPresenceKey(scope, input.documentId)
    return collaboration.upsertVirtualPresence({
      documentId: document.id,
      actor: {
        actorType: 'agent',
        actorKey,
        displayName: scope.assistantDisplayName ?? scope.agentKey ?? 'Pencil Agent'
      },
      presence: {
        pageId: input.pageId ?? null,
        focus: input.elementId
          ? { kind: 'element', key: input.elementId, elementId: input.elementId, pageId: input.pageId ?? null }
          : input.pageId
            ? { kind: 'page', key: input.pageId, pageId: input.pageId }
            : null,
        status: input.status,
        toolName: input.toolName,
        operationLabel: input.operationLabel ?? null,
        mode: 'edit'
      }
    })
  }

  async createDocument(scope: PencilScope, input: CreatePencilDocumentInput) {
    const title = normalizeRequired(input.title, 'Pencil document title is required.')
    const graphSnapshot = normalizeSnapshotInput(input.graphSnapshot ?? createEmptyPencilGraphSnapshot())
    const checksum = checksumGraphSnapshot(graphSnapshot)
    const now = new Date()
    const document = await this.documentRepository.save(
      this.documentRepository.create({
        ...scopedCreate(scope),
        assistantId: scopeXpertId(scope) ?? null,
        conversationId: scope.conversationId ?? null,
        title,
        description: normalizeOptional(input.description),
        kind: input.kind ?? 'design',
        status: 'draft',
        tags: normalizeStringArray(input.tags),
        source: normalizeOptional(input.source),
        sourceFormat: normalizeOptional(input.sourceFormat),
        currentVersionNumber: 0,
        workingGraph: graphSnapshot,
        workingViewState: normalizeObject(input.viewState),
        workingSelectionSummary: normalizeObject(input.selectionSummary),
        workingUpdatedAt: now,
        workingCopyRevision: 1,
        graphChecksum: checksum ?? undefined,
        lastEditedById: scope.userId ?? scope.assistantId ?? null,
        lastEditedAt: now
      })
    )

    await this.writeLog(scope, {
      documentId: document.id,
      action: 'document_created',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: input.changeSummary ?? `Pencil document "${title}" was created.`,
      snapshot: {
        title,
        kind: document.kind,
        source: document.source,
        sourceFormat: document.sourceFormat,
        summary: summarizeGraphSnapshot(graphSnapshot)
      }
    })

    return this.getDocument(scope, { documentId: document.id as string, includeSnapshot: true })
  }

  async createSampleDocument(scope: PencilScope, input: CreatePencilSampleDocumentInput = {}) {
    const { SceneGraph, computeAllLayouts } = await loadPencilCore()
    const sample = createPencilDataCaseGraph({ SceneGraph, computeAllLayouts })
    const title = normalizeOptional(input.title) ?? 'Revenue Intelligence Dashboard'
    const description =
      normalizeOptional(input.description) ??
      'A realistic revenue operations dashboard sample with nested auto-layout, grid layout, wrapping cards, tables, charts, and absolute annotations.'
    const tags = uniqueStrings(['sample', 'dashboard', 'auto-layout', 'revenue-ops', ...(input.tags ?? [])])
    const created = await this.createDocument(scope, {
      title,
      description,
      kind: 'prototype',
      tags,
      source: 'sample',
      sourceFormat: 'pencil.scene-graph.v1',
      graphSnapshot: sample.graphSnapshot,
      viewState: sample.viewState,
      selectionSummary: sample.selectionSummary,
      changeSummary: normalizeOptional(input.changeSummary) ?? 'Created a Pencil sample data case.'
    })
    const saved = await this.saveVersion(scope, {
      documentId: created.item.id as string,
      graphSnapshot: sample.graphSnapshot,
      viewState: sample.viewState,
      selectionSummary: sample.selectionSummary,
      sourceType: 'sample',
      changeSummary: 'Initial sample data case version'
    })

    await this.writeLog(scope, {
      documentId: created.item.id,
      versionId: saved.version.id,
      action: 'sample_document_created',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: normalizeOptional(input.changeSummary) ?? 'Pencil sample data case was created.',
      snapshot: {
        title,
        tags,
        summary: summarizeGraphSnapshot(sample.graphSnapshot),
        selection: sample.selectionSummary
      }
    })

    return this.getDocument(scope, {
      documentId: created.item.id as string,
      includeSnapshot: true,
      includeLogs: true,
      versionLimit: 30,
      logLimit: 20
    })
  }

  /** Updates document metadata without advancing the graph working-copy revision. */
  async renameDocument(scope: PencilScope, input: RenamePencilDocumentInput) {
    const document = await this.requireDocument(scope, input.documentId)
    const title = normalizeRequired(input.title, 'Pencil document title is required.')
    const previousTitle = document.title
    if (title === previousTitle) {
      return {
        success: true,
        message: 'Pencil document title is unchanged.',
        document: compactDocument(document)
      }
    }

    const current = await this.getCurrentGraphState(scope, document)
    const collaborative = await this.applyCollaborativeState(scope, document, {
      graphSnapshot: current.graphSnapshot,
      expectedSequence: 'sequenceNumber' in current ? current.sequenceNumber : undefined,
      metadata: { title },
      origin: scope.assistantId ? 'pencil:agent:rename' : 'pencil:user:rename'
    })
    document.title = title
    if (collaborative) document.workingCopyRevision = collaborative.sequenceNumber
    document.lastEditedById = scope.userId ?? scope.assistantId ?? null
    document.lastEditedAt = new Date()
    const savedDocument = collaborative ? document : await this.documentRepository.save(document)
    await this.writeLog(scope, {
      documentId: document.id,
      versionId: document.currentVersionId,
      action: 'document_renamed',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: `Renamed Pencil document to "${title}".`,
      snapshot: { previousTitle, title }
    })

    return {
      success: true,
      message: 'Pencil document title was updated.',
      document: compactDocument(savedDocument)
    }
  }

  async searchDocuments(scope: PencilScope, query: SearchPencilDocumentsInput = {}) {
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.max(1, Math.min(query.pageSize ?? 20, 100))
    const search = query.search?.trim().toLowerCase() ?? ''
    const documents = await this.documentRepository.find({
      where: scopedDocumentWhere(scope),
      order: {
        updatedAt: 'DESC'
      }
    })
    const filtered = documents.filter((document) => {
      if (query.status && document.status !== query.status) {
        return false
      }
      if (query.kind && document.kind !== query.kind) {
        return false
      }
      if (!search) {
        return true
      }
      return [document.title, document.description, document.kind, document.sourceFormat, ...(document.tags ?? [])]
        .filter(isString)
        .some((value) => value.toLowerCase().includes(search))
    })
    const start = (page - 1) * pageSize
    return {
      items: filtered.slice(start, start + pageSize).map(compactDocument),
      total: filtered.length,
      page,
      pageSize,
      search
    }
  }

  async getDocument(scope: PencilScope, input: GetPencilDocumentInput) {
    const document = await this.requireDocument(scope, input.documentId)
    const versionLimit = Math.max(1, Math.min(input.versionLimit ?? 20, 100))
    const logLimit = Math.max(1, Math.min(input.logLimit ?? 10, 50))
    const logWhere = scopedWhere(scope, { documentId: document.id }) as object as FindOptionsWhere<PencilActionLog>
    const [versions, logs] = await Promise.all([
      this.versionRepository.find({
        where: scopedVersionWhere(scope, { documentId: document.id }),
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
    const currentState = await this.getCurrentGraphState(scope, document)
    const effectiveSnapshot = explicitVersion ? requestedVersion?.graphSnapshot ?? null : currentState.graphSnapshot
    const graphSource = explicitVersion ? 'version' : currentState.source

    return {
      item: document,
      currentVersion: formatVersionForResponse(currentVersion, Boolean(input.includeSnapshot)),
      requestedVersion:
        requestedVersion && requestedVersion.id !== currentVersion?.id ? formatVersionForResponse(requestedVersion, Boolean(input.includeSnapshot)) : null,
      workingCopy: formatWorkingCopy(document, Boolean(input.includeSnapshot)),
      workingCopyRevision: currentWorkingCopyRevision(document),
      graphChecksum: document.graphChecksum ?? checksumGraphSnapshot(effectiveSnapshot ?? undefined),
      versions: versions.map((version) => compactVersion(version)),
      logs,
      snapshotSummary: summarizeGraphSnapshot(effectiveSnapshot),
      graphSnapshot: input.includeSnapshot ? effectiveSnapshot : undefined,
      graph: input.includeSnapshot ? effectiveSnapshot : compactGraphSnapshotForAgent(effectiveSnapshot),
      graphSource,
      nextActions: [
        'Use the Pencil Workbench for manual review and version save.',
        'Use pencil_get_node before targeted node changes.',
        'Use pencil_export_file for workspace export references.'
      ]
    }
  }

  async getNode(scope: PencilScope, input: GetPencilNodeInput) {
    const payload = await this.getDocument(scope, {
      documentId: input.documentId,
      versionId: input.versionId,
      versionNumber: input.versionNumber,
      includeSnapshot: true
    })
    const graphSnapshot = payload.graphSnapshot
    if (!graphSnapshot) {
      throw new NotFoundException('Pencil graph snapshot was not found.')
    }
    const node = getNodeFromSnapshot(graphSnapshot, input.nodeId)
    if (!node) {
      throw new NotFoundException('Pencil node was not found.')
    }
    return {
      document: payload.item,
      version: payload.requestedVersion ?? payload.currentVersion,
      graphSource: payload.graphSource,
      node: compactNodeForAgent(node)
    }
  }

  async saveWorkingCopy(scope: PencilScope, input: SavePencilWorkingCopyInput) {
    const document = await this.requireDocument(scope, input.documentId)
    if (!this.optionalCollaboration()) this.assertWorkingCopyBase(document, input)
    const graphSnapshot = normalizeSnapshotInput(input.graphSnapshot)
    const savedDocument = await this.persistWorkingCopy(scope, document, {
      graphSnapshot,
      viewState: normalizeObject(input.viewState),
      selectionSummary: normalizeObject(input.selectionSummary),
      expectedSequence: input.baseRevision
    })

    await this.writeLog(scope, {
      documentId: document.id,
      versionId: document.currentVersionId,
      action: 'working_copy_saved',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: input.changeSummary,
      snapshot: summarizeGraphSnapshot(graphSnapshot)
    })

    return {
      success: true,
      message: 'Pencil working copy was saved.',
      document: compactDocument(savedDocument),
      workingCopy: compactWorkingCopy(savedDocument, graphSnapshot),
      snapshotSummary: summarizeGraphSnapshot(graphSnapshot)
    }
  }

  async saveVersion(scope: PencilScope, input: SavePencilVersionInput) {
    const document = await this.requireDocument(scope, input.documentId)
    const currentState = await this.getCurrentGraphState(scope, document)
    const graphSnapshot = normalizeSnapshotInput(input.graphSnapshot ?? currentState.graphSnapshot)
    if (input.graphSnapshot && this.optionalCollaboration()) {
      const applied = await this.applyCollaborativeState(scope, document, {
        graphSnapshot,
        expectedSequence: 'sequenceNumber' in currentState ? currentState.sequenceNumber : undefined,
        origin: scope.assistantId ? 'pencil:agent:version-input' : 'pencil:user:version-input'
      })
      if (applied) document.workingCopyRevision = applied.sequenceNumber
    }
    const version = await this.createVersion(scope, document, {
      sourceType: input.sourceType ?? (scope.assistantId ? 'agent_snapshot' : 'workbench'),
      graphSnapshot,
      viewState: normalizeObject(input.viewState ?? currentState.viewState),
      selectionSummary: normalizeObject(input.selectionSummary ?? currentState.selectionSummary),
      changeSummary: normalizeOptional(input.changeSummary) ?? 'Pencil version saved'
    })

    await this.writeLog(scope, {
      documentId: document.id,
      versionId: version.id,
      action: 'version_saved',
      actorType: version.sourceType === 'workbench' ? 'user' : scope.assistantId ? 'agent' : 'user',
      message: input.changeSummary,
      snapshot: summarizeGraphSnapshot(version.graphSnapshot)
    })

    return {
      success: true,
      message: 'Pencil version was saved.',
      document: compactDocument(document),
      version: compactVersion(version),
      snapshotSummary: summarizeGraphSnapshot(graphSnapshot)
    }
  }

  async importRuntimeFile(scope: PencilScope, input: ImportPencilRuntimeFileInput, workspaceFiles: PencilWorkspaceFilesApi) {
    const file = await workspaceFiles.readRuntimeBuffer(input.file)
    return this.importBuffer(scope, {
      title: input.title,
      description: input.description,
      kind: input.kind,
      tags: input.tags,
      fileName: file.reference.originalName ?? file.name,
      mimeType: file.mimeType,
      buffer: file.buffer,
      source: input.source ?? 'agent_runtime_file'
    })
  }

  async importBuffer(scope: PencilScope, input: ImportPencilBufferInput) {
    const fileName = normalizeOptional(input.fileName) ?? 'pencil-import.fig'
    const format = inferImportFormat(fileName, input.mimeType)
    let graphSnapshot: PencilGraphSnapshot
    try {
      const { parseFigFile, parsePenFile } = await loadPencilCore()
      if (format === 'fig') {
        const graph = await parseFigFile(toArrayBuffer(input.buffer), { populate: 'all' })
        await tryComputeLayouts(graph)
        graphSnapshot = snapshotFromGraph(graph)
      } else {
        const graph = parsePenFile(input.buffer.toString('utf8'))
        await tryComputeLayouts(graph)
        graphSnapshot = snapshotFromGraph(graph)
      }
    } catch (error) {
      throw new BadRequestException(`Failed to import Pencil ${format} file: ${getErrorMessage(error)}`)
    }

    const created = await this.createDocument(scope, {
      title: normalizeOptional(input.title) ?? removeKnownExtension(fileName) ?? 'Imported Pencil Design',
      description: input.description,
      kind: input.kind ?? (format === 'fig' ? 'figma-import' : 'design'),
      tags: input.tags,
      source: input.source ?? 'import',
      sourceFormat: format,
      graphSnapshot,
      changeSummary: `Imported ${fileName}`
    })
    const saved = await this.saveVersion(scope, {
      documentId: created.item.id,
      graphSnapshot,
      sourceType: 'import',
      changeSummary: `Imported ${fileName}`
    })

    await this.writeLog(scope, {
      documentId: created.item.id,
      versionId: saved.version.id,
      action: 'file_imported',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: `Imported ${fileName}`,
      snapshot: {
        fileName,
        format,
        mimeType: input.mimeType,
        summary: summarizeGraphSnapshot(graphSnapshot)
      }
    })

    return this.getDocument(scope, { documentId: created.item.id, includeSnapshot: true, includeLogs: true })
  }

  async exportDocument(scope: PencilScope, input: ExportPencilFileInput, workspaceFiles?: PencilWorkspaceFilesApi): Promise<PencilPortableExport> {
    const format = normalizeExportFormat(input.format)
    const document = await this.requireDocument(scope, input.documentId)
    const currentState = await this.getCurrentGraphState(scope, document)
    const graph = await graphFromSnapshot(currentState.graphSnapshot)
    normalizeGraphForExport(graph, format)
    if (requiresServerFontPreparation(format)) {
      await prepareServerPencilFonts()
    }
    const { BUILTIN_IO_FORMATS, IORegistry } = await loadPencilCore()
    const registry = new IORegistry(BUILTIN_IO_FORMATS)
    const target = normalizeExportTarget(graph, format, input.target)
    const options = buildExportOptions(format, input)
    const result: PencilExportResult =
      format === 'pdf'
        ? await renderRasterPdfExport(graph, target, input)
        : format === 'fig' && target.scope === 'document'
          ? await registry.writeDocument('fig', graph, options)
          : await registry.exportContent(format, { graph, target, fileName: input.fileName ?? undefined }, options)
    const buffer = exportResultToBuffer(result.data)
    const fileName = sanitizeFileName(input.fileName ?? `${sanitizeFileNamePart(document.title)}.${result.extension}`, result.extension)
    const sha256 = checksumBuffer(buffer)
    const base: PencilPortableExport = {
      format,
      mimeType: result.mimeType,
      extension: result.extension,
      encoding: result.encoding,
      size: buffer.byteLength,
      sha256
    }

    // Agent exports use workspace storage so tool responses never contain large base64 payloads.
    if (workspaceFiles && input.writeToWorkspace !== false) {
      const file = await workspaceFiles.writeRuntimeBuffer({
        buffer,
        originalName: fileName,
        fileName,
        folder: `${PENCIL_RUNTIME_EXPORTS_FOLDER}/${normalizePathSegment(document.id as string)}`,
        mimeType: result.mimeType,
        size: buffer.byteLength,
        metadata: {
          documentType: 'pencil-export',
          documentId: document.id,
          title: document.title,
          format,
          target,
          sourceVersionId: document.currentVersionId,
          sha256
        }
      })
      await this.writeLog(scope, {
        documentId: document.id,
        versionId: document.currentVersionId,
        action: 'file_exported',
        actorType: scope.assistantId ? 'agent' : 'user',
        message: `Exported ${format}`,
        snapshot: {
          format,
          target,
          path: file.filePath,
          workspacePath: file.workspacePath,
          sha256,
          size: buffer.byteLength
        }
      })
      return {
        ...base,
        file,
        fileRef: file.reference,
        path: file.filePath,
        workspacePath: file.workspacePath
      }
    }

    return {
      ...base,
      inline: result.encoding === 'utf8' ? buffer.toString('utf8') : buffer.toString('base64')
    }
  }

  async updateDocumentStatus(scope: PencilScope, input: UpdatePencilDocumentStatusInput) {
    const document = await this.requireDocument(scope, input.documentId)
    const current = await this.getCurrentGraphState(scope, document)
    const collaborative = await this.applyCollaborativeState(scope, document, {
      graphSnapshot: current.graphSnapshot,
      expectedSequence: 'sequenceNumber' in current ? current.sequenceNumber : undefined,
      metadata: { status: input.status },
      origin: scope.assistantId ? 'pencil:agent:status' : 'pencil:user:status'
    })
    document.status = input.status
    if (collaborative) document.workingCopyRevision = collaborative.sequenceNumber
    document.lastEditedById = scope.userId ?? scope.assistantId ?? null
    document.lastEditedAt = new Date()
    if (!collaborative) await this.documentRepository.save(document)
    await this.writeLog(scope, {
      documentId: document.id,
      action: input.status === 'archived' ? 'status_updated' : 'status_updated',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: input.reason,
      snapshot: { status: input.status }
    })
    return {
      success: true,
      message: `Pencil status updated to ${input.status}.`,
      document: compactDocument(document)
    }
  }

  /** Permanently removes the complete scoped document aggregate, including immutable history and audit rows. */
  async deleteDocument(scope: PencilScope, documentId: string) {
    const document = await this.requireDocument(scope, documentId)
    const scopedDocumentId = document.id as string

    const collaboration = this.optionalCollaboration()
    if (collaboration) {
      try {
        await collaboration.deleteDocument({ providerKey: PENCIL_COLLABORATION_PROVIDER_KEY, resourceId: scopedDocumentId })
      } catch (error) {
        if (!(error instanceof Error) || !/not found/i.test(error.message)) throw error
      }
    }

    // Child rows are deleted first so a failed child cleanup never leaves orphan history after the parent is gone.
    const versionResult = await this.versionRepository.delete(scopedVersionWhere(scope, { documentId: scopedDocumentId }))
    const logResult = await this.logRepository.delete(scopedWhere(scope, { documentId: scopedDocumentId }))
    const documentResult = await this.documentRepository.delete(scopedDocumentWhere(scope, { id: scopedDocumentId }))
    if ((documentResult.affected ?? 0) !== 1) {
      throw new NotFoundException('Pencil document was not found.')
    }

    return {
      success: true,
      message: 'Pencil document was permanently deleted.',
      deletedDocumentId: scopedDocumentId,
      deletedTitle: document.title,
      deletedVersionCount: versionResult.affected ?? 0,
      deletedActionLogCount: logResult.affected ?? 0
    }
  }

  async restoreVersion(scope: PencilScope, documentId: string, versionId: string, changeSummary?: string | null) {
    const document = await this.requireDocument(scope, documentId)
    const current = await this.getCurrentGraphState(scope, document)
    const version = await this.versionRepository.findOne({
      where: scopedVersionWhere(scope, { documentId: document.id, id: versionId })
    })
    if (!version?.graphSnapshot) {
      throw new NotFoundException('Pencil version was not found.')
    }
    const graphSnapshot = normalizeSnapshotInput(version.graphSnapshot)
    const restoredDocument = await this.persistWorkingCopy(scope, document, {
      graphSnapshot,
      viewState: normalizeObject(version.viewState),
      selectionSummary: normalizeObject(version.selectionSummary),
      expectedSequence: 'sequenceNumber' in current ? current.sequenceNumber : undefined
    })
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
      message: 'Pencil version was restored to the working copy.',
      document: compactDocument(restoredDocument),
      restoredVersion: compactVersion(version),
      workingCopy: compactWorkingCopy(restoredDocument, graphSnapshot)
    }
  }

  async deleteVersion(scope: PencilScope, documentId: string, versionId: string) {
    const document = await this.requireDocument(scope, documentId)
    const version = await this.versionRepository.findOne({
      where: scopedVersionWhere(scope, { documentId: document.id, id: versionId })
    })
    if (!version) {
      throw new NotFoundException('Pencil version was not found.')
    }
    await this.versionRepository.delete(scopedVersionWhere(scope, { documentId: document.id, id: version.id }))
    const remaining = await this.versionRepository.find({
      where: scopedVersionWhere(scope, { documentId: document.id }),
      order: {
        versionNumber: 'DESC'
      }
    })
    const nextCurrent = remaining[0] ?? null
    if (document.currentVersionId === version.id) {
      document.currentVersionId = nextCurrent?.id ?? null
      document.currentVersionNumber = nextCurrent?.versionNumber ?? 0
    }
    if (document.workingBaseVersionId === version.id) {
      document.workingBaseVersionId = nextCurrent?.id ?? null
    }
    document.lastEditedById = scope.userId ?? scope.assistantId ?? null
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
      message: 'Pencil version was deleted.',
      document: compactDocument(document),
      deletedVersionId: version.id,
      currentVersionId: document.currentVersionId ?? null,
      currentVersionNumber: document.currentVersionNumber ?? 0
    }
  }

  async reportFailure(scope: PencilScope, input: ReportPencilFailureInput) {
    await this.writeLog(scope, {
      documentId: normalizeOptional(input.documentId),
      versionId: normalizeOptional(input.versionId),
      action: 'failure_reported',
      actorType: 'agent',
      message: normalizeRequired(input.operation, 'Pencil failure operation is required.'),
      errorMessage: normalizeRequired(input.errorMessage, 'Pencil failure errorMessage is required.'),
      snapshot: {
        operation: input.operation,
        recoverable: input.recoverable ?? true,
        evidence: input.evidence
      }
    })
    return {
      success: true,
      message: 'Pencil failure was recorded.'
    }
  }

  /** Applies small exact-match edits to a retained JSX draft and commits only after isolated rendering succeeds. */
  async patchRenderDraft(scope: PencilScope, input: PatchPencilRenderDraftInput) {
    const document = await this.requireDocument(scope, input.documentId)
    const draft = await this.requirePendingRenderDraft(scope, document, input.draftId)
    if (pendingRenderDraftExpiresAt(draft) <= Date.now()) {
      await this.clearPendingRenderDraft(scope, document.id as string, draft)
      throw new BadRequestException('Pencil render draft expired. Render the affected section again.')
    }
    if (draft.status !== 'active') {
      throw new ConflictException(`Pencil render draft is ${draft.status} and cannot be patched.`)
    }
    if (draft.revision !== input.expectedRevision) {
      throw new ConflictException(
        `Pencil render draft changed; expected revision ${input.expectedRevision}, current revision is ${draft.revision}.`
      )
    }

    const sourceJsx = applyRenderDraftEdits(draft.sourceJsx, input.edits)
    const normalizedJsx = normalizePencilRenderJsx(sourceJsx)
    const nextRevision = draft.revision + 1
    const validatingDraft: PencilPendingRenderDraft = {
      ...draft,
      sourceJsx,
      normalizedJsx,
      sourceChecksum: checksumText(sourceJsx),
      revision: nextRevision,
      status: 'validating',
      diagnostic: null,
      changeSummary: normalizeOptional(input.changeSummary) ?? draft.changeSummary
    }
    const claim = await this.documentRepository.update(
      pendingRenderDraftWhere(scope, document.id as string, draft.id, input.expectedRevision, 'active'),
      pendingRenderDraftUpdate(validatingDraft)
    )
    if ((claim.affected ?? 0) !== 1) {
      throw new ConflictException('Pencil render draft was modified by another request. Reload its latest diagnostic before retrying.')
    }

    const renderTool = (await getAllowedCoreToolMap()).get('render')
    if (!renderTool) {
      throw new BadRequestException('Pencil render tool is not available in this plugin.')
    }
    const currentState = await this.getCurrentGraphState(scope, document)
    const graph = await graphFromSnapshot(currentState.graphSnapshot)
    const { FigmaAPI } = await loadPencilCore()
    const figma = new FigmaAPI(graph)
    const toolArgs = { ...validatingDraft.renderArgs, jsx: normalizedJsx }
    let result: unknown
    try {
      result = await renderTool.execute(figma, toolArgs)
    } catch (error) {
      const diagnostic = diagnosePencilRenderError(error, normalizedJsx)
      const activeDraft: PencilPendingRenderDraft = { ...validatingDraft, status: 'active', diagnostic }
      const restore = await this.documentRepository.update(
        pendingRenderDraftWhere(scope, document.id as string, draft.id, nextRevision, 'validating'),
        pendingRenderDraftUpdate(activeDraft)
      )
      await this.writeLog(scope, {
        documentId: document.id,
        versionId: document.currentVersionId,
        action: 'render_draft_patched',
        actorType: 'agent',
        message: 'Pencil render draft still requires repair.',
        errorMessage: diagnostic.message,
        snapshot: compactRenderDraft(document.id as string, activeDraft)
      })
      // Infrastructure and graph-runtime failures cannot be corrected by changing retained JSX.
      if (!isRecoverablePencilRenderError(error)) {
        throw error
      }
      if ((restore.affected ?? 0) !== 1) {
        throw new ConflictException('Pencil render draft changed while its repair was being validated. Reload before retrying.')
      }
      return renderDraftFailureResult(document.id as string, activeDraft, diagnostic)
    }

    const mutation = await this.persistCoreToolMutation(scope, {
      document,
      graph,
      viewState: currentState.viewState,
      selectionSummary: currentState.selectionSummary,
      toolName: 'render',
      toolArgs,
      result,
      changeSummary: normalizeOptional(input.changeSummary) ?? validatingDraft.changeSummary,
      renderDraftId: draft.id,
      expectedSequence: 'sequenceNumber' in currentState ? currentState.sequenceNumber : undefined
    })
    await this.clearPendingRenderDraft(scope, document.id as string, validatingDraft)
    return {
      ...mutation,
      recoverable: false,
      renderDraftId: draft.id,
      renderDraftRevision: validatingDraft.revision,
      renderDraftStatus: 'committed' as const
    }
  }

  async executeCoreTool(scope: PencilScope, input: ExecutePencilCoreToolInput) {
    const normalizedToolName = normalizeCoreToolName(input.toolName)
    const toolDef = (await getAllowedCoreToolMap()).get(normalizedToolName)
    if (!toolDef) {
      throw new BadRequestException(`Pencil core tool "${input.toolName}" is not available in this plugin.`)
    }
    const document = await this.requireDocument(scope, input.documentId)
    const currentState = await this.getCurrentGraphState(scope, document)
    const graph = await graphFromSnapshot(currentState.graphSnapshot)
    const { FigmaAPI } = await loadPencilCore()
    const figma = new FigmaAPI(graph)
    const toolArgs = normalizePencilCoreToolArgs(normalizedToolName, input.args)
    let result: unknown
    try {
      result = await toolDef.execute(figma, toolArgs)
      // Read-only tools return immediately; mutating tools become a new optimistic working-copy revision.
      if (toolDef.mutates) {
        return this.persistCoreToolMutation(scope, {
          document,
          graph,
          viewState: currentState.viewState,
          selectionSummary: currentState.selectionSummary,
          toolName: normalizedToolName,
          toolArgs,
          result,
          changeSummary: input.changeSummary,
          expectedSequence: 'sequenceNumber' in currentState ? currentState.sequenceNumber : undefined
        })
      }
    } catch (error) {
      const sourceJsx = normalizedToolName === 'render' && typeof input.args.jsx === 'string' ? input.args.jsx : null
      const normalizedJsx = normalizedToolName === 'render' && typeof toolArgs.jsx === 'string' ? toolArgs.jsx : sourceJsx
      if (sourceJsx && normalizedJsx && isRecoverablePencilRenderError(error)) {
        const diagnostic = diagnosePencilRenderError(error, normalizedJsx)
        const draft = await this.createRenderDraft(scope, {
          document,
          sourceJsx,
          normalizedJsx,
          renderArgs: renderPlacementArgs(toolArgs),
          changeSummary: input.changeSummary,
          diagnostic
        })
        return renderDraftFailureResult(document.id as string, draft, diagnostic)
      }
      await this.writeLog(scope, {
        documentId: document.id,
        versionId: document.currentVersionId,
        action: 'failure_reported',
        actorType: 'agent',
        message: `Pencil core tool ${normalizedToolName} failed`,
        errorMessage: getErrorMessage(error),
        snapshot: {
          toolName: normalizedToolName,
          args: compactCoreToolArgs(normalizedToolName, toolArgs)
        }
      })
      throw error
    }

    return {
      success: true,
      toolName: normalizedToolName,
      documentId: document.id,
      mutates: false,
      result: sanitizeToolJson(result),
      snapshotSummary: summarizeGraphSnapshot(currentState.graphSnapshot)
    }
  }

  /** Persists one successful mutating core operation as a single working-copy revision. */
  private async persistCoreToolMutation(
    scope: PencilScope,
    input: {
      document: PencilDocument
      graph: PencilSceneGraph
      viewState: PencilJsonObject
      selectionSummary: PencilJsonObject
      toolName: string
      toolArgs: Record<string, unknown>
      result: unknown
      changeSummary?: string | null
      renderDraftId?: string
      expectedSequence?: number
    }
  ) {
    await tryComputeLayouts(input.graph)
    const graphSnapshot = snapshotFromGraph(input.graph)
    const savedDocument = await this.persistWorkingCopy(scope, input.document, {
      graphSnapshot,
      viewState: input.viewState,
      selectionSummary: {
        ...input.selectionSummary,
        source: 'pencil_core_tool',
        toolName: input.toolName,
        ...(input.renderDraftId ? { renderDraftId: input.renderDraftId } : {})
      },
      expectedSequence: input.expectedSequence
    })
    await this.writeLog(scope, {
      documentId: input.document.id,
      versionId: input.document.currentVersionId,
      action: input.renderDraftId ? 'render_draft_committed' : 'core_tool_executed',
      actorType: 'agent',
      message: input.changeSummary ?? `${PENCIL_CORE_TOOL_PREFIX}${input.toolName}`,
      snapshot: {
        toolName: input.toolName,
        mutates: true,
        args: compactCoreToolArgs(input.toolName, input.toolArgs),
        ...(input.renderDraftId ? { renderDraftId: input.renderDraftId } : {}),
        summary: summarizeGraphSnapshot(graphSnapshot)
      }
    })
    return {
      success: true,
      toolName: input.toolName,
      documentId: input.document.id,
      mutates: true,
      result: sanitizeToolJson(input.result),
      workingCopyRevision: savedDocument.workingCopyRevision,
      graphChecksum: savedDocument.graphChecksum,
      snapshotSummary: summarizeGraphSnapshot(graphSnapshot)
    }
  }

  private async createRenderDraft(
    scope: PencilScope,
    input: {
      document: PencilDocument
      sourceJsx: string
      normalizedJsx: string
      renderArgs: PencilJsonObject
      changeSummary?: string | null
      diagnostic: ReturnType<typeof diagnosePencilRenderError>
    }
  ) {
    const documentId = input.document.id as string
    const draft: PencilPendingRenderDraft = {
      id: randomUUID(),
      sourceJsx: input.sourceJsx,
      normalizedJsx: input.normalizedJsx,
      renderArgs: input.renderArgs,
      changeSummary: normalizeOptional(input.changeSummary),
      revision: 1,
      status: 'active',
      sourceChecksum: checksumText(input.sourceJsx),
      diagnostic: input.diagnostic,
      expiresAt: new Date(Date.now() + PENCIL_RENDER_DRAFT_TTL_MS).toISOString()
    }
    const stored = await this.documentRepository.update(
      scopedDocumentWhere(scope, { id: documentId }),
      pendingRenderDraftUpdate(draft)
    )
    if ((stored.affected ?? 0) !== 1) {
      throw new NotFoundException('Pencil document was not found while retaining render source.')
    }
    await this.writeLog(scope, {
      documentId,
      versionId: input.document.currentVersionId,
      action: 'render_draft_created',
      actorType: 'agent',
      message: 'Pencil render source was retained for a local repair.',
      errorMessage: input.diagnostic.message,
      snapshot: compactRenderDraft(documentId, draft)
    })
    return draft
  }

  private async requirePendingRenderDraft(
    scope: PencilScope,
    document: PencilDocument,
    draftId: string
  ) {
    const normalizedDraftId = normalizeRequired(draftId, 'Pencil render draft id is required.')
    const draftOwner = await this.documentRepository.findOne({
      where: scopedDocumentWhere(scope, { id: document.id as string }),
      select: { id: true, pendingRenderDraft: true }
    })
    const draft = readPendingRenderDraft(draftOwner?.pendingRenderDraft)
    if (!draft || draft.id !== normalizedDraftId) {
      throw new NotFoundException('Pencil render draft was not found.')
    }
    return draft
  }

  private async clearPendingRenderDraft(
    scope: PencilScope,
    documentId: string,
    draft: Pick<PencilPendingRenderDraft, 'id' | 'revision' | 'status'>
  ) {
    return this.documentRepository.update(
      pendingRenderDraftWhere(scope, documentId, draft.id, draft.revision, draft.status),
      pendingRenderDraftUpdate(null)
    )
  }

  private async requireDocument(scope: PencilScope, documentId: string) {
    const document = await this.documentRepository.findOne({
      where: scopedDocumentWhere(scope, { id: normalizeRequired(documentId, 'Pencil document id is required.') })
    })
    if (!document) {
      throw new NotFoundException('Pencil document was not found.')
    }
    return document
  }

  /** Require the platform capability for every browser session and collaborative mutation. */
  private collaboration() {
    const capability = this.runtimeCapabilities?.get(CollaborationRuntimeCapability)
    if (!capability) throw new Error('Platform collaboration capability is not available.')
    return capability
  }

  private optionalCollaboration() {
    return this.runtimeCapabilities?.get(CollaborationRuntimeCapability)
  }

  /** Replace graph/document state through a Yjs delta instead of overwriting the business entity. */
  private async applyCollaborativeState(
    scope: PencilScope,
    document: PencilDocument,
    input: {
      graphSnapshot: PencilGraphSnapshot
      expectedSequence?: number | null
      origin?: string
      metadata?: Partial<ReturnType<typeof collaborativeDocumentMetadata>>
    }
  ) {
    const collaboration = this.optionalCollaboration()
    if (!collaboration) return null
    const collaborative = await collaboration.ensureDocument({
      providerKey: PENCIL_COLLABORATION_PROVIDER_KEY,
      resourceId: document.id as string,
      schemaVersion: PENCIL_COLLABORATION_SCHEMA_VERSION
    })
    const state = await collaboration.getDocumentState({ documentId: collaborative.id })
    if (input.expectedSequence != null && state.sequenceNumber !== input.expectedSequence) {
      throw new ConflictException(
        `Pencil working copy changed on the server; expected sequence ${input.expectedSequence}, current sequence is ${state.sequenceNumber}.`
      )
    }
    const doc = decodePencilCollaborationState(state.updateBase64)
    const beforeVector = Y.encodeStateVector(doc)
    replacePencilCollaborationState(
      doc,
      input.graphSnapshot,
      { ...collaborativeDocumentMetadata(document), ...input.metadata },
      input.origin ?? (scope.assistantId ? 'pencil:agent:mutation' : 'pencil:user:mutation')
    )
    const update = Y.encodeStateAsUpdate(doc, beforeVector)
    if (!update.byteLength) {
      return { sequenceNumber: state.sequenceNumber, stateVectorBase64: state.stateVectorBase64 }
    }
    return collaboration.applyUpdate({
      documentId: collaborative.id,
      updateBase64: Buffer.from(update).toString('base64'),
      origin: input.origin ?? (scope.assistantId ? 'pencil:agent:mutation' : 'pencil:user:mutation'),
      expectedSequence: input.expectedSequence ?? undefined,
      actor: {
        actorType: scope.assistantId ? 'agent' : 'user',
        actorKey: scope.assistantId ?? scope.userId ?? null,
        displayName: scope.assistantDisplayName ?? scope.agentKey ?? null
      }
    })
  }

  private async getCurrentGraphState(scope: PencilScope, document: PencilDocument) {
    const collaboration = this.optionalCollaboration()
    if (collaboration && document.id) {
      const collaborative = await collaboration.ensureDocument({
        providerKey: PENCIL_COLLABORATION_PROVIDER_KEY,
        resourceId: document.id,
        schemaVersion: PENCIL_COLLABORATION_SCHEMA_VERSION
      })
      const state = await collaboration.getDocumentState({ documentId: collaborative.id })
      const materialized = materializePencilCollaborationDoc(decodePencilCollaborationState(state.updateBase64))
      return {
        source: 'working_copy' as const,
        version: await this.getCurrentVersion(scope, document),
        graphSnapshot: normalizeSnapshotInput(materialized.graphSnapshot),
        viewState: normalizeObject(document.workingViewState),
        selectionSummary: normalizeObject(document.workingSelectionSummary),
        sequenceNumber: state.sequenceNumber
      }
    }
    return this.getLegacyCurrentGraphState(scope, document)
  }

  private async getLegacyCurrentGraphState(scope: PencilScope, document: PencilDocument) {
    // The mutable working copy wins only while lazily importing a legacy document.
    const currentVersion = await this.getCurrentVersion(scope, document)
    if (document.workingGraph) {
      return {
        source: 'working_copy' as const,
        version: currentVersion,
        graphSnapshot: normalizeSnapshotInput(document.workingGraph),
        viewState: normalizeObject(document.workingViewState),
        selectionSummary: normalizeObject(document.workingSelectionSummary)
      }
    }
    if (currentVersion?.graphSnapshot) {
      return {
        source: 'version' as const,
        version: currentVersion,
        graphSnapshot: normalizeSnapshotInput(currentVersion.graphSnapshot),
        viewState: normalizeObject(currentVersion.viewState),
        selectionSummary: normalizeObject(currentVersion.selectionSummary)
      }
    }
    return {
      source: 'empty' as const,
      version: currentVersion,
      graphSnapshot: createEmptyPencilGraphSnapshot(),
      viewState: {},
      selectionSummary: {}
    }
  }

  private async getCurrentVersion(scope: PencilScope, document: PencilDocument) {
    if (!document.currentVersionId) {
      return null
    }
    return this.versionRepository.findOne({
      where: scopedVersionWhere(scope, { id: document.currentVersionId, documentId: document.id as string })
    })
  }

  private async persistWorkingCopy(
    scope: PencilScope,
    document: PencilDocument,
    input: {
      graphSnapshot: PencilGraphSnapshot
      viewState?: PencilJsonObject | null
      selectionSummary?: PencilJsonObject | null
      expectedSequence?: number | null
    }
  ) {
    const collaborationResult = await this.applyCollaborativeState(scope, document, {
      graphSnapshot: input.graphSnapshot,
      expectedSequence: input.expectedSequence,
      origin: scope.assistantId ? 'pencil:agent:working-copy' : 'pencil:user:working-copy'
    })
    if (collaborationResult) {
      document.workingGraph = input.graphSnapshot
      document.workingViewState = input.viewState ?? null
      document.workingSelectionSummary = input.selectionSummary ?? null
      document.workingCopyRevision = collaborationResult.sequenceNumber
      document.graphChecksum = checksumGraphSnapshot(input.graphSnapshot) ?? undefined
      document.workingUpdatedAt = new Date()
      return document
    }
    // A working-copy save advances revision and checksum together as one concurrency token pair.
    const workingUpdatedAt = new Date()
    const workingCopyRevision = nextWorkingCopyRevision(document)
    const graphChecksum = checksumGraphSnapshot(input.graphSnapshot)
    return this.documentRepository.save({
      ...document,
      workingGraph: input.graphSnapshot,
      workingViewState: input.viewState ?? null,
      workingSelectionSummary: input.selectionSummary ?? null,
      workingUpdatedAt,
      workingBaseVersionId: document.currentVersionId ?? null,
      workingCopyRevision,
      graphChecksum: graphChecksum ?? undefined,
      status: document.status === 'archived' ? document.status : 'draft',
      lastEditedById: scope.userId ?? scope.assistantId ?? null,
      lastEditedAt: workingUpdatedAt
    })
  }

  private async createVersion(
    scope: PencilScope,
    document: PencilDocument,
    input: {
      sourceType: PencilVersionSource
      graphSnapshot: PencilGraphSnapshot
      viewState?: PencilJsonObject | null
      selectionSummary?: PencilJsonObject | null
      changeSummary?: string | null
    }
  ) {
    // Version creation records an immutable checkpoint; collaborative revision is advanced only by Yjs updates.
    const versionNumber = (document.currentVersionNumber ?? 0) + 1
    const version = await this.versionRepository.save(
      this.versionRepository.create({
        ...scopedCreate(scope),
        documentId: document.id as string,
        versionNumber,
        sourceType: input.sourceType,
        graphSnapshot: input.graphSnapshot,
        viewState: input.viewState ?? null,
        selectionSummary: input.selectionSummary ?? null,
        changeSummary: normalizeOptional(input.changeSummary),
        assistantId: scopeXpertId(scope) ?? null,
        conversationId: scope.conversationId ?? null
      })
    )

    document.currentVersionId = version.id
    document.currentVersionNumber = version.versionNumber
    document.workingBaseVersionId = version.id
    if (!this.optionalCollaboration()) {
      document.workingGraph = input.graphSnapshot
      document.workingViewState = input.viewState ?? null
      document.workingSelectionSummary = input.selectionSummary ?? null
      document.workingUpdatedAt = new Date()
      document.workingCopyRevision = nextWorkingCopyRevision(document)
      document.graphChecksum = checksumGraphSnapshot(input.graphSnapshot) ?? undefined
    }
    document.lastEditedById = scope.userId ?? scope.assistantId ?? null
    document.lastEditedAt = new Date()
    await this.documentRepository.save(document)
    return version
  }

  private assertWorkingCopyBase(
    document: PencilDocument,
    input: {
      baseRevision?: number | null
      baseGraphChecksum?: string | null
    }
  ) {
    // Prefer the monotonic revision; checksum remains a compatibility path for older clients.
    const currentRevision = currentWorkingCopyRevision(document)
    const baseRevision = input.baseRevision
    const baseChecksum = normalizeOptional(input.baseGraphChecksum)
    if (baseRevision != null) {
      if (!Number.isInteger(baseRevision) || baseRevision < 0) {
        throw new BadRequestException('Pencil working copy baseRevision must be a non-negative integer.')
      }
      if (baseRevision !== currentRevision) {
        throw new ConflictException(
          `Pencil working copy changed on the server; baseRevision ${baseRevision} is stale. Reload before saving.`
        )
      }
      return
    }
    if (baseChecksum) {
      const currentChecksum = document.graphChecksum ?? checksumGraphSnapshot(document.workingGraph ?? undefined)
      if (baseChecksum !== currentChecksum) {
        throw new ConflictException('Pencil working copy changed on the server; baseGraphChecksum is stale.')
      }
      return
    }
    if (currentRevision > 0) {
      throw new ConflictException('Pencil working copy save requires baseRevision or baseGraphChecksum.')
    }
  }

  private async writeLog(
    scope: PencilScope,
    input: {
      documentId?: string | null
      versionId?: string | null
      action: PencilActionType
      actorType?: PencilActorType
      message?: string | null
      errorMessage?: string | null
      snapshot?: PencilJsonValue | object | null
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
        snapshot: sanitizeToolJson(input.snapshot)
      })
    )
  }
}

function normalizeSnapshotInput(snapshot: PencilGraphSnapshot | PencilJsonObject | null | undefined): PencilGraphSnapshot {
  try {
    return normalizePencilGraphSnapshot(snapshot ?? createEmptyPencilGraphSnapshot())
  } catch (error) {
    if (error instanceof PencilGraphSnapshotError) {
      throw new BadRequestException(error.message)
    }
    throw error
  }
}

function scopedCreate(scope: PencilScope): ScopedEntity & { createdById?: string | null } {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null,
    projectId: scope.projectId ?? null,
    createdById: scope.userId ?? null
  }
}

/** Builds the mandatory ownership predicate used by every repository query. */
function scopedWhere<T extends object>(scope: PencilScope, extra?: T): T & Partial<ScopedEntity> {
  return {
    ...scopedOwnershipWhere(scope),
    ...(extra ?? {})
  } as T & Partial<ScopedEntity>
}

function scopedOwnershipWhere(scope: PencilScope) {
  const where: {
    tenantId: string
    organizationId?: string
    workspaceId?: string
    projectId?: string
  } = {
    tenantId: scope.tenantId
  }
  if (scope.organizationId != null) {
    where.organizationId = scope.organizationId
  }
  if (scope.projectId != null) {
    where.projectId = scope.projectId
  } else if (scope.workspaceId != null) {
    where.workspaceId = scope.workspaceId
  }
  return where
}

/** Restricts document aggregates to the current Xpert in addition to tenant/workspace ownership. */
function scopedDocumentWhere(
  scope: PencilScope,
  extra: FindOptionsWhere<PencilDocument> = {}
): FindOptionsWhere<PencilDocument> {
  const xpertId = scopeXpertId(scope)
  return {
    ...scopedOwnershipWhere(scope),
    ...(xpertId ? { assistantId: xpertId } : {}),
    ...extra
  }
}

/** Versions inherit the owning document's Xpert boundary for defense-in-depth queries. */
function scopedVersionWhere(
  scope: PencilScope,
  extra: FindOptionsWhere<PencilDocumentVersion> = {}
): FindOptionsWhere<PencilDocumentVersion> {
  const xpertId = scopeXpertId(scope)
  return {
    ...scopedOwnershipWhere(scope),
    ...(xpertId ? { assistantId: xpertId } : {}),
    ...extra
  }
}

/** Resolves the platform Xpert id while retaining the persisted assistantId compatibility field. */
function scopeXpertId(scope: PencilScope) {
  return normalizeOptional(scope.xpertId) ?? normalizeOptional(scope.assistantId)
}

function selectRequestedVersion(
  payload: { currentVersion?: PencilDocumentVersion | null; versions?: PencilDocumentVersion[] },
  input: { versionId?: string; versionNumber?: number }
) {
  const versions = Array.isArray(payload.versions) ? payload.versions : []
  if (input.versionId) {
    const version = versions.find((candidate) => candidate.id === input.versionId)
    if (!version) {
      throw new NotFoundException('Requested Pencil version was not found.')
    }
    return version
  }
  if (input.versionNumber !== undefined) {
    const version = versions.find((candidate) => candidate.versionNumber === input.versionNumber)
    if (!version) {
      throw new NotFoundException('Requested Pencil version was not found.')
    }
    return version
  }
  return payload.currentVersion ?? versions[0] ?? null
}

function hasExplicitVersionRequest(input: { versionId?: string; versionNumber?: number }) {
  return Boolean(input.versionId || input.versionNumber !== undefined)
}

function formatVersionForResponse(version: PencilDocumentVersion | null, includeSnapshot: boolean) {
  if (!version) {
    return null
  }
  return includeSnapshot
    ? version
    : {
        ...compactVersion(version),
        graph: compactGraphSnapshotForAgent(version.graphSnapshot)
      }
}

function formatWorkingCopy(document: PencilDocument, includeSnapshot: boolean) {
  if (!document.workingGraph) {
    return null
  }
  return {
    graphSnapshot: includeSnapshot ? document.workingGraph : undefined,
    graph: includeSnapshot ? undefined : compactGraphSnapshotForAgent(document.workingGraph),
    viewState: document.workingViewState,
    selectionSummary: document.workingSelectionSummary,
    workingUpdatedAt: document.workingUpdatedAt,
    workingBaseVersionId: document.workingBaseVersionId,
    workingCopyRevision: currentWorkingCopyRevision(document),
    graphChecksum: document.graphChecksum ?? checksumGraphSnapshot(document.workingGraph),
    snapshotSummary: summarizeGraphSnapshot(document.workingGraph)
  }
}

function compactDocument(document: PencilDocument | null | undefined) {
  if (!document) {
    return null
  }
  return {
    id: document.id,
    title: document.title,
    kind: document.kind,
    status: document.status,
    sourceFormat: document.sourceFormat,
    currentVersionId: document.currentVersionId,
    currentVersionNumber: document.currentVersionNumber,
    workingUpdatedAt: document.workingUpdatedAt,
    workingCopyRevision: currentWorkingCopyRevision(document),
    graphChecksum: document.graphChecksum ?? checksumGraphSnapshot(document.workingGraph ?? undefined),
    updatedAt: document.updatedAt
  }
}

function compactWorkingCopy(document: PencilDocument, graphSnapshot?: PencilGraphSnapshot) {
  return {
    documentId: document.id,
    workingUpdatedAt: document.workingUpdatedAt,
    workingBaseVersionId: document.workingBaseVersionId,
    workingCopyRevision: currentWorkingCopyRevision(document),
    graphChecksum: document.graphChecksum ?? (graphSnapshot ? checksumGraphSnapshot(graphSnapshot) : checksumGraphSnapshot(document.workingGraph ?? undefined)),
    snapshotSummary: graphSnapshot ? summarizeGraphSnapshot(graphSnapshot) : summarizeGraphSnapshot(document.workingGraph)
  }
}

function compactVersion(version: PencilDocumentVersion | null) {
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
    changeSummary: version.changeSummary,
    createdAt: version.createdAt,
    snapshotSummary: summarizeGraphSnapshot(version.graphSnapshot)
  }
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

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => normalizeOptional(value)).filter(isString)))
}

function normalizeObject(value: PencilJsonValue | object | null | undefined): PencilJsonObject {
  return isPlainObject(value) ? (value as PencilJsonObject) : {}
}

function isString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPlainObject(value: unknown): value is PencilJsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function currentWorkingCopyRevision(document: PencilDocument) {
  return document.workingCopyRevision ?? 0
}

function collaborativeDocumentMetadata(document: PencilDocument) {
  return {
    title: document.title,
    description: document.description ?? null,
    kind: document.kind ?? ('design' as const),
    status: document.status ?? ('draft' as const),
    tags: document.tags ?? []
  }
}

function pencilScopeFromCollaboration(context: CollaborationProviderContext): PencilScope {
  return {
    tenantId: normalizeRequired(context.tenantId, 'Pencil collaboration tenant id is required.'),
    organizationId: context.organizationId ?? null,
    workspaceId: context.workspaceId ?? null,
    projectId: context.projectId ?? null,
    userId: context.userId ?? null,
    xpertId: context.xpertId ?? null,
    assistantId: context.xpertId ?? null
  }
}

function pencilAgentPresenceKey(scope: PencilScope, documentId: string) {
  const identity = [scope.assistantId ?? scope.agentKey ?? 'agent', scope.conversationId ?? '-', documentId].join(':')
  return `pencil_agent_${createHash('sha256').update(identity).digest('base64url').slice(0, 22)}`
}

function nextWorkingCopyRevision(document: PencilDocument) {
  return currentWorkingCopyRevision(document) + 1
}

function inferImportFormat(fileName: string, mimeType?: string | null) {
  const extension = extname(fileName).replace('.', '').toLowerCase()
  if (PENCIL_IMPORT_EXTENSIONS.has(extension)) {
    return extension as 'fig' | 'pen'
  }
  if (mimeType === 'application/json' || mimeType === 'text/plain') {
    return 'pen'
  }
  throw new BadRequestException('Pencil import supports .fig and .pen files.')
}

function normalizeExportFormat(format: string): PencilExportFormat {
  const normalized = format.trim().toLowerCase() as PencilExportFormat
  if (!PENCIL_EXPORT_FORMATS.has(normalized)) {
    throw new BadRequestException('Pencil export format must be fig, png, jpg, webp, svg, pdf, or jsx.')
  }
  return normalized
}

function normalizeExportTarget(graph: PencilSceneGraph, format: PencilExportFormat, input: ExportPencilFileInput['target']): ExportTarget {
  if (input?.scope === 'page') {
    return { scope: 'page', pageId: input.pageId }
  }
  if (input?.scope === 'selection') {
    return { scope: 'selection', nodeIds: input.nodeIds }
  }
  if (input?.scope === 'node') {
    return { scope: 'node', nodeId: input.nodeId }
  }
  if (format === 'jsx') {
    const firstPage = graph.getPages()[0]
    return { scope: 'selection', nodeIds: firstPage?.childIds ?? [] }
  }
  return { scope: 'document' }
}

function requiresServerFontPreparation(format: PencilExportFormat) {
  return format === 'png' || format === 'jpg' || format === 'webp' || format === 'pdf'
}

async function renderRasterPdfExport(graph: PencilSceneGraph, target: ExportTarget, input: ExportPencilFileInput): Promise<PencilExportResult> {
  const resolvedTarget = resolveExportNodes(graph, target)
  if (!resolvedTarget) {
    throw new Error('Nothing to export')
  }
  const { computeContentBounds, headlessRenderNodes } = await loadPencilCoreIo()
  const bounds = computeContentBounds(graph, resolvedTarget.nodeIds)
  if (!bounds) {
    throw new Error('Nothing to export')
  }
  const width = Math.max(1, bounds.maxX - bounds.minX)
  const height = Math.max(1, bounds.maxY - bounds.minY)
  const imageBytes = await headlessRenderNodes(graph, resolvedTarget.pageId, resolvedTarget.nodeIds, {
    scale: input.scale ?? 1,
    format: 'PNG',
    trimTransparent: false
  })
  if (!imageBytes) {
    throw new Error('Nothing to export')
  }

  const { jsPDF } = await import('jspdf')
  const document = new jsPDF({
    orientation: width > height ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [width, height],
    compress: true
  })
  document.setProperties({ title: removeKnownExtension(input.fileName) ?? 'Pencil export' })
  document.addImage(`data:image/png;base64,${Buffer.from(imageBytes).toString('base64')}`, 'PNG', 0, 0, width, height)

  return {
    format: 'pdf',
    mimeType: 'application/pdf',
    extension: 'pdf',
    data: new Uint8Array(document.output('arraybuffer'))
  }
}

function resolveExportNodes(graph: PencilSceneGraph, target: ExportTarget): ResolvedExportNodes | null {
  if (target.scope === 'document') {
    const page = graph.getPages()[0]
    return page ? { pageId: page.id, nodeIds: page.childIds } : null
  }
  if (target.scope === 'page') {
    const page = graph.getNode(target.pageId)
    return page?.type === 'CANVAS' ? { pageId: page.id, nodeIds: page.childIds } : null
  }
  if (target.scope === 'node') {
    return resolveExportNodes(graph, { scope: 'selection', nodeIds: [target.nodeId] })
  }
  if (target.scope !== 'selection') {
    return null
  }
  const firstNodeId = target.nodeIds[0]
  if (!firstNodeId) {
    return null
  }
  const pageId = findPageIdForNode(graph, firstNodeId)
  if (!pageId) {
    return null
  }
  if (!target.nodeIds.every((nodeId) => findPageIdForNode(graph, nodeId) === pageId)) {
    throw new Error('Export selection must stay on a single page')
  }
  return { pageId, nodeIds: target.nodeIds }
}

function findPageIdForNode(graph: PencilSceneGraph, nodeId: string): string | null {
  let current = graph.getNode(nodeId)
  while (current) {
    if (current.type === 'CANVAS') {
      return current.id
    }
    current = current.parentId ? graph.getNode(current.parentId) : undefined
  }
  return null
}

function normalizeGraphForExport(graph: PencilSceneGraph, format: PencilExportFormat) {
  if (format !== 'fig') {
    return
  }
  // The current writer cannot encode STRETCH in the legacy StackAlign field.
  for (const node of graph.nodes.values()) {
    if (node.counterAxisAlign === 'STRETCH') {
      node.counterAxisAlign = 'MIN'
    }
  }
}

function buildExportOptions(format: PencilExportFormat, input: ExportPencilFileInput): Record<string, unknown> {
  if (format === 'png') {
    return { scale: input.scale ?? 1 }
  }
  if (format === 'jpg' || format === 'webp') {
    return { scale: input.scale ?? 1, quality: input.quality ?? 0.92 }
  }
  if (format === 'svg') {
    return { colorSpace: input.colorSpace === 'display-p3' ? 'display-p3' : 'srgb' }
  }
  if (format === 'fig') {
    return { renderThumbnail: false }
  }
  if (format === 'jsx') {
    return { format: 'pencil' }
  }
  return {}
}

function exportResultToBuffer(data: string | Uint8Array) {
  return typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data)
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

function checksumBuffer(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function getAllowedCoreToolMap() {
  pencilCoreToolsByNamePromise ??= buildAllowedCoreToolMap()
  return pencilCoreToolsByNamePromise
}

/** Builds the explicit Agent-facing allowlist and removes unsafe or plugin-reserved names. */
async function buildAllowedCoreToolMap() {
  const { CORE_TOOLS, EXTENDED_TOOLS } = await loadPencilCoreTools()
  const selectedNames = new Set<string>(PENCIL_SELECTED_CORE_TOOL_NAMES)
  const excludedNames = new Set<string>(PENCIL_EXCLUDED_CORE_TOOL_NAMES)
  const reservedToolNames = new Set<string>(PENCIL_BASE_MIDDLEWARE_TOOL_NAMES)
  const map = new Map<string, ToolDef>()
  for (const toolDef of [...CORE_TOOLS, ...EXTENDED_TOOLS]) {
    if (excludedNames.has(toolDef.name) || reservedToolNames.has(`${PENCIL_CORE_TOOL_PREFIX}${toolDef.name}`) || !selectedNames.has(toolDef.name)) {
      continue
    }
    map.set(toolDef.name, toolDef)
  }
  for (const toolDef of CORE_TOOLS) {
    if (excludedNames.has(toolDef.name) || reservedToolNames.has(`${PENCIL_CORE_TOOL_PREFIX}${toolDef.name}`)) {
      continue
    }
    map.set(toolDef.name, toolDef)
  }
  return map
}

function normalizeCoreToolName(toolName: string) {
  const normalized = normalizeRequired(toolName, 'Pencil core tool name is required.')
  return normalized.startsWith(PENCIL_CORE_TOOL_PREFIX) ? normalized.slice(PENCIL_CORE_TOOL_PREFIX.length) : normalized
}

function sanitizeToolJson(value: unknown, depth = 0): PencilJsonValue {
  // Audit logs retain useful structure while bounding depth, list size, and binary volume.
  if (depth > 8) {
    return '[truncated]'
  }
  if (value instanceof Uint8Array) {
    return `[binary:${value.byteLength}]`
  }
  if (Array.isArray(value)) {
    return value.slice(0, 200).map((item) => sanitizeToolJson(item, depth + 1))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .slice(0, 200)
        .map(([key, item]) => [key, sanitizeToolJson(item, depth + 1)])
    ) as PencilJsonObject
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value as PencilJsonValue
  }
  return value === undefined ? null : String(value)
}

/** Applies exact, uniquely matching edits so a stale or ambiguous Agent patch cannot corrupt retained source. */
function applyRenderDraftEdits(source: string, edits: PatchPencilRenderDraftInput['edits']) {
  let updated = source
  for (const edit of edits) {
    const firstIndex = updated.indexOf(edit.oldText)
    if (firstIndex < 0) {
      throw new ConflictException('Pencil render patch oldText was not found in the current draft revision.')
    }
    if (updated.indexOf(edit.oldText, firstIndex + edit.oldText.length) >= 0) {
      throw new ConflictException('Pencil render patch oldText matched more than once. Include more surrounding context.')
    }
    updated = `${updated.slice(0, firstIndex)}${edit.newText}${updated.slice(firstIndex + edit.oldText.length)}`
  }
  return updated
}

function renderPlacementArgs(args: Record<string, unknown>): PencilJsonObject {
  return Object.fromEntries(
    Object.entries(args)
      .filter(([key]) => key !== 'jsx')
      .map(([key, value]) => [key, sanitizeToolJson(value)])
  ) as PencilJsonObject
}

function compactCoreToolArgs(toolName: string, args: Record<string, unknown>) {
  if (toolName !== 'render') {
    return sanitizeToolJson(args)
  }
  const jsx = typeof args.jsx === 'string' ? args.jsx : ''
  return {
    ...renderPlacementArgs(args),
    jsxLength: jsx.length,
    jsxChecksum: jsx ? checksumText(jsx) : null
  }
}

function compactRenderDraft(documentId: string, draft: PencilPendingRenderDraft): PencilJsonObject {
  return {
    id: draft.id,
    documentId,
    revision: draft.revision,
    status: draft.status,
    sourceChecksum: draft.sourceChecksum,
    sourceLength: draft.sourceJsx.length,
    diagnostic: draft.diagnostic ?? null,
    expiresAt: draft.expiresAt
  }
}

function renderDraftFailureResult(
  documentId: string,
  draft: PencilPendingRenderDraft,
  diagnostic: ReturnType<typeof diagnosePencilRenderError>
) {
  return {
    success: false,
    recoverable: true,
    toolName: 'render',
    documentId,
    mutates: false,
    message: 'Pencil render source was retained. Repair only the reported fragment with pencil_render_patch.',
    renderDraftId: draft.id,
    renderDraftRevision: draft.revision,
    renderDraftStatus: draft.status,
    renderDraftExpiresAt: draft.expiresAt,
    diagnostic
  }
}

function pendingRenderDraftUpdate(draft: PencilPendingRenderDraft | null) {
  return { pendingRenderDraft: draft }
}

/** Builds an atomic JSONB ownership predicate for one document-owned render repair. */
function pendingRenderDraftWhere(
  scope: PencilScope,
  documentId: string,
  draftId: string,
  revision: number,
  status?: PencilRenderDraftStatus
): FindOptionsWhere<PencilDocument> {
  const parameters: Record<string, string | number> = {
    pencilRenderDraftId: draftId,
    pencilRenderDraftRevision: revision
  }
  if (status) {
    parameters.pencilRenderDraftStatus = status
  }
  const pendingRenderDraft = Raw(
    (alias) => [
      `${alias} ->> 'id' = :pencilRenderDraftId`,
      `(${alias} ->> 'revision')::integer = :pencilRenderDraftRevision`,
      ...(status ? [`${alias} ->> 'status' = :pencilRenderDraftStatus`] : [])
    ].join(' AND '),
    parameters
  )
  return scopedDocumentWhere(scope, { id: documentId, pendingRenderDraft })
}

function pendingRenderDraftExpiresAt(draft: PencilPendingRenderDraft) {
  const expiresAt = Date.parse(draft.expiresAt)
  return Number.isFinite(expiresAt) ? expiresAt : 0
}

/** Validates the hidden JSONB column before it enters the typed render-repair workflow. */
function readPendingRenderDraft(value: unknown): PencilPendingRenderDraft | null {
  if (!isPlainObject(value) ||
    typeof value.id !== 'string' ||
    !Number.isInteger(value.revision) ||
    (value.status !== 'active' && value.status !== 'validating') ||
    typeof value.sourceJsx !== 'string' ||
    typeof value.normalizedJsx !== 'string' ||
    !isPlainObject(value.renderArgs) ||
    typeof value.sourceChecksum !== 'string' ||
    typeof value.expiresAt !== 'string') {
    return null
  }
  return value as PencilPendingRenderDraft
}

function checksumText(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

async function tryComputeLayouts(graph: PencilSceneGraph) {
  try {
    const { computeAllLayouts } = await loadPencilCore()
    for (const page of graph.getPages(true)) {
      computeAllLayouts(graph, page.id)
    }
  } catch {
    // Layout recomputation is best-effort during import/tool execution.
  }
  repairPencilGraphForDisplay(graph)
}

/** Installs deterministic CJK fallback fonts before headless CanvasKit export measures or paints text. */
async function prepareServerPencilFonts() {
  serverPencilFontsPromise ??= (async () => {
    const { fontManager } = await loadPencilCore()
    installServerBundledFontCache(fontManager)
    await Promise.all([
      fontManager.loadFont('Inter', 'Regular'),
      fontManager.loadFont('Inter', 'Medium'),
      fontManager.loadFont('Inter', 'SemiBold'),
      fontManager.loadFont('Inter', 'Bold'),
      fontManager.loadFont('Inter', 'ExtraBold'),
      fontManager.loadFont('Noto Naskh Arabic', 'Regular')
    ])
    fontManager.setArabicFallbackFamily('Noto Naskh Arabic')
    const fontPackageRoot = dirname(packageRequire.resolve('@fontsource-variable/noto-sans-sc/package.json'))
    const fontFilesRoot = join(fontPackageRoot, 'files')
    const cjkFontFiles = (await readdir(fontFilesRoot))
      .map((name) => {
        const match = /^noto-sans-sc-(\d+)-wght-normal\.woff2$/.exec(name)
        return match ? { name, order: Number(match[1]) } : null
      })
      .filter((item): item is { name: string; order: number } => Boolean(item))
      .sort((left, right) => left.order - right.order)

    if (!cjkFontFiles.length) {
      throw new Error('Bundled CJK fonts could not be found for Pencil export.')
    }

    await Promise.all(
      cjkFontFiles.map(async (file, index) => {
        const family = `${SERVER_CJK_FONT_ALIAS_PREFIX} ${String(index + 1).padStart(3, '0')}`
        const data = await readFile(join(fontFilesRoot, file.name))
        fontManager.markLoaded(family, SERVER_CJK_FONT_STYLE, toArrayBuffer(data))
        fontManager.setCJKFallbackFamily(family)
      })
    )
  })()
  return serverPencilFontsPromise
}

function installServerBundledFontCache(fontManager: PencilCoreModule['fontManager']) {
  const cache: DownloadedFontCache = {
    read: readServerBundledFont,
    async write(family, style, data) {
      serverBundledFontData.set(serverFontCacheKey(family, style), data.slice(0))
    }
  }
  fontManager.setDownloadedFontCache(cache)
}

async function readServerBundledFont(family: string, style: string) {
  const key = serverFontCacheKey(family, style)
  const fileName = SERVER_BUNDLED_FONT_FILES.get(key)
  if (!fileName) {
    return serverBundledFontData.get(key)?.slice(0) ?? null
  }
  const cached = serverBundledFontData.get(key)
  if (cached) {
    return cached.slice(0)
  }
  const assetsRoot = await resolveServerPencilCoreAssetsRoot()
  const data = toArrayBuffer(await readFile(join(assetsRoot, fileName)))
  serverBundledFontData.set(key, data)
  return data.slice(0)
}

function resolveServerPencilCoreAssetsRoot() {
  serverPencilCoreAssetsRootPromise ??= Promise.resolve(join(dirname(dirname(packageRequire.resolve('@open\u002dpencil/core'))), 'assets'))
  return serverPencilCoreAssetsRootPromise
}

function serverFontCacheKey(family: string, style: string) {
  return `${family}|${style || 'Regular'}`
}

function loadPencilCore(): Promise<PencilCoreModule> {
  // Lazy imports keep the plugin entry loadable without pulling the core ESM graph into host startup.
  pencilCoreModulePromise ??= import('@open\u002dpencil/core')
  return pencilCoreModulePromise
}

function loadPencilCoreIo(): Promise<PencilCoreIoModule> {
  pencilCoreIoModulePromise ??= import('@open\u002dpencil/core/io')
  return pencilCoreIoModulePromise
}

function loadPencilCoreTools(): Promise<PencilCoreToolsModule> {
  pencilCoreToolsModulePromise ??= import('@open\u002dpencil/core/tools')
  return pencilCoreToolsModulePromise
}

function removeKnownExtension(fileName: string | null | undefined) {
  const normalized = normalizeOptional(fileName)
  if (!normalized) {
    return undefined
  }
  return normalized.replace(/\.(fig|pen)$/i, '')
}

function sanitizeFileName(name: string, extension: string) {
  const ext = extension.startsWith('.') ? extension : `.${extension}`
  const rawBase = name.replace(/\.[^.]+$/, '')
  const baseName = sanitizeFileNamePart(rawBase)
  return `${baseName}${ext}`
}

function sanitizeFileNamePart(value: string | null | undefined) {
  return (
    (value ?? 'pencil-export')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100) || 'pencil-export'
  )
}

function normalizePathSegment(value: string) {
  const segment = sanitizeFileNamePart(value)
  if (segment === '.' || segment === '..') {
    throw new BadRequestException('Invalid Pencil workspace path segment.')
  }
  return segment
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
