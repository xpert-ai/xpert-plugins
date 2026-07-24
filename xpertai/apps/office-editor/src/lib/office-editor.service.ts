import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID, createHash } from 'node:crypto'
import { Repository } from 'typeorm'
import * as Y from 'yjs'
import {
  XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
import type { AgentMiddlewareRuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import {
  OFFICE_EDITOR_COLLAB_NAMESPACE_PREFIX,
  OFFICE_EDITOR_COLLAB_SESSION_TTL_MS,
  OFFICE_EDITOR_DOCUMENT_TYPES,
  OFFICE_EDITOR_IMPORT_FORMATS,
  OFFICE_EDITOR_OPERATION_TYPES,
  OFFICE_WORKSPACE_FILES_RUNTIME_CAPABILITY
} from './constants.js'
import {
  OfficeDocument,
  OfficeFileVersion,
  OfficeOperation,
  OfficeSnapshot,
  OfficeYjsUpdate
} from './entities/index.js'
import {
  applyExcelOperations,
  exportSpreadsheetSnapshotToXlsx,
  readExcelWorkbook
} from './excel-automation.service.js'
import {
  convertOfficeImport,
  OFFICE_IMPORT_MAX_BYTES
} from './office-import.converters.js'
import type {
  AddOfficeReviewNoteInput,
  CompleteOfficeOperationInput,
  CreateOfficeDocumentInput,
  EditExcelWorkbookInput,
  ImportOfficeDocumentInput,
  OfficeCollabSession,
  OfficeDocumentType,
  OfficeImportFormat,
  OfficeOperationInput,
  OfficeOperationType,
  OfficeScope,
  OfficeWorkspaceFileScope,
  OfficeWorkspaceFilesApi,
  OfficeWorkbenchQuery,
  PrepareOfficeAssistantPromptInput,
  QueueOfficeOperationInput,
  ReadExcelWorkbookInput,
  ReportOfficeFailureInput,
  RestoreExcelVersionInput,
  SaveOfficeSnapshotInput,
  SyncOfficeYjsStateInput
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
  updateHash?: string
  idempotencyKey?: string
}

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

type ExcelFileResult = {
  documentId: string
  fileVersionId?: string
  versionNumber: number
  fileName: string
  filePath: string
  fileUrl: string
  mimeType: string
  size: number
  extension: 'xlsx'
}

@Injectable()
export class OfficeEditorService {
  private readonly collabSessions = new Map<string, OfficeCollabSession>()

  constructor(
    @InjectRepository(OfficeDocument)
    private readonly documentRepository: Repository<OfficeDocument>,
    @InjectRepository(OfficeSnapshot)
    private readonly snapshotRepository: Repository<OfficeSnapshot>,
    @InjectRepository(OfficeYjsUpdate)
    private readonly yjsUpdateRepository: Repository<OfficeYjsUpdate>,
    @InjectRepository(OfficeOperation)
    private readonly operationRepository: Repository<OfficeOperation>,
    @InjectRepository(OfficeFileVersion)
    private readonly fileVersionRepository: Repository<OfficeFileVersion>,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: AgentMiddlewareRuntimeCapabilityRegistry
  ) {}

  async createDocument(scope: OfficeScope, input: CreateOfficeDocumentInput) {
    const documentType = requireDocumentType(input.documentType)
    const title = normalizeRequired(input.title, 'Office document title is required.')
    const snapshot = input.initialSnapshot ?? createDefaultSnapshot(documentType, title)
    const initialYjsStateBase64 = createYjsStateBase64({
      documentId: 'pending',
      documentType,
      snapshot
    })

    const document = await this.documentRepository.save(
      this.documentRepository.create({
        ...scopedCreate(scope),
        documentType,
        title,
        description: normalizeOptional(input.description),
        assistantId: normalizeOptional(input.assistantId) ?? normalizeOptional(scope.assistantId),
        conversationId: normalizeOptional(input.conversationId) ?? normalizeOptional(scope.conversationId),
        status: 'active',
        currentVersionNumber: 0,
        yjsStateBase64: initialYjsStateBase64,
        yjsStateVectorBase64: encodeStateVectorBase64(initialYjsStateBase64),
        createdById: normalizeOptional(scope.userId),
        lastEditedById: normalizeOptional(scope.userId),
        lastEditedAt: new Date()
      })
    )

    const documentId = requireEntityId(document.id, 'Office document id is required.')
    const correctedYjsStateBase64 = createYjsStateBase64({
      documentId,
      documentType,
      snapshot
    })
    return this.saveSnapshot(scope, {
      documentId,
      snapshot,
      snapshotText: normalizeOptional(input.initialSnapshotText) ?? summarizeSnapshotText(documentType, snapshot),
      source: input.source ?? 'system',
      yjsStateBase64: correctedYjsStateBase64,
      yjsStateVectorBase64: encodeStateVectorBase64(correctedYjsStateBase64),
      changeSummary: normalizeOptional(input.changeSummary) ?? 'Initial Office document snapshot.'
    })
  }

  async importDocument(scope: OfficeScope, input: ImportOfficeDocumentInput) {
    const importFormat = requireImportFormat(input.importFormat)
    const documentType = requireDocumentType(input.documentType)
    validateImportFormatDocumentType(importFormat, documentType)

    const fileName = normalizeRequired(input.fileName, 'Office import fileName is required.')
    validateImportFileMetadata(importFormat, fileName, input.mimeType)
    const buffer = parseBase64(input.fileBase64, 'Office import file')
    const declaredSize = typeof input.size === 'number' && Number.isFinite(input.size) ? input.size : buffer.byteLength
    if (declaredSize > OFFICE_IMPORT_MAX_BYTES || buffer.byteLength > OFFICE_IMPORT_MAX_BYTES) {
      throw new BadRequestException('Office import file exceeds the 25MB size limit.')
    }

    const title = normalizeOptional(input.title) ?? stripKnownExtension(fileName, importFormat)
    let conversion
    try {
      conversion = await convertOfficeImport({
        importFormat,
        documentType,
        title,
        fileName,
        mimeType: normalizeOptional(input.mimeType),
        buffer
      })
    } catch (error) {
      await this.operationRepository.save(
        this.operationRepository.create({
          ...scopedCreate(scope),
          operationType: 'import_document',
          source: 'workbench',
          status: 'failed',
          input: {
            importFormat,
            documentType,
            fileName,
            mimeType: normalizeOptional(input.mimeType),
            size: declaredSize
          },
          errorMessage: getErrorMessage(error),
          createdById: normalizeOptional(scope.userId)
        })
      )
      throw error
    }

    const created = await this.createDocument(scope, {
      documentType,
      title,
      description: normalizeOptional(input.description),
      initialSnapshot: conversion.snapshot,
      initialSnapshotText: conversion.snapshotText,
      source: 'import',
      changeSummary: `Imported ${importFormat.toUpperCase()} file ${fileName}.`,
      assistantId: normalizeOptional(input.assistantId) ?? normalizeOptional(scope.assistantId),
      conversationId: normalizeOptional(input.conversationId) ?? normalizeOptional(scope.conversationId)
    })
    const fileVersion = importFormat === 'xlsx'
      ? await this.saveExcelFileVersion(scope, created.document, buffer, {
          fileName,
          source: 'import',
          changeSummary: `Imported XLSX file ${fileName}.`
        })
      : null

    const operation = await this.operationRepository.save(
      this.operationRepository.create({
        ...scopedCreate(scope),
        documentId: created.document.id,
        snapshotId: created.snapshot.id,
        operationType: 'import_document',
        source: 'workbench',
        status: 'applied',
        input: {
          importFormat,
          documentType,
          fileName,
          mimeType: normalizeOptional(input.mimeType),
          size: declaredSize
        },
        result: {
          fidelity: conversion.fidelity,
          warnings: conversion.warnings,
          fileVersionId: fileVersion?.id ?? null
        },
        createdById: normalizeOptional(scope.userId)
      })
    )
    const storedDocument = fileVersion
      ? await this.requireDocument(scope, requireEntityId(created.document.id, 'Office document id is required.'))
      : created.document

    return {
      ...created,
      document: storedDocument,
      fileVersion,
      operation,
      import: {
        importFormat,
        documentType,
        fileName,
        mimeType: normalizeOptional(input.mimeType) ?? null,
        size: declaredSize,
        fidelity: conversion.fidelity,
        warnings: conversion.warnings
      },
      warnings: conversion.warnings
    }
  }

  async readExcel(scope: OfficeScope, input: ReadExcelWorkbookInput) {
    const document = await this.requireSpreadsheet(scope, input.documentId)
    const version = await this.requireCurrentExcelVersion(scope, document)
    const file = await this.readExcelVersionBuffer(scope, version)
    return {
      documentId: document.id,
      fileVersionId: version.id,
      versionNumber: version.versionNumber,
      fileName: version.fileName,
      workbook: readExcelWorkbook(file.buffer, {
        sheetName: normalizeOptional(input.sheetName),
        range: normalizeOptional(input.range)
      })
    }
  }

  async editExcel(scope: OfficeScope, input: EditExcelWorkbookInput) {
    const document = await this.requireSpreadsheet(scope, input.documentId)
    const idempotencyKey = normalizeOptional(input.idempotencyKey)
    if (idempotencyKey) {
      const existing = await this.operationRepository.findOne({
        where: scopedWhere(scope, {
          documentId: input.documentId,
          idempotencyKey
        })
      })
      if (existing?.status === 'applied') {
        const result = existing.result as Record<string, any> | null
        const fileVersionId = normalizeOptional(result?.fileVersionId)
        const version = fileVersionId
          ? await this.requireExcelVersion(scope, input.documentId, fileVersionId)
          : await this.requireCurrentExcelVersion(scope, document)
        return this.buildExcelEditResult(document, version, existing, true)
      }
      if (existing) {
        throw new ConflictException(`Excel operation with idempotencyKey "${idempotencyKey}" is ${existing.status}.`)
      }
    }

    const expectedVersionNumber = normalizeExpectedVersion(input.expectedVersionNumber)
    if (
      expectedVersionNumber !== undefined &&
      expectedVersionNumber !== (document.currentFileVersionNumber ?? 0)
    ) {
      const conflict = await this.operationRepository.save(
        this.operationRepository.create({
          ...scopedCreate(scope),
          documentId: input.documentId,
          snapshotId: document.currentSnapshotId,
          operationType: 'excel_automation',
          source: 'agent',
          status: 'conflict',
          input: {
            expectedVersionNumber,
            actualVersionNumber: document.currentFileVersionNumber ?? 0,
            operations: input.operations
          },
          idempotencyKey,
          errorMessage: 'Excel file version conflict.',
          createdById: normalizeOptional(scope.userId)
        })
      )
      throw new ConflictException(
        `Excel file version conflict: expected ${expectedVersionNumber}, current version is ${document.currentFileVersionNumber ?? 0}. Operation ${conflict.id} was not applied.`
      )
    }

    let operation = await this.operationRepository.save(
      this.operationRepository.create({
        ...scopedCreate(scope),
        documentId: input.documentId,
        snapshotId: document.currentSnapshotId,
        operationType: 'excel_automation',
        source: 'agent',
        status: 'processing',
        input: {
          expectedVersionNumber: expectedVersionNumber ?? document.currentFileVersionNumber ?? 0,
          operations: input.operations
        },
        idempotencyKey,
        createdById: normalizeOptional(scope.userId)
      })
    )

    try {
      const sourceVersion = await this.requireCurrentExcelVersion(scope, document)
      const sourceFile = await this.readExcelVersionBuffer(scope, sourceVersion)
      const edited = applyExcelOperations(sourceFile.buffer, input.operations)
      const conversion = await convertOfficeImport({
        importFormat: 'xlsx',
        documentType: 'spreadsheet',
        title: document.title,
        fileName: sourceVersion.fileName,
        mimeType: XLSX_MIME_TYPE,
        buffer: edited.buffer
      })
      const fileVersion = await this.saveExcelFileVersion(scope, document, edited.buffer, {
        fileName: sourceVersion.fileName,
        source: 'agent',
        sourceVersionId: sourceVersion.id,
        operationId: operation.id,
        changeSummary: normalizeOptional(input.changeSummary) ?? edited.summaries.join(' ')
      })
      const yjsStateBase64 = createYjsStateBase64({
        documentId: input.documentId,
        documentType: 'spreadsheet',
        snapshot: conversion.snapshot
      })
      const saved = await this.saveSnapshot(scope, {
        documentId: input.documentId,
        snapshot: conversion.snapshot,
        snapshotText: conversion.snapshotText,
        source: 'agent',
        yjsStateBase64,
        yjsStateVectorBase64: encodeStateVectorBase64(yjsStateBase64),
        operationId: operation.id,
        changeSummary: normalizeOptional(input.changeSummary) ?? edited.summaries.join(' ')
      })
      operation = await this.operationRepository.save({
        ...operation,
        snapshotId: saved.snapshot.id,
        status: 'applied',
        result: {
          fileVersionId: fileVersion.id,
          fileVersionNumber: fileVersion.versionNumber,
          snapshotId: saved.snapshot.id,
          snapshotVersionNumber: saved.snapshot.versionNumber,
          editedCellCount: edited.editedCellCount,
          summaries: edited.summaries,
          warnings: conversion.warnings
        },
        errorMessage: undefined
      })
      return this.buildExcelEditResult(saved.document, fileVersion, operation, false)
    } catch (error) {
      operation = await this.operationRepository.save({
        ...operation,
        status: 'failed',
        errorMessage: getErrorMessage(error)
      })
      throw error
    }
  }

  async listExcelVersions(scope: OfficeScope, documentId: string) {
    await this.requireSpreadsheet(scope, documentId)
    const items = await this.fileVersionRepository.find({
      where: scopedWhere(scope, { documentId }),
      order: { versionNumber: 'DESC' },
      take: 50
    })
    return { documentId, items }
  }

  async restoreExcelVersion(scope: OfficeScope, input: RestoreExcelVersionInput) {
    const document = await this.requireSpreadsheet(scope, input.documentId)
    const expectedVersionNumber = normalizeExpectedVersion(input.expectedVersionNumber)
    if (
      expectedVersionNumber !== undefined &&
      expectedVersionNumber !== (document.currentFileVersionNumber ?? 0)
    ) {
      throw new ConflictException(
        `Excel file version conflict: expected ${expectedVersionNumber}, current version is ${document.currentFileVersionNumber ?? 0}.`
      )
    }
    const sourceVersion = await this.requireExcelVersion(scope, input.documentId, input.versionId)
    const sourceFile = await this.readExcelVersionBuffer(scope, sourceVersion)
    let operation = await this.operationRepository.save(
      this.operationRepository.create({
        ...scopedCreate(scope),
        documentId: input.documentId,
        snapshotId: document.currentSnapshotId,
        operationType: 'excel_restore',
        source: 'agent',
        status: 'processing',
        input: {
          versionId: input.versionId,
          versionNumber: sourceVersion.versionNumber
        },
        createdById: normalizeOptional(scope.userId)
      })
    )
    try {
      const conversion = await convertOfficeImport({
        importFormat: 'xlsx',
        documentType: 'spreadsheet',
        title: document.title,
        fileName: sourceVersion.fileName,
        mimeType: XLSX_MIME_TYPE,
        buffer: sourceFile.buffer
      })
      const fileVersion = await this.saveExcelFileVersion(scope, document, sourceFile.buffer, {
        fileName: sourceVersion.fileName,
        source: 'restore',
        sourceVersionId: sourceVersion.id,
        operationId: operation.id,
        changeSummary: normalizeOptional(input.changeSummary) ?? `Restored Excel version ${sourceVersion.versionNumber}.`
      })
      const yjsStateBase64 = createYjsStateBase64({
        documentId: input.documentId,
        documentType: 'spreadsheet',
        snapshot: conversion.snapshot
      })
      const saved = await this.saveSnapshot(scope, {
        documentId: input.documentId,
        snapshot: conversion.snapshot,
        snapshotText: conversion.snapshotText,
        source: 'restore',
        yjsStateBase64,
        yjsStateVectorBase64: encodeStateVectorBase64(yjsStateBase64),
        operationId: operation.id,
        changeSummary: normalizeOptional(input.changeSummary) ?? `Restored Excel version ${sourceVersion.versionNumber}.`
      })
      operation = await this.operationRepository.save({
        ...operation,
        snapshotId: saved.snapshot.id,
        status: 'applied',
        result: {
          restoredFromVersionId: sourceVersion.id,
          fileVersionId: fileVersion.id,
          fileVersionNumber: fileVersion.versionNumber,
          snapshotId: saved.snapshot.id
        }
      })
      return this.buildExcelEditResult(saved.document, fileVersion, operation, false)
    } catch (error) {
      await this.operationRepository.save({
        ...operation,
        status: 'failed',
        errorMessage: getErrorMessage(error)
      })
      throw error
    }
  }

  async getExcelFile(scope: OfficeScope, documentId: string, includeBase64: true): Promise<ExcelFileResult & { fileBase64: string }>
  async getExcelFile(scope: OfficeScope, documentId: string, includeBase64?: false): Promise<ExcelFileResult>
  async getExcelFile(scope: OfficeScope, documentId: string, includeBase64 = false): Promise<ExcelFileResult | (ExcelFileResult & { fileBase64: string })> {
    const document = await this.requireSpreadsheet(scope, documentId)
    const version = await this.requireCurrentExcelVersion(scope, document)
    const result: ExcelFileResult = {
      documentId,
      fileVersionId: version.id,
      versionNumber: version.versionNumber,
      fileName: version.fileName,
      filePath: version.workspaceFilePath,
      fileUrl: version.workspaceFileUrl ?? '',
      mimeType: version.mimeType,
      size: version.size,
      extension: 'xlsx'
    }
    if (includeBase64) {
      const file = await this.readExcelVersionBuffer(scope, version)
      return {
        ...result,
        fileBase64: file.buffer.toString('base64')
      }
    }
    return result
  }

  async saveSnapshot(scope: OfficeScope, input: SaveOfficeSnapshotInput) {
    let document = await this.requireDocument(scope, input.documentId)
    const nextVersionNumber = (document.currentVersionNumber ?? 0) + 1
    const yjsStateBase64 = normalizeOptional(input.yjsStateBase64) ?? document.yjsStateBase64
    const yjsStateVectorBase64 = normalizeOptional(input.yjsStateVectorBase64) ?? (yjsStateBase64 ? encodeStateVectorBase64(yjsStateBase64) : document.yjsStateVectorBase64)
    const yjsUpdateCount = await this.countYjsUpdates(scope, input.documentId)

    const snapshot = await this.snapshotRepository.save(
      this.snapshotRepository.create({
        ...scopedCreate(scope),
        documentId: input.documentId,
        versionNumber: nextVersionNumber,
        source: input.source ?? 'workbench',
        snapshot: input.snapshot ?? null,
        snapshotText: normalizeOptional(input.snapshotText) ?? summarizeSnapshotText(document.documentType, input.snapshot),
        yjsStateBase64,
        yjsStateVectorBase64,
        yjsUpdateCount,
        changeSummary: normalizeOptional(input.changeSummary),
        operationId: normalizeOptional(input.operationId),
        createdById: normalizeOptional(scope.userId)
      })
    )
    let fileVersion: OfficeFileVersion | null = null
    if (
      document.documentType === 'spreadsheet' &&
      document.currentFileVersionId &&
      (input.source ?? 'workbench') === 'workbench'
    ) {
      const buffer = exportSpreadsheetSnapshotToXlsx(input.snapshot, document.title)
      fileVersion = await this.saveExcelFileVersion(scope, document, buffer, {
        fileName: document.fileName ?? `${document.title}.xlsx`,
        source: 'workbench',
        operationId: normalizeOptional(input.operationId),
        changeSummary: normalizeOptional(input.changeSummary) ?? 'Saved from Office Editor Workbench.'
      })
      document = await this.requireDocument(scope, input.documentId)
    }

    const savedDocument = await this.documentRepository.save({
      ...document,
      status: 'active',
      currentSnapshotId: snapshot.id,
      currentVersionNumber: nextVersionNumber,
      yjsStateBase64,
      yjsStateVectorBase64,
      lastEditedById: normalizeOptional(scope.userId),
      lastEditedAt: new Date()
    })

    return {
      document: savedDocument,
      snapshot,
      fileVersion
    }
  }

  async syncYjsState(scope: OfficeScope, input: SyncOfficeYjsStateInput) {
    const document = await this.requireDocument(scope, input.documentId)
    const updateBuffer = normalizeOptional(input.updateBase64) ? parseBase64(input.updateBase64, 'Yjs update') : null
    const fullStateBuffer = normalizeOptional(input.fullStateBase64) ? parseBase64(input.fullStateBase64, 'Yjs state') : null
    const updateHash = updateBuffer ? checksum(updateBuffer) : null
    const duplicate = updateHash
      ? await this.yjsUpdateRepository.findOne({
          where: scopedWhere(scope, { documentId: input.documentId, updateHash })
        })
      : null

    const merged = mergeYjsState({
      currentStateBase64: document.yjsStateBase64,
      fullState: fullStateBuffer ?? undefined,
      update: updateBuffer ?? undefined,
      snapshot: input.snapshot,
      documentId: input.documentId,
      documentType: document.documentType
    })

    let savedUpdate: OfficeYjsUpdate | null = duplicate ?? null
    if (updateBuffer && updateHash && !duplicate) {
      const latest = await this.yjsUpdateRepository.findOne({
        where: scopedWhere(scope, { documentId: input.documentId }),
        order: { sequenceNumber: 'DESC' }
      })
      savedUpdate = await this.yjsUpdateRepository.save(
        this.yjsUpdateRepository.create({
          ...scopedCreate(scope),
          documentId: input.documentId,
          sequenceNumber: (latest?.sequenceNumber ?? 0) + 1,
          updateBase64: updateBuffer.toString('base64'),
          updateHash,
          origin: normalizeOptional(input.origin),
          clientId: normalizeOptional(input.clientId),
          createdById: normalizeOptional(scope.userId)
        })
      )
    }

    const savedDocument = await this.documentRepository.save({
      ...document,
      yjsStateBase64: merged.stateBase64,
      yjsStateVectorBase64: normalizeOptional(input.stateVectorBase64) ?? merged.stateVectorBase64,
      lastEditedById: normalizeOptional(scope.userId),
      lastEditedAt: new Date()
    })

    let savedSnapshot: OfficeSnapshot | null = null
    if (input.snapshot !== undefined) {
      const result = await this.saveSnapshot(scope, {
        documentId: input.documentId,
        snapshot: input.snapshot,
        snapshotText: normalizeOptional(input.snapshotText) ?? summarizeSnapshotText(document.documentType, input.snapshot),
        source: 'collaboration',
        yjsStateBase64: merged.stateBase64,
        yjsStateVectorBase64: normalizeOptional(input.stateVectorBase64) ?? merged.stateVectorBase64,
        changeSummary: 'Synchronized from Yjs collaboration state.'
      })
      savedSnapshot = result.snapshot
      return {
        document: result.document,
        snapshot: savedSnapshot,
        update: savedUpdate,
        duplicate: Boolean(duplicate),
        yjsStateBase64: merged.stateBase64,
        yjsStateVectorBase64: merged.stateVectorBase64
      }
    }

    return {
      document: savedDocument,
      snapshot: savedSnapshot,
      update: savedUpdate,
      duplicate: Boolean(duplicate),
      yjsStateBase64: merged.stateBase64,
      yjsStateVectorBase64: merged.stateVectorBase64
    }
  }

  async queueOperation(scope: OfficeScope, input: QueueOfficeOperationInput) {
    const document = await this.requireDocument(scope, input.documentId)
    validateOperationType(input.operationType)
    validateOperationInput(input.operationType, input.input)

    return this.operationRepository.save(
      this.operationRepository.create({
        ...scopedCreate(scope),
        documentId: input.documentId,
        snapshotId: document.currentSnapshotId,
        operationType: input.operationType,
        source: input.source ?? 'agent',
        status: 'queued',
        input: input.input,
        reviewNote: normalizeOptional(input.reviewNote),
        confidence: normalizeConfidence(input.confidence),
        createdById: normalizeOptional(scope.userId)
      })
    )
  }

  async addReviewNote(scope: OfficeScope, input: AddOfficeReviewNoteInput) {
    const document = await this.requireDocument(scope, input.documentId)
    return this.operationRepository.save(
      this.operationRepository.create({
        ...scopedCreate(scope),
        documentId: input.documentId,
        snapshotId: document.currentSnapshotId,
        operationType: 'review_note',
        source: 'agent',
        status: 'queued',
        input: {
          note: normalizeRequired(input.note, 'Review note is required.'),
          target: input.target ?? null
        },
        reviewNote: normalizeRequired(input.note, 'Review note is required.'),
        confidence: normalizeConfidence(input.confidence),
        createdById: normalizeOptional(scope.userId)
      })
    )
  }

  async reportFailure(scope: OfficeScope, input: ReportOfficeFailureInput) {
    const documentId = normalizeOptional(input.documentId)
    if (documentId) {
      await this.requireDocument(scope, documentId)
    }
    return this.operationRepository.save(
      this.operationRepository.create({
        ...scopedCreate(scope),
        documentId,
        operationType: 'failure_report',
        source: 'agent',
        status: 'failed',
        input: {
          documentType: input.documentType ? requireDocumentType(input.documentType) : null,
          title: normalizeOptional(input.title),
          recoverable: Boolean(input.recoverable)
        },
        errorMessage: normalizeRequired(input.reason, 'Failure reason is required.'),
        createdById: normalizeOptional(scope.userId)
      })
    )
  }

  async completeOperation(scope: OfficeScope, input: CompleteOfficeOperationInput) {
    const operation = await this.operationRepository.findOne({
      where: scopedWhere(scope, { id: input.operationId })
    })
    if (!operation) {
      throw new NotFoundException('Office Editor operation was not found.')
    }
    return this.operationRepository.save({
      ...operation,
      status: input.status,
      result: input.result ?? operation.result,
      errorMessage: normalizeOptional(input.errorMessage)
    })
  }

  async deleteDocument(scope: OfficeScope, documentId: string) {
    await this.requireDocument(scope, documentId)
    const fileVersions = await this.fileVersionRepository.find({
      where: scopedWhere(scope, { documentId })
    })
    const workspaceFiles = this.runtimeCapabilities?.get<OfficeWorkspaceFilesApi>(OFFICE_WORKSPACE_FILES_RUNTIME_CAPABILITY)
    if (workspaceFiles) {
      await Promise.all(fileVersions.map(async (version) => {
        try {
          await workspaceFiles.deleteFile({
            ...resolveFileVersionWorkspaceScope(scope, version),
            filePath: version.workspaceFilePath
          })
        } catch {
          // Best-effort file cleanup; scoped database records are still removed below.
        }
      }))
    }
    await this.operationRepository.delete(scopedWhere(scope, { documentId }))
    await this.yjsUpdateRepository.delete(scopedWhere(scope, { documentId }))
    await this.snapshotRepository.delete(scopedWhere(scope, { documentId }))
    await this.fileVersionRepository.delete(scopedWhere(scope, { documentId }))
    await this.documentRepository.delete(scopedWhere(scope, { id: documentId }))
    return {
      deleted: true,
      documentId
    }
  }

  async prepareAssistantPrompt(scope: OfficeScope, input: PrepareOfficeAssistantPromptInput) {
    const document = await this.requireDocument(scope, input.documentId)
    const instruction = normalizeOptional(input.instruction) ?? '请审阅当前 Office 文档，并将需要修改的内容排队到 Workbench 中由人工确认。'
    return {
      commandKey: 'assistant.chat.send_message',
      payload: {
        text: [
          `当前 Office 文档 id: ${document.id}`,
          `类型: ${document.documentType}`,
          `标题: ${document.title}`,
          `当前版本: ${document.currentVersionNumber ?? 0}`,
          '',
          instruction,
          '',
          '请先调用 office_read_document 理解当前内容，再使用 office_queue_edit 或 office_add_review_note。排队的修改需要打开 Office Editor Workbench 后应用。'
        ].join('\n')
      },
      documentId: document.id
    }
  }

  async getWorkbenchData(scope: OfficeScope, query: OfficeWorkbenchQuery) {
    if (query.documentId) {
      return this.getDocumentDetail(scope, query.documentId)
    }

    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20))
    const where = scopedWhere(scope, {})
    if (query.documentType) {
      where.documentType = requireDocumentType(query.documentType)
    }
    const [items, total] = await this.documentRepository.findAndCount({
      where,
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
    const normalizedSearch = normalizeOptional(query.search)?.toLowerCase()
    const filteredItems = normalizedSearch
      ? items.filter((item) => item.title?.toLowerCase().includes(normalizedSearch))
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

  async openDocument(scope: OfficeScope, documentId: string) {
    const detail = await this.getDocumentDetail(scope, documentId)
    return {
      ...detail,
      collab: this.createCollabSession(scope, documentId)
    }
  }

  createCollabSession(scope: OfficeScope, documentId: string) {
    this.cleanupExpiredCollabSessions()
    const sessionId = randomUUID()
    const session: OfficeCollabSession = {
      sessionId,
      documentId,
      scope: { ...scope },
      userId: normalizeOptional(scope.userId),
      expiresAt: Date.now() + OFFICE_EDITOR_COLLAB_SESSION_TTL_MS
    }
    this.collabSessions.set(sessionId, session)
    return {
      sessionId,
      documentId,
      namespace: `${OFFICE_EDITOR_COLLAB_NAMESPACE_PREFIX}${encodeURIComponent(documentId)}`,
      expiresAt: session.expiresAt
    }
  }

  resolveCollabSession(sessionId: string | undefined, documentId?: string | null) {
    this.cleanupExpiredCollabSessions()
    const normalizedSessionId = normalizeOptional(sessionId)
    if (!normalizedSessionId) {
      return null
    }
    const session = this.collabSessions.get(normalizedSessionId)
    if (!session || session.expiresAt < Date.now()) {
      if (session) {
        this.collabSessions.delete(normalizedSessionId)
      }
      return null
    }
    if (documentId && session.documentId !== documentId) {
      return null
    }
    session.expiresAt = Date.now() + OFFICE_EDITOR_COLLAB_SESSION_TTL_MS
    return session
  }

  async getDocumentForCollab(session: OfficeCollabSession) {
    const detail = await this.getDocumentDetail(session.scope, session.documentId)
    return {
      document: detail.item,
      snapshot: detail.currentSnapshot,
      yjsStateBase64: detail.item?.yjsStateBase64 ?? detail.currentSnapshot?.yjsStateBase64
    }
  }

  async persistCollabUpdate(session: OfficeCollabSession, input: Omit<SyncOfficeYjsStateInput, 'documentId'>) {
    return this.syncYjsState(session.scope, {
      ...input,
      documentId: session.documentId
    })
  }

  private async getDocumentDetail(scope: OfficeScope, documentId: string) {
    const document = await this.requireDocument(scope, documentId)
    const [snapshots, operations, fileVersions] = await Promise.all([
      this.snapshotRepository.find({
        where: scopedWhere(scope, { documentId }),
        order: { versionNumber: 'DESC' },
        take: 20
      }),
      this.operationRepository.find({
        where: scopedWhere(scope, { documentId }),
        order: { createdAt: 'DESC' },
        take: 30
      }),
      this.fileVersionRepository.find({
        where: scopedWhere(scope, { documentId }),
        order: { versionNumber: 'DESC' },
        take: 20
      })
    ])
    const currentSnapshot =
      snapshots.find((snapshot) => snapshot.id === document.currentSnapshotId) ??
      snapshots[0] ??
      null

    return {
      item: document,
      currentSnapshot,
      snapshots,
      operations,
      fileVersions
    }
  }

  private async requireDocument(scope: OfficeScope, documentId: string) {
    const document = await this.documentRepository.findOne({
      where: scopedWhere(scope, { id: documentId })
    })
    if (!document) {
      throw new NotFoundException('Office Editor document was not found.')
    }
    return document
  }

  private async requireSpreadsheet(scope: OfficeScope, documentId: string) {
    const document = await this.requireDocument(scope, documentId)
    if (document.documentType !== 'spreadsheet') {
      throw new BadRequestException('Excel automation requires a spreadsheet document.')
    }
    return document
  }

  private async requireCurrentExcelVersion(scope: OfficeScope, document: OfficeDocument) {
    if (!document.id || !document.currentFileVersionId) {
      throw new BadRequestException('Spreadsheet has no XLSX file version. Import an XLSX file before using Excel automation.')
    }
    return this.requireExcelVersion(scope, document.id, document.currentFileVersionId)
  }

  private async requireExcelVersion(scope: OfficeScope, documentId: string, versionId: string) {
    const version = await this.fileVersionRepository.findOne({
      where: scopedWhere(scope, { id: versionId, documentId })
    })
    if (!version) {
      throw new NotFoundException('Excel file version was not found.')
    }
    return version
  }

  private workspaceFiles() {
    const files = this.runtimeCapabilities?.get<OfficeWorkspaceFilesApi>(OFFICE_WORKSPACE_FILES_RUNTIME_CAPABILITY)
    if (!files) {
      throw new BadRequestException('Xpert workspace file runtime capability is required for XLSX storage.')
    }
    return files
  }

  private async readExcelVersionBuffer(scope: OfficeScope, version: OfficeFileVersion) {
    return this.workspaceFiles().readBuffer({
      ...resolveFileVersionWorkspaceScope(scope, version),
      filePath: version.workspaceFilePath
    })
  }

  private async saveExcelFileVersion(
    scope: OfficeScope,
    document: OfficeDocument,
    buffer: Buffer,
    input: {
      fileName: string
      source: 'import' | 'agent' | 'workbench' | 'restore'
      sourceVersionId?: string
      operationId?: string
      changeSummary?: string
    }
  ) {
    const documentId = requireEntityId(document.id, 'Office document id is required.')
    const sourceFileVersionId = document.currentFileVersionId ?? null
    let currentDocument = await this.requireDocument(scope, documentId)
    if ((currentDocument.currentFileVersionId ?? null) !== sourceFileVersionId) {
      throw new ConflictException(
        `Excel file changed before the new version could be written. Current version is ${currentDocument.currentFileVersionNumber ?? 0}.`
      )
    }
    const nextVersionNumber = (currentDocument.currentFileVersionNumber ?? 0) + 1
    const checksumValue = checksum(buffer)
    const workspaceScope = resolveDocumentWorkspaceScope(scope, currentDocument)
    const uploaded = await this.workspaceFiles().uploadBuffer({
      ...workspaceScope,
      buffer,
      originalName: input.fileName,
      mimeType: XLSX_MIME_TYPE,
      size: buffer.byteLength,
      folder: buildExcelVersionFolder(documentId),
      fileName: buildExcelVersionFileName(nextVersionNumber, checksumValue),
      metadata: {
        documentType: 'office-editor-xlsx-version',
        documentId,
        versionNumber: nextVersionNumber,
        source: input.source
      }
    })
    let persistedVersion: OfficeFileVersion | null = null
    try {
      currentDocument = await this.requireDocument(scope, documentId)
      if ((currentDocument.currentFileVersionId ?? null) !== sourceFileVersionId) {
        throw new ConflictException(
          `Excel file changed while the new version was being written. Current version is ${currentDocument.currentFileVersionNumber ?? 0}.`
        )
      }
      const version = await this.fileVersionRepository.save(
        this.fileVersionRepository.create({
          ...scopedCreate(scope),
          documentId,
          versionNumber: nextVersionNumber,
          source: input.source,
          workspaceFilePath: uploaded.filePath,
          workspaceFileUrl: normalizeOptional(uploaded.fileUrl) ?? normalizeOptional(uploaded.url),
          workspaceCatalog: workspaceScope.catalog,
          workspaceScopeId: workspaceScope.scopeId,
          fileName: input.fileName,
          mimeType: XLSX_MIME_TYPE,
          size: buffer.byteLength,
          checksum: checksumValue,
          sourceVersionId: normalizeOptional(input.sourceVersionId),
          operationId: normalizeOptional(input.operationId),
          changeSummary: normalizeOptional(input.changeSummary),
          createdById: normalizeOptional(scope.userId)
        })
      )
      persistedVersion = version
      await this.documentRepository.save({
        ...currentDocument,
        fileName: input.fileName,
        mimeType: XLSX_MIME_TYPE,
        size: buffer.byteLength,
        workspaceFilePath: uploaded.filePath,
        workspaceFileUrl: normalizeOptional(uploaded.fileUrl) ?? normalizeOptional(uploaded.url),
        workspaceCatalog: workspaceScope.catalog,
        workspaceScopeId: workspaceScope.scopeId,
        currentFileVersionId: version.id,
        currentFileVersionNumber: nextVersionNumber,
        lastEditedById: normalizeOptional(scope.userId),
        lastEditedAt: new Date()
      })
      return version
    } catch (error) {
      if (persistedVersion?.id) {
        try {
          await this.fileVersionRepository.delete(scopedWhere(scope, { id: persistedVersion.id }))
        } catch {
          // Best-effort rollback of a file version whose document pointer was not committed.
        }
      }
      try {
        await this.workspaceFiles().deleteFile({
          ...workspaceScope,
          filePath: uploaded.filePath
        })
      } catch {
        // The primary error is more actionable; orphan cleanup remains best-effort.
      }
      throw error
    }
  }

  private buildExcelEditResult(
    document: OfficeDocument,
    version: OfficeFileVersion,
    operation: OfficeOperation,
    replayed: boolean
  ) {
    return {
      document,
      fileVersion: version,
      operation,
      replayed,
      file: {
        fileName: version.fileName,
        filePath: version.workspaceFilePath,
        fileUrl: version.workspaceFileUrl ?? '',
        mimeType: version.mimeType,
        extension: 'xlsx'
      }
    }
  }

  private async countYjsUpdates(scope: OfficeScope, documentId: string) {
    const updates = await this.yjsUpdateRepository.find({
      where: scopedWhere(scope, { documentId })
    })
    return updates.length
  }

  private cleanupExpiredCollabSessions() {
    const now = Date.now()
    for (const [sessionId, session] of this.collabSessions.entries()) {
      if (session.expiresAt < now) {
        this.collabSessions.delete(sessionId)
      }
    }
  }
}

function scopedCreate(scope: OfficeScope): ScopedFields & { createdById?: string } {
  return {
    tenantId: normalizeOptional(scope.tenantId),
    organizationId: normalizeOptional(scope.organizationId),
    workspaceId: normalizeOptional(scope.workspaceId),
    projectId: normalizeOptional(scope.projectId),
    createdById: normalizeOptional(scope.userId)
  }
}

function scopedWhere(scope: OfficeScope, query: ScopedQuery) {
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

function requireDocumentType(value: string): OfficeDocumentType {
  if ((OFFICE_EDITOR_DOCUMENT_TYPES as readonly string[]).includes(value)) {
    return value as OfficeDocumentType
  }
  throw new BadRequestException(`Unsupported Office documentType: ${value}`)
}

function requireImportFormat(value: string): OfficeImportFormat {
  if ((OFFICE_EDITOR_IMPORT_FORMATS as readonly string[]).includes(value)) {
    return value as OfficeImportFormat
  }
  throw new BadRequestException(`Unsupported Office importFormat: ${value}`)
}

function validateImportFormatDocumentType(importFormat: OfficeImportFormat, documentType: OfficeDocumentType) {
  const expectedDocumentTypeByFormat: Record<OfficeImportFormat, OfficeDocumentType> = {
    xlsx: 'spreadsheet',
    docx: 'document',
    pptx: 'presentation'
  }
  const expected = expectedDocumentTypeByFormat[importFormat]
  if (documentType !== expected) {
    throw new BadRequestException(`Office importFormat ${importFormat} requires documentType ${expected}.`)
  }
}

function validateImportFileMetadata(importFormat: OfficeImportFormat, fileName: string, mimeType: unknown) {
  const lowerFileName = fileName.toLowerCase()
  if (!lowerFileName.endsWith(`.${importFormat}`)) {
    throw new BadRequestException(`Office ${importFormat.toUpperCase()} import requires a .${importFormat} file.`)
  }
  const normalizedMimeType = normalizeOptional(mimeType)?.toLowerCase()
  if (!normalizedMimeType || normalizedMimeType === 'application/octet-stream') {
    return
  }
  const allowedMimeTypes: Record<OfficeImportFormat, string[]> = {
    xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation']
  }
  if (!allowedMimeTypes[importFormat].includes(normalizedMimeType)) {
    throw new BadRequestException(`Office ${importFormat.toUpperCase()} import received an incompatible MIME type: ${normalizedMimeType}.`)
  }
}

function validateOperationType(value: string): asserts value is OfficeOperationType {
  if (!(OFFICE_EDITOR_OPERATION_TYPES as readonly string[]).includes(value)) {
    throw new BadRequestException(`Unsupported Office operationType: ${value}`)
  }
}

function validateOperationInput(operationType: OfficeOperationType, input: OfficeOperationInput) {
  if (!input || input.operationType !== operationType) {
    throw new BadRequestException('Office operation input must include the matching operationType discriminator.')
  }
}

function normalizeRequired(value: string | null | undefined, message: string) {
  const normalized = normalizeOptional(value)
  if (!normalized) {
    throw new BadRequestException(message)
  }
  return normalized
}

function normalizeOptional(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeConfidence(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }
  return Math.max(0, Math.min(1, value))
}

function requireEntityId(value: string | undefined, message: string) {
  if (!value) {
    throw new BadRequestException(message)
  }
  return value
}

function parseBase64(value: string, label: string) {
  try {
    const buffer = Buffer.from(value, 'base64')
    if (!buffer.byteLength) {
      throw new Error('empty')
    }
    return buffer
  } catch {
    throw new BadRequestException(`${label} must be a non-empty base64 value.`)
  }
}

function checksum(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function stripKnownExtension(fileName: string, importFormat: OfficeImportFormat) {
  const escaped = importFormat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const title = fileName.replace(new RegExp(`\\.${escaped}$`, 'i'), '').trim()
  return title || `Imported ${importFormat.toUpperCase()} document`
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'Office operation failed.'
}

function normalizeExpectedVersion(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return undefined
  }
  if (!Number.isInteger(value) || value < 1) {
    throw new BadRequestException('expectedVersionNumber must be a positive integer.')
  }
  return value
}

function resolveDocumentWorkspaceScope(scope: OfficeScope, document: OfficeDocument): OfficeWorkspaceFileScope {
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
    throw new BadRequestException('XLSX workspace storage requires an assistant or project scope.')
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

function resolveFileVersionWorkspaceScope(
  scope: OfficeScope,
  version: OfficeFileVersion
): OfficeWorkspaceFileScope {
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
  throw new BadRequestException('Excel file version workspace scope is missing. Re-import the XLSX file.')
}

function buildExcelVersionFolder(documentId: string) {
  return `files/office-editor/documents/${normalizePathSegment(documentId)}/excel-versions`
}

function buildExcelVersionFileName(versionNumber: number, checksumValue: string) {
  return `v${versionNumber}-${checksumValue.slice(0, 8)}.xlsx`
}

function normalizePathSegment(value: string) {
  const normalized = value.trim()
  if (!normalized || !/^[A-Za-z0-9._-]+$/.test(normalized)) {
    throw new BadRequestException('Invalid Office document path segment.')
  }
  return normalized
}

function createDefaultSnapshot(documentType: OfficeDocumentType, title: string) {
  const unitId = randomUUID()
  if (documentType === 'spreadsheet') {
    const sheetId = randomUUID()
    return {
      id: unitId,
      name: title,
      sheetOrder: [sheetId],
      sheets: {
        [sheetId]: {
          id: sheetId,
          name: 'Sheet1',
          rowCount: 100,
          columnCount: 26,
          cellData: {}
        }
      }
    }
  }
  if (documentType === 'document') {
    return {
      id: unitId,
      title,
      body: {
        dataStream: '\r\n',
        textRuns: [],
        paragraphs: []
      }
    }
  }
  return {
    id: unitId,
    title,
    pageSize: {
      width: 960,
      height: 540
    },
    body: {
      pageOrder: [],
      pages: {}
    }
  }
}

function createYjsStateBase64(input: {
  documentId: string
  documentType: OfficeDocumentType
  snapshot: unknown
}) {
  const doc = new Y.Doc()
  const map = doc.getMap('office')
  map.set('documentId', input.documentId)
  map.set('documentType', input.documentType)
  map.set('snapshot', input.snapshot ?? {})
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64')
}

function encodeStateVectorBase64(stateBase64: string) {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, Buffer.from(stateBase64, 'base64'))
  return Buffer.from(Y.encodeStateVector(doc)).toString('base64')
}

function mergeYjsState(input: {
  currentStateBase64?: string | null
  fullState?: Buffer
  update?: Buffer
  snapshot?: unknown
  documentId: string
  documentType: OfficeDocumentType
}) {
  const doc = new Y.Doc()
  const current = normalizeOptional(input.currentStateBase64)
  if (current) {
    Y.applyUpdate(doc, Buffer.from(current, 'base64'))
  } else {
    const map = doc.getMap('office')
    map.set('documentId', input.documentId)
    map.set('documentType', input.documentType)
  }
  if (input.fullState) {
    Y.applyUpdate(doc, input.fullState)
  }
  if (input.update) {
    Y.applyUpdate(doc, input.update)
  }
  if (input.snapshot !== undefined) {
    const map = doc.getMap('office')
    map.set('documentId', input.documentId)
    map.set('documentType', input.documentType)
    map.set('snapshot', input.snapshot)
  }
  return {
    stateBase64: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
    stateVectorBase64: Buffer.from(Y.encodeStateVector(doc)).toString('base64')
  }
}

function summarizeSnapshotText(documentType: string | undefined, snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object') {
    return ''
  }
  if (documentType === 'document') {
    const body = (snapshot as Record<string, any>).body
    return typeof body?.dataStream === 'string' ? body.dataStream.slice(0, 10000) : ''
  }
  if (documentType === 'spreadsheet') {
    return summarizeSpreadsheetSnapshot(snapshot)
  }
  if (documentType === 'presentation') {
    return summarizePresentationSnapshot(snapshot)
  }
  return JSON.stringify(snapshot).slice(0, 10000)
}

function summarizeSpreadsheetSnapshot(snapshot: unknown) {
  const sheets = (snapshot as Record<string, any>).sheets
  if (!sheets || typeof sheets !== 'object') {
    return ''
  }
  const lines: string[] = []
  for (const sheet of Object.values(sheets as Record<string, any>)) {
    lines.push(`# ${sheet?.name ?? 'Sheet'}`)
    const cellData = sheet?.cellData ?? {}
    for (const [rowIndex, row] of Object.entries(cellData as Record<string, any>)) {
      for (const [columnIndex, cell] of Object.entries(row as Record<string, any>)) {
        const value = cell?.v ?? cell?.f ?? ''
        if (value !== '') {
          lines.push(`R${Number(rowIndex) + 1}C${Number(columnIndex) + 1}: ${String(value)}`)
        }
      }
    }
  }
  return lines.join('\n').slice(0, 10000)
}

function summarizePresentationSnapshot(snapshot: unknown) {
  const pages =
    (snapshot as Record<string, any>).body?.pages ??
    (snapshot as Record<string, any>).slides
  if (!pages || typeof pages !== 'object') {
    return ''
  }
  return Object.values(pages as Record<string, any>)
    .map((slide: any, index) => `Slide ${index + 1}: ${slide?.title ?? slide?.id ?? ''}`)
    .join('\n')
    .slice(0, 10000)
}
