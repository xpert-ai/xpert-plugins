import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import { Repository } from 'typeorm'
import { XPERT_RUNTIME_CAPABILITIES_TOKEN } from '@xpert-ai/plugin-sdk'
import type { AgentMiddlewareRuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import {
  createReviewerBridge,
  DocxReviewer,
  executeToolCall,
  type AgentToolResult,
  type EditorBridge
} from '@eigenpal/docx-editor-agents/server'
import {
  DOCX_EDITOR_LIVE_ONLY_TOOL_NAMES,
  DOCX_EDITOR_MAX_INLINE_DOCX_BYTES,
  DOCX_EDITOR_MUTATION_TOOL_NAMES,
  DOCX_EDITOR_WORKBENCH_LIVE_TOOL_NAMES
} from './constants.js'
import {
  DocxEditorDocument,
  DocxEditorOperation,
  DocxEditorSnapshot,
  DocxEditorVersion
} from './entities/index.js'
import { DOCX_WORKSPACE_FILES_RUNTIME_CAPABILITY } from './types.js'
import type {
  CompleteDocxOperationInput,
  CreateDocxDocumentInput,
  DocxEditorScope,
  DocxEditorToolName,
  DocxEditorToolExecutionTarget,
  DocxWorkspaceFileScope,
  DocxWorkspaceFilesApi,
  DocxWorkbenchQuery,
  PrepareDocxAssistantPromptInput,
  RestoreDocxVersionInput,
  RunDocxAgentToolInput,
  SaveDocxVersionInput,
  SyncDocxSnapshotInput,
  UploadDocxInput
} from './types.js'

type ScopedFields = {
  tenantId?: string | null
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
}

type ScopedQuery = {
  id?: string
  documentId?: string
  versionId?: string
}

type SuggestChangeItem = {
  paraId: string
  search: string
  replaceWith: string
}

type SuggestChangeDiagnostic = {
  index: number
  paraId?: string
  reason: string
  paragraphText?: string
  hint: string
}

type ReviewChange = {
  id: number
  type?: string
  text: string
  context?: string
  paragraphIndex?: number
  noteId?: number
  noteType?: 'footnote' | 'endnote'
}

type DocxAgentToolResult = AgentToolResult & {
  appliedCount?: number
  diagnostics?: Record<string, unknown>[]
  source?: string
  queued?: boolean
  recoverable?: boolean
  message?: string
}

type ContentBlock = ReturnType<EditorBridge['getContent']>[number]

type CompactAgentToolResponse = {
  operation: ReturnType<typeof compactOperation>
  result: unknown
  version: ReturnType<typeof compactVersion>
  document: ReturnType<typeof compactDocument>
}

const MUTATION_TOOL_NAMES = new Set<DocxEditorToolName>(DOCX_EDITOR_MUTATION_TOOL_NAMES)
const LIVE_ONLY_TOOL_NAMES = new Set<DocxEditorToolName>(DOCX_EDITOR_LIVE_ONLY_TOOL_NAMES)
const WORKBENCH_LIVE_TOOL_NAMES = new Set<DocxEditorToolName>(DOCX_EDITOR_WORKBENCH_LIVE_TOOL_NAMES)
const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const READ_DOCUMENT_MAX_LINES = 80
const READ_DOCUMENT_MAX_CHARS = 12000
const LIST_RESULT_MAX_ITEMS = 25
const FIND_TEXT_MAX_ITEMS = 20
const TEXT_PREVIEW_MAX_CHARS = 2400
const FIELD_PREVIEW_MAX_CHARS = 600

@Injectable()
export class DocxEditorService {
  constructor(
    @InjectRepository(DocxEditorDocument)
    private readonly documentRepository: Repository<DocxEditorDocument>,
    @InjectRepository(DocxEditorVersion)
    private readonly versionRepository: Repository<DocxEditorVersion>,
    @InjectRepository(DocxEditorSnapshot)
    private readonly snapshotRepository: Repository<DocxEditorSnapshot>,
    @InjectRepository(DocxEditorOperation)
    private readonly operationRepository: Repository<DocxEditorOperation>,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: AgentMiddlewareRuntimeCapabilityRegistry
  ) {}

  async createDocument(scope: DocxEditorScope, input: CreateDocxDocumentInput) {
    const title = normalizeRequired(input.title, 'Document title is required.')
    return this.documentRepository.save(
      this.documentRepository.create({
        ...scopedCreate(scope),
        title,
        description: normalizeOptional(input.description),
        assistantId: normalizeOptional(input.assistantId) ?? normalizeOptional(scope.assistantId),
        conversationId: normalizeOptional(input.conversationId) ?? normalizeOptional(scope.conversationId),
        status: 'draft',
        currentVersionNumber: 0,
        createdById: normalizeOptional(scope.userId)
      })
    )
  }

  async uploadDocx(scope: DocxEditorScope, input: UploadDocxInput) {
    const document = input.documentId
      ? await this.requireDocument(scope, input.documentId)
      : await this.createDocument(scope, {
          title: input.title ?? createTitleFromFileName(input.fileName),
          description: input.description
        })

    return this.saveDocumentVersion(scope, {
      ...input,
      documentId: requireEntityId(document.id, 'Document id is required.'),
      source: input.source ?? 'upload'
    })
  }

  async saveDocumentVersion(scope: DocxEditorScope, input: SaveDocxVersionInput) {
    const document = await this.requireDocument(scope, input.documentId)
    const docxBuffer = parseDocxBase64(input.docxBase64)
    validateDocxBuffer(docxBuffer)
    if (docxBuffer.byteLength > DOCX_EDITOR_MAX_INLINE_DOCX_BYTES) {
      throw new BadRequestException(`DOCX file exceeds ${DOCX_EDITOR_MAX_INLINE_DOCX_BYTES} bytes.`)
    }

    const nextVersionNumber = (document.currentVersionNumber ?? 0) + 1
    const checksumValue = checksum(docxBuffer)
    const workspaceScope = resolveDocumentWorkspaceScope(scope, document)
    const workspaceFile = await this.workspaceFiles().uploadBuffer({
      ...workspaceScope,
      buffer: docxBuffer,
      originalName: normalizeOptional(input.fileName) ?? normalizeOptional(document.fileName) ?? `document-${input.documentId}.docx`,
      mimeType: normalizeOptional(input.mimeType) ?? normalizeOptional(document.mimeType) ?? DOCX_MIME_TYPE,
      size: input.size ?? docxBuffer.byteLength,
      folder: buildDocxVersionFolder(input.documentId),
      fileName: buildDocxVersionFileName(nextVersionNumber, checksumValue),
      metadata: {
        documentType: 'docx-editor-version',
        documentId: input.documentId,
        versionNumber: nextVersionNumber,
        source: input.source ?? 'workbench'
      }
    })
    const version = await this.versionRepository.save(
      this.versionRepository.create({
        ...scopedCreate(scope),
        documentId: input.documentId,
        versionNumber: nextVersionNumber,
        source: input.source ?? 'workbench',
        workspaceFilePath: workspaceFile.filePath,
        workspaceFileUrl: normalizeOptional(workspaceFile.fileUrl) ?? normalizeOptional(workspaceFile.url),
        workspaceCatalog: workspaceScope.catalog,
        workspaceScopeId: workspaceScope.scopeId,
        mimeType: normalizeOptional(input.mimeType) ?? normalizeOptional(document.mimeType) ?? DOCX_MIME_TYPE,
        size: input.size ?? docxBuffer.byteLength,
        checksum: checksumValue,
        changeSummary: normalizeOptional(input.changeSummary),
        operationId: normalizeOptional(input.operationId),
        createdById: normalizeOptional(scope.userId)
      })
    )

    const savedDocument = await this.documentRepository.save({
      ...document,
      ...extractDocumentFileFields(input, workspaceFile, workspaceScope),
      title: normalizeOptional(input.title) ?? document.title,
      description: normalizeOptional(input.description) ?? document.description,
      status: 'active',
      currentVersionId: version.id,
      currentVersionNumber: nextVersionNumber,
      lastEditedById: normalizeOptional(scope.userId),
      lastEditedAt: new Date()
    })

    return {
      document: savedDocument,
      version
    }
  }

  async syncSnapshot(scope: DocxEditorScope, input: SyncDocxSnapshotInput) {
    const document = await this.requireDocument(scope, input.documentId)
    const previousSnapshot = await this.getLatestSnapshot(scope, input.documentId)
    const snapshot = await this.snapshotRepository.save(
      this.snapshotRepository.create({
        ...scopedCreate(scope),
        documentId: input.documentId,
        versionId: normalizeOptional(input.versionId) ?? document.currentVersionId,
        contentText: normalizeOptional(input.contentText) ?? previousSnapshot?.contentText,
        paragraphCount: input.paragraphCount ?? previousSnapshot?.paragraphCount ?? 0,
        totalPages: input.totalPages ?? previousSnapshot?.totalPages ?? 0,
        currentPage: input.currentPage ?? previousSnapshot?.currentPage ?? 0,
        selection: input.selection === undefined ? previousSnapshot?.selection ?? null : input.selection ?? null,
        comments: input.comments === undefined ? previousSnapshot?.comments ?? null : input.comments ?? null,
        changes: input.changes === undefined ? previousSnapshot?.changes ?? null : input.changes ?? null,
        pages: input.pages === undefined ? previousSnapshot?.pages ?? null : input.pages ?? null
      })
    )

    await this.documentRepository.save({
      ...document,
      lastSnapshotId: snapshot.id
    })

    return snapshot
  }

  async completeOperation(scope: DocxEditorScope, input: CompleteDocxOperationInput) {
    const operation = await this.operationRepository.findOne({
      where: scopedWhere(scope, { id: input.operationId })
    })
    if (!operation) {
      throw new NotFoundException('DOCX editor operation was not found.')
    }
    return this.operationRepository.save({
      ...operation,
      status: input.status,
      result: input.result ?? operation.result,
      errorMessage: normalizeOptional(input.errorMessage)
    })
  }

  async deleteDocument(scope: DocxEditorScope, documentId: string) {
    await this.requireDocument(scope, documentId)
    const versions = await this.versionRepository.find({
      where: scopedWhere(scope, { documentId })
    })
    const workspaceFiles = this.runtimeCapabilities?.get<DocxWorkspaceFilesApi>(DOCX_WORKSPACE_FILES_RUNTIME_CAPABILITY)
    if (workspaceFiles) {
      await Promise.all(
        versions
          .map(async (version) => {
            const filePath = version.workspaceFilePath
            if (!filePath) {
              return
            }
            try {
              await workspaceFiles.deleteFile({
                ...resolveVersionWorkspaceScope(scope, version),
                filePath
              })
            } catch {
              // Best-effort cleanup; database records remain the source of deletion state.
            }
          })
      )
    }
    await this.operationRepository.delete(scopedWhere(scope, { documentId }))
    await this.snapshotRepository.delete(scopedWhere(scope, { documentId }))
    await this.versionRepository.delete(scopedWhere(scope, { documentId }))
    await this.documentRepository.delete(scopedWhere(scope, { id: documentId }))
    return {
      deleted: true,
      documentId
    }
  }

  async restoreVersion(scope: DocxEditorScope, input: RestoreDocxVersionInput) {
    await this.requireDocument(scope, input.documentId)
    const version = await this.requireVersion(scope, input.documentId, input.versionId)
    const docxBuffer = await this.readVersionBuffer(scope, version)
    return this.saveDocumentVersion(scope, {
      documentId: input.documentId,
      docxBase64: docxBuffer.toString('base64'),
      size: version.size,
      mimeType: version.mimeType,
      source: 'restore',
      changeSummary: normalizeOptional(input.changeSummary) ?? `Restored version ${version.versionNumber}.`
    })
  }

  async prepareAssistantPrompt(scope: DocxEditorScope, input: PrepareDocxAssistantPromptInput) {
    const document = await this.requireDocument(scope, input.documentId)
    const instruction = normalizeOptional(input.instruction) ?? '请审阅当前 DOCX 文档，必要时添加批注或提出修订建议。'
    return {
      commandKey: 'assistant.chat.send_message',
      payload: {
        text: [
          `当前 DOCX 文档 id: ${document.id}`,
          `标题: ${document.title}`,
          `当前版本: ${document.currentVersionNumber ?? 0}`,
          ...(document.workspaceFilePath ? [`当前版本 workspace 文件路径: ${document.workspaceFilePath}`] : []),
          '',
          instruction,
          '',
          '请先调用 docx_read_document 或 docx_find_text 定位 paraId，再调用批注、修订或格式工具。'
        ].join('\n')
      },
      documentId: document.id
    }
  }

  async runAgentTool(scope: DocxEditorScope, input: RunDocxAgentToolInput) {
    const toolName = input.toolName
    const document = await this.requireDocument(scope, input.documentId)
    const version = await this.requireCurrentVersion(scope, document)
    const upstreamToolName = toUpstreamToolName(toolName)
    const toolInput = stripDocumentToolInput(input.input ?? {})

    if (LIVE_ONLY_TOOL_NAMES.has(toolName)) {
      return this.runLiveOnlyTool(scope, document, version, toolName, toolInput)
    }

    if (shouldQueueWorkbenchLive(input.executionTarget, toolName)) {
      return this.queueWorkbenchLiveTool(scope, document, version, toolName, toolInput)
    }

    if (toolName === 'docx_read_document' || toolName === 'docx_read_comments' || toolName === 'docx_read_changes') {
      const snapshotResult = await this.tryReadFromSnapshot(scope, document, toolName, toolInput)
      if (snapshotResult) {
        return snapshotResult
      }
    }

    const operation = await this.operationRepository.save(
      this.operationRepository.create({
        ...scopedCreate(scope),
        documentId: input.documentId,
        versionId: version.id,
        toolName,
        source: 'agent',
        status: 'queued',
        input: toolInput,
        createdById: normalizeOptional(scope.userId)
      })
    )

    try {
      const versionBuffer = await this.readVersionBuffer(scope, version)
      const reviewer = await DocxReviewer.fromBuffer(toArrayBuffer(versionBuffer), input.author ?? 'Xpert DOCX Assistant')
      const bridge = createReviewerBridge(reviewer)
      const result = executeDocxAgentTool(toolName, upstreamToolName, toolInput, bridge, reviewer)
      const shouldPersist = shouldPersistAgentResult(toolName, result)
      const reviewSnapshot = shouldPersist ? readReviewerReviewSnapshot(bridge) : null
      const savedVersion = shouldPersist
        ? await this.saveDocumentVersion(scope, {
            documentId: input.documentId,
            docxBase64: Buffer.from(await reviewer.toBuffer()).toString('base64'),
            source: 'agent',
            changeSummary: `${toolName} applied by agent.`,
            operationId: operation.id
          })
        : null
      if (savedVersion?.version && reviewSnapshot) {
        await this.saveAgentReviewSnapshot(scope, input.documentId, savedVersion.version.id, reviewSnapshot)
      }
      const savedOperation = await this.operationRepository.save({
        ...operation,
        status: result.success ? 'applied' : 'failed',
        result,
        errorMessage: result.success ? undefined : normalizeOptional(String(result.error ?? 'DOCX tool failed.'))
      })
      return compactAgentToolResponse({
        operation: savedOperation,
        result,
        version: savedVersion?.version ?? version,
        document: savedVersion?.document ?? document,
        toolName,
        toolInput
      })
    } catch (error) {
      const message = getErrorMessage(error, 'DOCX tool execution failed.')
      const savedOperation = await this.operationRepository.save({
        ...operation,
        status: 'failed',
        errorMessage: message,
        result: {
          success: false,
          error: message
        }
      })
      return compactAgentToolResponse({
        operation: savedOperation,
        result: {
          success: false,
          error: message
        },
        version,
        document,
        toolName,
        toolInput
      })
    }
  }

  async getWorkbenchData(scope: DocxEditorScope, query: DocxWorkbenchQuery) {
    if (query.documentId) {
      const document = await this.requireDocument(scope, query.documentId)
      const [versions, snapshot, operations] = await Promise.all([
        this.versionRepository.find({
          where: scopedWhere(scope, { documentId: query.documentId }),
          order: { versionNumber: 'DESC' }
        }),
        this.getLatestSnapshot(scope, query.documentId),
        this.operationRepository.find({
          where: scopedWhere(scope, { documentId: query.documentId }),
          order: { createdAt: 'DESC' },
          take: 20
        })
      ])
      const requestedVersionId = normalizeOptional(query.versionId)
      const requestedVersionEntity = requestedVersionId
        ? versions.find((version) => version.id === requestedVersionId) ?? null
        : null
      if (requestedVersionId && !requestedVersionEntity) {
        throw new NotFoundException('DOCX document version was not found.')
      }
      const currentVersionEntity = requestedVersionEntity
        ?? versions.find((version) => version.id === document.currentVersionId)
        ?? versions[0]
        ?? null
      return {
        item: document,
        currentVersion: currentVersionEntity
          ? await this.attachTransientDocxBase64(scope, currentVersionEntity)
          : null,
        versions,
        snapshot,
        operations
      }
    }

    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20))
    const [items, total] = await this.documentRepository.findAndCount({
      where: scopedWhere(scope, {}),
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
    const normalizedSearch = normalizeOptional(query.search)?.toLowerCase()
    const filteredItems = normalizedSearch
      ? items.filter((item) => item.title?.toLowerCase().includes(normalizedSearch) || item.fileName?.toLowerCase().includes(normalizedSearch))
      : items

    return {
      tableKey: 'documents',
      table: {
        key: 'documents',
        items: filteredItems,
        total: normalizedSearch ? filteredItems.length : total,
        page,
        pageSize
      },
      items: filteredItems,
      total: normalizedSearch ? filteredItems.length : total,
      page,
      pageSize
    }
  }

  private workspaceFiles() {
    const files = this.runtimeCapabilities?.get<DocxWorkspaceFilesApi>(DOCX_WORKSPACE_FILES_RUNTIME_CAPABILITY)
    if (!files) {
      throw new BadRequestException('Xpert workspace file runtime capability is required for DOCX storage.')
    }
    return files
  }

  private async readVersionBuffer(scope: DocxEditorScope, version: DocxEditorVersion) {
    if (!version.workspaceFilePath) {
      throw new BadRequestException('DOCX version workspace file path is missing. Re-upload the document.')
    }
    const workspaceScope = resolveVersionWorkspaceScope(scope, version)
    const file = await this.workspaceFiles().readBuffer({
      ...workspaceScope,
      filePath: version.workspaceFilePath
    })
    validateDocxBuffer(file.buffer)
    return file.buffer
  }

  private async attachTransientDocxBase64(scope: DocxEditorScope, version: DocxEditorVersion) {
    const buffer = await this.readVersionBuffer(scope, version)
    return {
      ...version,
      docxBase64: buffer.toString('base64')
    }
  }

  private async tryReadFromSnapshot(
    scope: DocxEditorScope,
    document: DocxEditorDocument,
    toolName: DocxEditorToolName,
    input: Record<string, unknown>
  ) {
    const documentId = requireEntityId(document.id, 'Document id is required.')
    const snapshot = await this.getLatestSnapshot(scope, documentId)
    if (!snapshot) {
      return null
    }

    let data: unknown = null
    if (toolName === 'docx_read_document' && snapshot.contentText) {
      data = sliceSnapshotContent(snapshot.contentText, input)
    } else if (toolName === 'docx_read_comments' && isUsableReviewSnapshot(snapshot, document.currentVersionId, 'comments')) {
      data = snapshot.comments
    } else if (toolName === 'docx_read_changes' && isUsableReviewSnapshot(snapshot, document.currentVersionId, 'changes')) {
      data = snapshot.changes
    }

    if (data == null) {
      return null
    }

    const operation = await this.operationRepository.save(
      this.operationRepository.create({
        ...scopedCreate(scope),
        documentId,
        versionId: document.currentVersionId,
        toolName,
        source: 'agent',
        status: 'applied',
        input,
        result: {
          success: true,
          data,
          source: 'snapshot'
        },
        createdById: normalizeOptional(scope.userId)
      })
    )

    return compactAgentToolResponse({
      operation,
      result: {
        success: true,
        data,
        source: 'snapshot'
      },
      document,
      version: document.currentVersionId ? await this.versionRepository.findOne({ where: scopedWhere(scope, { id: document.currentVersionId }) }) : null,
      toolName,
      toolInput: input
    })
  }

  private async queueWorkbenchLiveTool(
    scope: DocxEditorScope,
    document: DocxEditorDocument,
    version: DocxEditorVersion,
    toolName: DocxEditorToolName,
    input: Record<string, unknown>
  ) {
    const documentId = requireEntityId(document.id, 'Document id is required.')
    const result = {
      success: true,
      queued: true,
      source: 'workbench_live',
      message: 'Operation was queued for the live Workbench editor.',
      data: input
    }
    const operation = await this.operationRepository.save(
      this.operationRepository.create({
        ...scopedCreate(scope),
        documentId,
        versionId: version.id,
        toolName,
        source: 'agent',
        status: 'queued',
        input,
        result,
        createdById: normalizeOptional(scope.userId)
      })
    )

    return compactAgentToolResponse({
      operation,
      result,
      document,
      version,
      toolName,
      toolInput: input
    })
  }

  private async runLiveOnlyTool(
    scope: DocxEditorScope,
    document: DocxEditorDocument,
    version: DocxEditorVersion,
    toolName: DocxEditorToolName,
    input: Record<string, unknown>
  ) {
    const documentId = requireEntityId(document.id, 'Document id is required.')
    const snapshot = await this.getLatestSnapshot(scope, documentId)
    let result: unknown
    let status: 'applied' | 'queued' | 'failed' = 'applied'
    let errorMessage: string | undefined

    if (toolName === 'docx_read_selection') {
      if (snapshot?.selection) {
        result = { success: true, data: snapshot.selection, source: 'snapshot' }
      } else {
        status = 'failed'
        errorMessage = 'No live selection snapshot is available. Open the document Workbench and sync the editor first.'
        result = { success: false, error: errorMessage, recoverable: true }
      }
    } else if (toolName === 'docx_read_page' || toolName === 'docx_read_pages') {
      const pageResult = readPagesFromSnapshot(snapshot?.pages, toolName, input)
      if (pageResult) {
        result = { success: true, data: pageResult, source: 'snapshot' }
      } else {
        status = 'failed'
        errorMessage = 'No page snapshot is available. Open the document Workbench and sync the editor first.'
        result = { success: false, error: errorMessage, recoverable: true }
      }
    } else {
      status = 'queued'
      result = {
        success: true,
        queued: true,
        message: 'Scroll operation was queued for the Workbench editor.',
        data: input
      }
    }

    const operation = await this.operationRepository.save(
      this.operationRepository.create({
        ...scopedCreate(scope),
        documentId,
        versionId: version.id,
        toolName,
        source: 'agent',
        status,
        input,
        result,
        errorMessage,
        createdById: normalizeOptional(scope.userId)
      })
    )

    return compactAgentToolResponse({
      operation,
      result,
      document,
      version,
      toolName,
      toolInput: input
    })
  }

  private async requireDocument(scope: DocxEditorScope, documentId: string) {
    const document = await this.documentRepository.findOne({
      where: scopedWhere(scope, { id: documentId })
    })
    if (!document) {
      throw new NotFoundException('DOCX document was not found.')
    }
    return document
  }

  private async requireVersion(scope: DocxEditorScope, documentId: string, versionId: string) {
    const version = await this.versionRepository.findOne({
      where: scopedWhere(scope, { id: versionId, documentId })
    })
    if (!version) {
      throw new NotFoundException('DOCX document version was not found.')
    }
    return version
  }

  private async requireCurrentVersion(scope: DocxEditorScope, document: DocxEditorDocument) {
    if (!document.currentVersionId) {
      throw new BadRequestException('DOCX document has no saved version yet.')
    }
    const version = await this.versionRepository.findOne({
      where: scopedWhere(scope, { id: document.currentVersionId, documentId: requireEntityId(document.id, 'Document id is required.') })
    })
    if (!version) {
      throw new NotFoundException('Current DOCX document version was not found.')
    }
    return version
  }

  private async getLatestSnapshot(scope: DocxEditorScope, documentId: string) {
    return this.snapshotRepository.findOne({
      where: scopedWhere(scope, { documentId }),
      order: { updatedAt: 'DESC' }
    })
  }

  private async saveAgentReviewSnapshot(
    scope: DocxEditorScope,
    documentId: string,
    versionId: string,
    reviewSnapshot: { comments?: unknown; changes?: unknown }
  ) {
    if (reviewSnapshot.comments === undefined && reviewSnapshot.changes === undefined) {
      return null
    }

    const document = await this.requireDocument(scope, documentId)
    const previousSnapshot = await this.getLatestSnapshot(scope, documentId)
    const snapshot = await this.snapshotRepository.save(
      this.snapshotRepository.create({
        ...scopedCreate(scope),
        documentId,
        versionId,
        totalPages: 0,
        currentPage: previousSnapshot?.currentPage ?? 0,
        selection: previousSnapshot?.selection ?? null,
        comments: reviewSnapshot.comments === undefined ? previousSnapshot?.comments ?? null : reviewSnapshot.comments ?? null,
        changes: reviewSnapshot.changes === undefined ? previousSnapshot?.changes ?? null : reviewSnapshot.changes ?? null
      })
    )

    await this.documentRepository.save({
      ...document,
      lastSnapshotId: snapshot.id
    })
    return snapshot
  }
}

function readReviewerReviewSnapshot(bridge: EditorBridge) {
  return {
    comments: readReviewerToolData(bridge, 'read_comments'),
    changes: readReviewerToolData(bridge, 'read_changes')
  }
}

function readReviewerToolData(bridge: EditorBridge, toolName: string) {
  try {
    const result = executeToolCall(toolName, {}, bridge)
    return result.success ? result.data ?? [] : undefined
  } catch {
    return undefined
  }
}

function isUsableReviewSnapshot(
  snapshot: DocxEditorSnapshot,
  currentVersionId: string | undefined,
  field: 'comments' | 'changes'
) {
  if (snapshot.versionId !== currentVersionId) {
    return false
  }
  return hasReviewItems(snapshot[field])
}

function hasReviewItems(value: unknown) {
  if (Array.isArray(value)) {
    return value.length > 0
  }
  if (isObject(value)) {
    return Object.keys(value).length > 0
  }
  return false
}

function executeDocxAgentTool(
  toolName: DocxEditorToolName,
  upstreamToolName: string,
  input: Record<string, unknown>,
  bridge: EditorBridge,
  reviewer: DocxReviewer
): DocxAgentToolResult {
  switch (toolName) {
    case 'docx_suggest_change':
      return executeSuggestChangeTool(input, bridge)
    case 'docx_accept_change':
      return executeSingleChangeReviewTool(reviewer, input, 'accept')
    case 'docx_reject_change':
      return executeSingleChangeReviewTool(reviewer, input, 'reject')
    case 'docx_accept_all_changes':
      return executeAllChangesReviewTool(reviewer, input, 'accept')
    case 'docx_reject_all_changes':
      return executeAllChangesReviewTool(reviewer, input, 'reject')
    case 'docx_delete_comment':
      return executeDeleteCommentTool(reviewer, input)
    case 'docx_delete_all_comments':
      return executeDeleteAllCommentsTool(reviewer)
    case 'docx_resolve_all_comments':
      return executeResolveAllCommentsTool(reviewer, bridge)
    default:
      return executeToolCall(upstreamToolName, input, bridge) as DocxAgentToolResult
  }
}

function shouldPersistAgentResult(toolName: DocxEditorToolName, result: DocxAgentToolResult) {
  if (!result.success || !MUTATION_TOOL_NAMES.has(toolName)) {
    return false
  }
  return typeof result.appliedCount === 'number' ? result.appliedCount > 0 : true
}

function executeSingleChangeReviewTool(
  reviewer: DocxReviewer,
  input: Record<string, unknown>,
  action: 'accept' | 'reject'
): DocxAgentToolResult {
  const changeId = getRequiredNumber(input, 'changeId')
  if (changeId === undefined) {
    return {
      success: false,
      error: 'changeId is required.',
      diagnostics: [
        {
          reason: 'missing_change_id',
          hint: 'Call docx_read_changes and pass the numeric changeId.'
        }
      ],
      appliedCount: 0
    }
  }

  const resolved = resolveReviewChangeTarget(reviewer, input, changeId)
  if (!resolved.success) {
    return resolved
  }

  try {
    if (action === 'accept') {
      reviewer.acceptChange(resolved.target as never)
    } else {
      reviewer.rejectChange(resolved.target as never)
    }
    return {
      success: true,
      data: {
        action,
        changeId,
        ...pickPresent(resolved.change ?? {}, ['noteId', 'noteType'])
      },
      appliedCount: 1
    }
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error, `Could not ${action} tracked change ${changeId}.`),
      diagnostics: [
        {
          reason: 'apply_failed',
          changeId,
          hint: 'Call docx_read_changes again and retry with a current changeId, noteId, and noteType when present.'
        }
      ],
      appliedCount: 0
    }
  }
}

