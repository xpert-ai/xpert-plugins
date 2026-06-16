import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import { Repository } from 'typeorm'
import { createReviewerBridge, DocxReviewer, executeToolCall } from '@eigenpal/docx-editor-agents/server'
import {
  DOCX_EDITOR_LIVE_ONLY_TOOL_NAMES,
  DOCX_EDITOR_MAX_INLINE_DOCX_BYTES,
  DOCX_EDITOR_MUTATION_TOOL_NAMES
} from './constants.js'
import {
  DocxEditorDocument,
  DocxEditorOperation,
  DocxEditorSnapshot,
  DocxEditorVersion
} from './entities/index.js'
import type {
  CompleteDocxOperationInput,
  CreateDocxDocumentInput,
  DocxEditorScope,
  DocxEditorToolName,
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

const MUTATION_TOOL_NAMES = new Set<DocxEditorToolName>(DOCX_EDITOR_MUTATION_TOOL_NAMES)
const LIVE_ONLY_TOOL_NAMES = new Set<DocxEditorToolName>(DOCX_EDITOR_LIVE_ONLY_TOOL_NAMES)

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
    private readonly operationRepository: Repository<DocxEditorOperation>
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
    const version = await this.versionRepository.save(
      this.versionRepository.create({
        ...scopedCreate(scope),
        documentId: input.documentId,
        versionNumber: nextVersionNumber,
        source: input.source ?? 'workbench',
        docxBase64: input.docxBase64,
        size: input.size ?? docxBuffer.byteLength,
        checksum: checksum(docxBuffer),
        changeSummary: normalizeOptional(input.changeSummary),
        operationId: normalizeOptional(input.operationId),
        createdById: normalizeOptional(scope.userId)
      })
    )

    const savedDocument = await this.documentRepository.save({
      ...document,
      ...extractDocumentFileFields(input),
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
    const snapshot = await this.snapshotRepository.save(
      this.snapshotRepository.create({
        ...scopedCreate(scope),
        documentId: input.documentId,
        versionId: normalizeOptional(input.versionId) ?? document.currentVersionId,
        contentText: normalizeOptional(input.contentText),
        paragraphCount: input.paragraphCount ?? 0,
        totalPages: input.totalPages ?? 0,
        currentPage: input.currentPage ?? 0,
        selection: input.selection ?? null,
        comments: input.comments ?? null,
        changes: input.changes ?? null,
        pages: input.pages ?? null
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
    return this.saveDocumentVersion(scope, {
      documentId: input.documentId,
      docxBase64: version.docxBase64,
      size: version.size,
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
      const reviewer = await DocxReviewer.fromBuffer(toArrayBuffer(Buffer.from(version.docxBase64, 'base64')), input.author ?? 'Xpert DOCX Assistant')
      const result = executeToolCall(upstreamToolName, toolInput, createReviewerBridge(reviewer))
      const shouldPersist = result.success && MUTATION_TOOL_NAMES.has(toolName)
      const savedVersion = shouldPersist
        ? await this.saveDocumentVersion(scope, {
            documentId: input.documentId,
            docxBase64: Buffer.from(await reviewer.toBuffer()).toString('base64'),
            source: 'agent',
            changeSummary: `${toolName} applied by agent.`,
            operationId: operation.id
          })
        : null
      const savedOperation = await this.operationRepository.save({
        ...operation,
        status: result.success ? 'applied' : 'failed',
        result,
        errorMessage: result.success ? undefined : normalizeOptional(String(result.error ?? 'DOCX tool failed.'))
      })
      return {
        operation: savedOperation,
        result,
        version: savedVersion?.version ?? version,
        document: savedVersion?.document ?? document
      }
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
      return {
        operation: savedOperation,
        result: {
          success: false,
          error: message
        },
        version,
        document
      }
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
      return {
        item: document,
        currentVersion: versions.find((version) => version.id === document.currentVersionId) ?? versions[0] ?? null,
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
    } else if (toolName === 'docx_read_comments' && snapshot.comments != null) {
      data = snapshot.comments
    } else if (toolName === 'docx_read_changes' && snapshot.changes != null) {
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

    return {
      operation,
      result: {
        success: true,
        data,
        source: 'snapshot'
      },
      document,
      version: document.currentVersionId ? await this.versionRepository.findOne({ where: scopedWhere(scope, { id: document.currentVersionId }) }) : null
    }
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

    return {
      operation,
      result,
      document,
      version
    }
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

function extractDocumentFileFields(input: SaveDocxVersionInput) {
  return {
    fileName: normalizeOptional(input.fileName),
    mimeType: normalizeOptional(input.mimeType),
    size: input.size ?? undefined,
    fileAssetId: normalizeOptional(input.fileAssetId),
    fileId: normalizeOptional(input.fileId),
    storageFileId: normalizeOptional(input.storageFileId)
  }
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
  const { documentId: _documentId, author: _author, ...rest } = input
  return rest
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

function normalizeOptional(value: string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}