function resolveReviewChangeTarget(
  reviewer: DocxReviewer,
  input: Record<string, unknown>,
  changeId: number
):
  | { success: true; target: unknown; change?: ReviewChange }
  | { success: false; error: string; diagnostics: Record<string, unknown>[]; appliedCount: 0 } {
  const noteId = getOptionalNumber(input, 'noteId')
  const noteType = getOptionalString(input, 'noteType')
  const changes = reviewer.getChanges({
    includeFootnotes: true,
    includeEndnotes: true
  })
  const matches = changes.filter((change) => {
    if (change.id !== changeId) {
      return false
    }
    if (noteId !== undefined && change.noteId !== noteId) {
      return false
    }
    if (noteType !== undefined && change.noteType !== noteType) {
      return false
    }
    return true
  })

  if (matches.length === 0) {
    return {
      success: false,
      error: `Tracked change ${changeId} was not found.`,
      diagnostics: [
        {
          reason: 'change_not_found',
          changeId,
          hint: 'Call docx_read_changes again and use a current changeId. For footnotes or endnotes, include noteId and noteType.'
        }
      ],
      appliedCount: 0
    }
  }

  if (matches.length > 1) {
    return {
      success: false,
      error: `Tracked change id ${changeId} is ambiguous across document parts.`,
      diagnostics: [
        {
          reason: 'ambiguous_change_id',
          changeId,
          matches: matches.slice(0, 8).map((change) => compactReviewChangeTarget(change)),
          hint: 'Retry with changeId plus noteId and noteType from docx_read_changes.'
        }
      ],
      appliedCount: 0
    }
  }

  return {
    success: true,
    target: matches[0],
    change: matches[0]
  }
}

function executeAllChangesReviewTool(
  reviewer: DocxReviewer,
  input: Record<string, unknown>,
  action: 'accept' | 'reject'
): DocxAgentToolResult {
  const opts = {
    includeFootnotes: input['includeFootnotes'] === true,
    includeEndnotes: input['includeEndnotes'] === true
  }
  const count = action === 'accept' ? reviewer.acceptAll(opts) : reviewer.rejectAll(opts)
  return {
    success: true,
    data: {
      ...(action === 'accept' ? { acceptedCount: count } : { rejectedCount: count }),
      ...opts
    },
    appliedCount: count
  }
}

function executeDeleteCommentTool(reviewer: DocxReviewer, input: Record<string, unknown>): DocxAgentToolResult {
  const commentId = getRequiredNumber(input, 'commentId')
  if (commentId === undefined) {
    return {
      success: false,
      error: 'commentId is required.',
      diagnostics: [
        {
          reason: 'missing_comment_id',
          hint: 'Call docx_read_comments and pass the numeric commentId.'
        }
      ],
      appliedCount: 0
    }
  }

  const comments = flattenReviewComments(reviewer.getComments())
  if (!comments.some((comment) => getRecordNumber(comment, 'id') === commentId)) {
    return {
      success: false,
      error: `Comment ${commentId} was not found.`,
      diagnostics: [
        {
          reason: 'comment_not_found',
          commentId,
          hint: 'Call docx_read_comments again and use a current commentId.'
        }
      ],
      appliedCount: 0
    }
  }

  try {
    reviewer.removeComment(commentId)
    return {
      success: true,
      data: {
        deletedCount: 1,
        commentId
      },
      appliedCount: 1
    }
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error, `Could not delete comment ${commentId}.`),
      diagnostics: [
        {
          reason: 'delete_failed',
          commentId,
          hint: 'Call docx_read_comments again and retry with a current commentId.'
        }
      ],
      appliedCount: 0
    }
  }
}

function executeDeleteAllCommentsTool(reviewer: DocxReviewer): DocxAgentToolResult {
  const comments = flattenReviewComments(reviewer.getComments())
  if (!comments.length) {
    return {
      success: true,
      data: {
        deletedCount: 0
      },
      appliedCount: 0
    }
  }

  const rootComments = comments.filter((comment) => getRecordNumber(comment, 'parentId') === undefined)
  const targets = rootComments.length ? rootComments : comments
  for (const comment of targets) {
    const commentId = getRecordNumber(comment, 'id')
    if (commentId !== undefined) {
      reviewer.removeComment(commentId)
    }
  }
  return {
    success: true,
    data: {
      deletedCount: comments.length,
      rootDeletedCount: targets.length
    },
    appliedCount: comments.length
  }
}

function executeResolveAllCommentsTool(reviewer: DocxReviewer, bridge: EditorBridge): DocxAgentToolResult {
  const comments = flattenReviewComments(reviewer.getComments()).filter((comment) => comment['done'] !== true)
  if (!comments.length) {
    return {
      success: true,
      data: {
        resolvedCount: 0
      },
      appliedCount: 0
    }
  }

  let resolvedCount = 0
  for (const comment of comments) {
    const commentId = getRecordNumber(comment, 'id')
    if (commentId !== undefined) {
      const result = executeToolCall('resolve_comment', { commentId }, bridge)
      if (result.success) {
        resolvedCount += 1
      }
    }
  }

  return {
    success: true,
    data: {
      resolvedCount
    },
    appliedCount: resolvedCount
  }
}

function executeSuggestChangeTool(input: Record<string, unknown>, bridge: EditorBridge): DocxAgentToolResult {
  const normalized = normalizeSuggestChangeInput(input)
  if (normalized.success === false) {
    return {
      success: false,
      error: 'Invalid docx_suggest_change input.',
      diagnostics: normalized.diagnostics
    }
  }

  const paragraphTexts = getParagraphTextMap(bridge)
  const diagnostics = preflightSuggestChanges(normalized.changes, paragraphTexts)
  if (diagnostics.length) {
    return {
      success: false,
      error: 'Could not apply tracked change suggestions. Fix diagnostics and retry with exact paragraph text.',
      diagnostics,
      appliedCount: 0
    }
  }

  for (let index = 0; index < normalized.changes.length; index += 1) {
    const change = normalized.changes[index]
    const applied = bridge.proposeChange(change)
    if (!applied) {
      return {
        success: false,
        error: 'DOCX editor could not apply one of the tracked change suggestions.',
        diagnostics: [
          {
            index,
            paraId: change.paraId,
            reason: 'apply_failed',
            paragraphText: summarizeParagraphText(paragraphTexts.get(change.paraId)),
            hint: 'Reload the document with docx_read_document or docx_find_text and retry using the latest paraId and exact paragraph text.'
          }
        ],
        appliedCount: index
      }
    }
  }

  return {
    success: true,
    data: {
      changes: normalized.changes.map((change, index) => ({
        index,
        paraId: change.paraId,
        status: 'applied'
      }))
    },
    appliedCount: normalized.changes.length
  }
}

function normalizeSuggestChangeInput(input: Record<string, unknown>):
  | { success: true; changes: SuggestChangeItem[] }
  | { success: false; diagnostics: SuggestChangeDiagnostic[] } {
  const hasBatch = Array.isArray(input['changes'])
  const hasSingle = input['paraId'] !== undefined || input['search'] !== undefined || input['replaceWith'] !== undefined
  if (hasBatch && hasSingle) {
    return {
      success: false,
      diagnostics: [
        {
          index: -1,
          reason: 'mixed_parameters',
          hint: 'Use either paraId/search/replaceWith for one paragraph or changes[] for batch edits; do not mix both forms.'
        }
      ]
    }
  }

  if (hasBatch) {
    const items = input['changes'] as unknown[]
    const diagnostics: SuggestChangeDiagnostic[] = []
    const changes = items
      .map((item, index) => {
        if (!isObject(item)) {
          diagnostics.push({
            index,
            reason: 'invalid_item',
            hint: 'Each changes[] item must include paraId, search, and replaceWith strings.'
          })
          return null
        }
        const change = readSuggestChangeItem(item, index, diagnostics)
        return change
      })
      .filter((item): item is SuggestChangeItem => Boolean(item))

    if (!items.length) {
      diagnostics.push({
        index: -1,
        reason: 'empty_changes',
        hint: 'Provide at least one changes[] item, or use single paraId/search/replaceWith fields.'
      })
    }

    return diagnostics.length ? { success: false, diagnostics } : { success: true, changes }
  }

  const diagnostics: SuggestChangeDiagnostic[] = []
  const change = readSuggestChangeItem(input, 0, diagnostics)
  return diagnostics.length || !change ? { success: false, diagnostics } : { success: true, changes: [change] }
}

function readSuggestChangeItem(
  input: Record<string, unknown>,
  index: number,
  diagnostics: SuggestChangeDiagnostic[]
): SuggestChangeItem | null {
  const paraId = getRequiredString(input, 'paraId')
  const search = getRequiredString(input, 'search')
  const replaceWith = getRequiredString(input, 'replaceWith')
  if (paraId === undefined || search === undefined || replaceWith === undefined) {
    diagnostics.push({
      index,
      paraId,
      reason: 'missing_required_field',
      hint: 'Provide paraId, search, and replaceWith as strings. search may be empty only for insertion.'
    })
    return null
  }
  return {
    paraId,
    search,
    replaceWith
  }
}

function getRequiredString(input: Record<string, unknown>, key: keyof SuggestChangeItem) {
  const value = input[key]
  return typeof value === 'string' ? value : undefined
}

function getRequiredNumber(input: Record<string, unknown>, key: string) {
  const value = input[key]
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

function getOptionalNumber(input: Record<string, unknown>, key: string) {
  if (input[key] === undefined) {
    return undefined
  }
  return getRequiredNumber(input, key)
}

function getOptionalString(input: Record<string, unknown>, key: string) {
  const value = input[key]
  return typeof value === 'string' && value ? value : undefined
}

function compactReviewChangeTarget(change: ReviewChange) {
  return {
    ...pickPresent(change as unknown as Record<string, unknown>, ['id', 'type', 'noteId', 'noteType', 'paragraphIndex']),
    text: truncateText(change.text, FIELD_PREVIEW_MAX_CHARS)
  }
}

function flattenReviewComments(comments: unknown[]) {
  const output: Record<string, unknown>[] = []
  for (const comment of comments) {
    if (!isObject(comment)) {
      continue
    }
    output.push(comment)
    const replies = Array.isArray(comment['replies'])
      ? (comment['replies'] as unknown[])
      : []
    for (const reply of replies) {
      if (!isObject(reply)) {
        continue
      }
      output.push({
        ...reply,
        parentId: comment['id']
      })
    }
  }
  return output
}

function getRecordNumber(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

function getParagraphTextMap(bridge: EditorBridge) {
  const map = new Map<string, string>()
  const content = bridge.getContent({
    includeTrackedChanges: false,
    includeCommentAnchors: false
  })

  for (const block of content) {
    addContentBlockText(map, block)
  }

  const textContent = bridge.getContentAsText({
    includeTrackedChanges: false,
    includeCommentAnchors: false
  })
  for (const line of textContent.split('\n')) {
    const match = line.match(/^\[([^\]]+)\]\s?(.*)$/)
    if (match?.[1] && !map.has(match[1])) {
      map.set(match[1], match[2] ?? '')
    }
  }

  return map
}

function addContentBlockText(map: Map<string, string>, block: ContentBlock) {
  if ('paraId' in block && block.paraId && 'text' in block && typeof block.text === 'string') {
    map.set(block.paraId, block.text)
    return
  }

  if (block.type !== 'table' || !block.cellParaIds) {
    return
  }

  for (let rowIndex = 0; rowIndex < block.cellParaIds.length; rowIndex += 1) {
    const paraIds = block.cellParaIds[rowIndex] ?? []
    for (let cellIndex = 0; cellIndex < paraIds.length; cellIndex += 1) {
      const paraId = paraIds[cellIndex]
      if (paraId) {
        map.set(paraId, block.rows[rowIndex]?.[cellIndex] ?? '')
      }
    }
  }
}

function preflightSuggestChanges(changes: SuggestChangeItem[], paragraphTexts: Map<string, string>) {
  const diagnostics: SuggestChangeDiagnostic[] = []
  for (let index = 0; index < changes.length; index += 1) {
    const change = changes[index]
    const paragraphText = paragraphTexts.get(change.paraId)
    if (paragraphText === undefined) {
      diagnostics.push({
        index,
        paraId: change.paraId,
        reason: 'paraId_not_found',
        hint: 'Call docx_read_document or docx_find_text again and retry with a current paraId.'
      })
      continue
    }

    if (change.search === '') {
      if (!change.replaceWith) {
        diagnostics.push({
          index,
          paraId: change.paraId,
          reason: 'empty_insertion',
          paragraphText: summarizeParagraphText(paragraphText),
          hint: 'When search is empty, replaceWith must be non-empty because the operation is an insertion at paragraph end.'
        })
      }
      continue
    }

    const occurrenceCount = countOccurrences(paragraphText, change.search)
    if (occurrenceCount === 0) {
      diagnostics.push({
        index,
        paraId: change.paraId,
        reason: 'search_not_found',
        paragraphText: summarizeParagraphText(paragraphText),
        hint: 'search must exactly match paragraph plain text. Visual indentation, numbering, and bullet glyphs are usually formatting and should not be included.'
      })
      continue
    }

    if (occurrenceCount > 1) {
      diagnostics.push({
        index,
        paraId: change.paraId,
        reason: 'search_ambiguous',
        paragraphText: summarizeParagraphText(paragraphText),
        hint: 'search matched multiple times in this paragraph. Use a longer exact phrase from the same paragraph.'
      })
    }
  }
  return diagnostics
}

function countOccurrences(value: string, search: string) {
  let count = 0
  let start = 0
  while (start <= value.length) {
    const index = value.indexOf(search, start)
    if (index === -1) {
      break
    }
    count += 1
    start = index + Math.max(search.length, 1)
  }
  return count
}

function summarizeParagraphText(value: string | undefined) {
  if (value === undefined) {
    return undefined
  }
  return value.length > 500 ? `${value.slice(0, 500)}...` : value
}

function compactAgentToolResponse(input: {
  operation: DocxEditorOperation | null
  result: unknown
  version: DocxEditorVersion | null
  document: DocxEditorDocument | null
  toolName?: DocxEditorToolName
  toolInput?: Record<string, unknown>
}): CompactAgentToolResponse {
  return {
    operation: compactOperation(input.operation),
    result: compactResult(input.result, input.toolName, input.toolInput),
    version: compactVersion(input.version),
    document: compactDocument(input.document)
  }
}

function compactOperation(operation: DocxEditorOperation | null) {
  if (!operation) {
    return null
  }
  return {
    id: operation.id,
    status: operation.status,
    toolName: operation.toolName,
    ...(operation.errorMessage ? { errorMessage: operation.errorMessage } : {})
  }
}

function compactVersion(version: DocxEditorVersion | null) {
  if (!version) {
    return null
  }
  return {
    id: version.id
  }
}

function compactDocument(document: DocxEditorDocument | null) {
  if (!document) {
    return null
  }
  return {
    id: document.id
  }
}

function compactResult(result: unknown, toolName?: DocxEditorToolName, toolInput?: Record<string, unknown>) {
  if (!isObject(result)) {
    return result
  }

  const output: Record<string, unknown> = {
    success: result['success'] === true,
    ...pickPresent(result, ['error', 'appliedCount', 'diagnostics', 'source', 'queued', 'recoverable', 'message'])
  }
  if (result['data'] !== undefined) {
    output['data'] = compactResultData(toolName, result['data'], toolInput)
  }
  return output
}

function compactResultData(toolName: DocxEditorToolName | undefined, data: unknown, toolInput?: Record<string, unknown>) {
  switch (toolName) {
    case 'docx_read_document':
      return compactDocumentTextData(data, toolInput)
    case 'docx_find_text':
      return compactFindTextData(data)
    case 'docx_read_comments':
      return compactCommentsData(data)
    case 'docx_read_changes':
      return compactChangesData(data)
    case 'docx_read_selection':
      return compactSelectionData(data)
    case 'docx_read_page':
    case 'docx_read_pages':
      return compactPageData(data, toolName)
    default:
      return compactGenericData(data)
  }
}

function compactDocumentTextData(data: unknown, input?: Record<string, unknown>) {
  if (typeof data !== 'string') {
    return compactGenericData(data)
  }

  const allLines = data.split('\n')
  const fromIndex = typeof input?.['fromIndex'] === 'number' ? input['fromIndex'] : 0
  const selectedLines: string[] = []
  let usedChars = 0
  for (const line of allLines) {
    if (selectedLines.length >= READ_DOCUMENT_MAX_LINES) {
      break
    }
    if (selectedLines.length > 0 && usedChars + line.length + 1 > READ_DOCUMENT_MAX_CHARS) {
      break
    }
    selectedLines.push(line)
    usedChars += line.length + 1
  }

  const truncated = selectedLines.length < allLines.length
  const nextFromIndex = truncated ? fromIndex + selectedLines.length : undefined
  return {
    text: selectedLines.join('\n'),
    fromIndex,
    toIndex: selectedLines.length ? fromIndex + selectedLines.length - 1 : fromIndex,
    returnedLineCount: selectedLines.length,
    availableLineCount: allLines.length,
    truncated,
    ...(nextFromIndex !== undefined
      ? {
          nextFromIndex,
          continueHint: `Call docx_read_document with fromIndex=${nextFromIndex} and toIndex=${nextFromIndex + READ_DOCUMENT_MAX_LINES - 1} to read more.`
        }
      : {})
  }
}

function compactFindTextData(data: unknown) {
  if (typeof data === 'string') {
    return data
  }
  if (!Array.isArray(data)) {
    return compactGenericData(data)
  }

  const items = data.slice(0, FIND_TEXT_MAX_ITEMS).map((item) => {
    if (!isObject(item)) {
      return compactGenericData(item)
    }
    return {
      ...pickPresent(item, ['paraId', 'match']),
      ...(typeof item['before'] === 'string' ? { before: truncateText(item['before'], FIELD_PREVIEW_MAX_CHARS) } : {}),
      ...(typeof item['after'] === 'string' ? { after: truncateText(item['after'], FIELD_PREVIEW_MAX_CHARS) } : {})
    }
  })

  return {
    items,
    returnedCount: items.length,
    availableCount: data.length,
    truncated: data.length > items.length,
    ...(data.length > items.length
      ? { refineHint: 'Increase specificity of query, or call docx_read_document around the returned paraIds.' }
      : {})
  }
}

function compactCommentsData(data: unknown) {
  if (typeof data === 'string') {
    return compactLongText(data)
  }
  if (!Array.isArray(data)) {
    return compactGenericData(data)
  }

  const items = data.slice(0, LIST_RESULT_MAX_ITEMS).map((item) => {
    if (!isObject(item)) {
      return compactGenericData(item)
    }
    const replies = Array.isArray(item['replies']) ? item['replies'] : []
    return {
      ...pickPresent(item, ['id', 'author', 'date', 'done', 'paraId']),
      ...(typeof item['text'] === 'string' ? { text: truncateText(item['text'], FIELD_PREVIEW_MAX_CHARS) } : {}),
      ...(typeof item['anchoredText'] === 'string'
        ? { anchoredText: truncateText(item['anchoredText'], FIELD_PREVIEW_MAX_CHARS) }
        : {}),
      replyCount: replies.length
    }
  })

  return {
    items,
    returnedCount: items.length,
    availableCount: data.length,
    truncated: data.length > items.length,
    ...(data.length > items.length ? { continueHint: 'Use Workbench review panel for the full comment list.' } : {})
  }
}

function compactChangesData(data: unknown) {
  if (typeof data === 'string') {
    return compactLongText(data)
  }
  if (!Array.isArray(data)) {
    return compactGenericData(data)
  }

  const items = data.slice(0, LIST_RESULT_MAX_ITEMS).map((item) => {
    if (!isObject(item)) {
      return compactGenericData(item)
    }
    return {
      ...pickPresent(item, ['id', 'type', 'author', 'date', 'paragraphIndex', 'paraId']),
      ...(typeof item['text'] === 'string' ? { text: truncateText(item['text'], FIELD_PREVIEW_MAX_CHARS) } : {}),
      ...(typeof item['context'] === 'string' ? { context: truncateText(item['context'], FIELD_PREVIEW_MAX_CHARS) } : {})
    }
  })

  return {
    items,
    returnedCount: items.length,
    availableCount: data.length,
    truncated: data.length > items.length,
    ...(data.length > items.length ? { continueHint: 'Use Workbench review panel for the full tracked-change list.' } : {})
  }
}

function compactSelectionData(data: unknown) {
  if (!isObject(data)) {
    return compactGenericData(data)
  }

  return {
    ...pickPresent(data, ['paraId', 'currentPage', 'totalPages']),
    ...(typeof data['selectedText'] === 'string'
      ? { selectedText: truncateText(data['selectedText'], TEXT_PREVIEW_MAX_CHARS) }
      : {}),
    ...(typeof data['paragraphText'] === 'string'
      ? { paragraphText: truncateText(data['paragraphText'], TEXT_PREVIEW_MAX_CHARS) }
      : {}),
    ...(typeof data['before'] === 'string' ? { before: truncateText(data['before'], FIELD_PREVIEW_MAX_CHARS) } : {}),
    ...(typeof data['after'] === 'string' ? { after: truncateText(data['after'], FIELD_PREVIEW_MAX_CHARS) } : {})
  }
}

function compactPageData(data: unknown, toolName: DocxEditorToolName) {
  if (typeof data === 'string') {
    return compactLongText(data, {
      continueHint:
        toolName === 'docx_read_page'
          ? 'Use docx_read_document with paraIds from this page if you need exact paragraph-level context.'
          : 'Use a smaller page range if this page result is truncated.'
    })
  }

  if (Array.isArray(data)) {
    const items = data.slice(0, LIST_RESULT_MAX_ITEMS).map((item) => compactPageItem(item))
    return {
      items,
      returnedCount: items.length,
      availableCount: data.length,
      truncated: data.length > items.length,
      ...(data.length > items.length ? { continueHint: 'Use a smaller page range to read additional pages.' } : {})
    }
  }

  return compactPageItem(data)
}

function compactPageItem(data: unknown) {
  if (!isObject(data)) {
    return compactGenericData(data)
  }
  return {
    ...pickPresent(data, ['pageNumber']),
    ...(typeof data['text'] === 'string' ? compactLongText(data['text']) : {})
  }
}

function compactGenericData(data: unknown): unknown {
  if (typeof data === 'string') {
    return compactLongText(data)
  }
  if (Array.isArray(data)) {
    const items = data.slice(0, LIST_RESULT_MAX_ITEMS).map((item) => compactGenericData(item))
    return {
      items,
      returnedCount: items.length,
      availableCount: data.length,
      truncated: data.length > items.length
    }
  }
  if (isObject(data)) {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, typeof value === 'string' ? truncateText(value, TEXT_PREVIEW_MAX_CHARS) : value])
    )
  }
  return data
}

function compactLongText(value: string, extra?: Record<string, unknown>) {
  const truncated = value.length > TEXT_PREVIEW_MAX_CHARS
  return {
    text: truncateText(value, TEXT_PREVIEW_MAX_CHARS),
    length: value.length,
    truncated,
    ...(truncated ? { continueHint: 'Use a narrower read range or a more specific query to retrieve more detail.' } : {}),
    ...(extra ?? {})
  }
}

function pickPresent(record: Record<string, unknown>, keys: string[]) {
  const output: Record<string, unknown> = {}
  for (const key of keys) {
    if (record[key] !== undefined) {
      output[key] = record[key]
    }
  }
  return output
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

function scopedCreate(scope: DocxEditorScope): ScopedFields & { createdById?: string } {
  return {
    tenantId: normalizeOptional(scope.tenantId),
    organizationId: normalizeOptional(scope.organizationId),
    workspaceId: normalizeOptional(scope.workspaceId),
    projectId: normalizeOptional(scope.projectId),
    createdById: normalizeOptional(scope.userId)
  }
}

function scopedWhere(scope: DocxEditorScope, query: ScopedQuery) {
  const where: Record<string, unknown> = { ...query }
  if (scope.tenantId) {
    where.tenantId = scope.tenantId
  }
  if (scope.organizationId) {
    where.organizationId = scope.organizationId
  }
  if (scope.workspaceId) {
    where.workspaceId = scope.workspaceId
  }
  if (scope.projectId) {
    where.projectId = scope.projectId
  }
  return where
}

function parseDocxBase64(value: string) {
  const normalized = normalizeRequired(value, 'DOCX base64 payload is required.')
  try {
    return Buffer.from(normalized, 'base64')
  } catch {
    throw new BadRequestException('DOCX base64 payload is invalid.')
  }
}

function validateDocxBuffer(buffer: Buffer) {
  if (buffer.byteLength === 0) {
    throw new BadRequestException('DOCX file is empty.')
  }
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new BadRequestException('DOCX file must be a ZIP-based .docx payload.')
  }
}

function extractDocumentFileFields(
  input: SaveDocxVersionInput,
  workspaceFile: { filePath: string; fileUrl?: string; url?: string },
  workspaceScope: DocxWorkspaceFileScope
) {
  return {
    fileName: normalizeOptional(input.fileName),
    mimeType: normalizeOptional(input.mimeType) ?? DOCX_MIME_TYPE,
    size: input.size ?? undefined,
    workspaceFilePath: workspaceFile.filePath,
    workspaceFileUrl: normalizeOptional(workspaceFile.fileUrl) ?? normalizeOptional(workspaceFile.url),
    workspaceCatalog: workspaceScope.catalog,
    workspaceScopeId: workspaceScope.scopeId
  }
}

function resolveDocumentWorkspaceScope(scope: DocxEditorScope, document: DocxEditorDocument): DocxWorkspaceFileScope {
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
    throw new BadRequestException('DOCX workspace storage requires an assistant or project scope.')
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

function resolveVersionWorkspaceScope(scope: DocxEditorScope, version: DocxEditorVersion): DocxWorkspaceFileScope {
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
    throw new BadRequestException('DOCX version workspace scope is missing. Re-upload the document.')
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

function buildDocxVersionFolder(documentId: string) {
  return `files/docx-editor/documents/${normalizePathSegment(documentId, 'Document id is required.')}/versions`
}

function buildDocxVersionFileName(versionNumber: number, checksumValue: string) {
  return `v${versionNumber}-${checksumValue.slice(0, 8)}.docx`
}

function checksum(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function toArrayBuffer(buffer: Buffer) {
  const copy = new Uint8Array(buffer.byteLength)
  copy.set(buffer)
  return copy.buffer
}

function toUpstreamToolName(toolName: DocxEditorToolName) {
  return toolName.replace(/^docx_/, '')
}

function stripDocumentToolInput(input: Record<string, unknown>) {
  const { documentId: _documentId, author: _author, executionTarget: _executionTarget, ...rest } = input
  return rest
}

function shouldQueueWorkbenchLive(target: DocxEditorToolExecutionTarget | undefined, toolName: DocxEditorToolName) {
  return target === 'workbench_live' && WORKBENCH_LIVE_TOOL_NAMES.has(toolName)
}

function sliceSnapshotContent(contentText: string, input: Record<string, unknown>) {
  const fromIndex = typeof input.fromIndex === 'number' ? input.fromIndex : undefined
  const toIndex = typeof input.toIndex === 'number' ? input.toIndex : undefined
  if (fromIndex == null && toIndex == null) {
    return contentText
  }
  const lines = contentText.split('\n')
  const from = Math.max(0, fromIndex ?? 0)
  const to = Math.min(lines.length, (toIndex ?? lines.length - 1) + 1)
  return lines.slice(from, to).join('\n')
}

function readPagesFromSnapshot(pages: unknown, toolName: DocxEditorToolName, input: Record<string, unknown>) {
  if (!Array.isArray(pages)) {
    return null
  }
  if (toolName === 'docx_read_page') {
    const pageNumber = Number(input.pageNumber)
    return pages.find((page) => isObject(page) && Number(page.pageNumber) === pageNumber) ?? null
  }
  const from = Number(input.from)
  const to = Number(input.to)
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return null
  }
  return pages.filter((page) => isObject(page) && Number(page.pageNumber) >= from && Number(page.pageNumber) <= to)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function createTitleFromFileName(fileName?: string | null) {
  const normalized = normalizeOptional(fileName)
  if (!normalized) {
    return 'Untitled DOCX'
  }
  return normalized.replace(/\.docx$/i, '') || 'Untitled DOCX'
}

function requireEntityId(value: string | undefined, message: string) {
  if (!value) {
    throw new BadRequestException(message)
  }
  return value
}

function normalizeRequired(value: string | null | undefined, message: string) {
  const normalized = normalizeOptional(value)
  if (!normalized) {
    throw new BadRequestException(message)
  }
  return normalized
}

function normalizePathSegment(value: string | null | undefined, message: string) {
  const normalized = normalizeRequired(value, message)
  if (normalized.includes('/') || normalized.includes('\\') || normalized === '.' || normalized === '..') {
    throw new BadRequestException('Invalid workspace path segment.')
  }
  return normalized
}

function normalizeOptional(value: string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}
