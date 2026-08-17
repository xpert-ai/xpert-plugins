import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import {
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type AgentMiddlewareRuntimeCapabilityRegistry,
  type WorkspaceFileCatalog,
  type WorkspaceFileScope,
  type WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { XpertQuotationWorkbookVersion } from './entities/index.js'
import { applyExcelOoxmlPatches, applyWorkbookOoxmlEdits, findOccupiedExcelPatchTargets } from './xpert-excel-ooxml-patch.service.js'
import { diffXpertWorkbookSnapshots } from './xpert-workbook.diff.js'
import { convertXlsxToSnapshot, isCurrentXpertWorkbookSnapshot, normalizeImportedExcelWorkbook, readXlsxWorkbook } from './xpert-workbook.xlsx.js'
import type {
  XpertScope,
  OfficeDocumentDetail,
  OfficeExcelCellPatch,
  OfficeImportResult,
  OfficePatchResult,
  OfficeReadResult,
  OfficeSnapshotSaveResult
} from './types.js'

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const LEGACY_OFFICE_WORKBOOK_CAPABILITY = 'office_editor.workbook_patch_capability'

type LegacyOfficeWorkbookCapability = {
  getExcelFile(scope: XpertScope, documentId: string, includeBase64: true): Promise<{
    versionNumber: number
    fileName: string
    fileBase64: string
  }>
  openDocument(scope: XpertScope, documentId: string): Promise<OfficeDocumentDetail>
}

@Injectable()
export class XpertQuotationWorkbookService {
  constructor(
    @InjectRepository(XpertQuotationWorkbookVersion)
    private readonly versionRepository: Repository<XpertQuotationWorkbookVersion>,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: AgentMiddlewareRuntimeCapabilityRegistry,
    @Optional()
    @Inject(LEGACY_OFFICE_WORKBOOK_CAPABILITY)
    private readonly legacyOffice?: LegacyOfficeWorkbookCapability
  ) {}

  async importWorkbook(scope: XpertScope, input: {
    quotationId: string
    title: string
    fileName: string
    mimeType?: string | null
    buffer: Buffer
  }): Promise<OfficeImportResult> {
    const quotationId = requiredId(input.quotationId, 'Quotation id')
    if (await this.versionRepository.count({ where: { ...scopeWhere(scope), quotationId } })) {
      throw new ConflictException('Quotation workbook has already been imported.')
    }
    const normalized = normalizeImportedExcelWorkbook(input.buffer, input.fileName)
    const snapshot = await convertXlsxToSnapshot(normalized.buffer, input.title)
    const version = await this.saveVersion(scope, {
      quotationId,
      expectedCurrentVersion: 0,
      source: 'import',
      fileName: normalized.fileName,
      buffer: normalized.buffer,
      snapshot,
      changeSummary: `Imported quotation workbook ${input.fileName}.`
    })
    return {
      document: { id: quotationId, title: input.title, currentFileVersionNumber: version.versionNumber },
      fileVersion: fileVersionDto(version),
      convertedFromLegacyXls: normalized.convertedFromLegacyXls
    }
  }

  async readExcel(scope: XpertScope, input: {
    documentId: string
    sheetName?: string | null
    range?: string | null
  }): Promise<OfficeReadResult> {
    const version = await this.currentVersion(scope, input.documentId)
    const file = await this.readVersionBuffer(scope, version)
    return {
      documentId: input.documentId,
      fileVersionId: requiredId(version.id, 'Workbook version id'),
      versionNumber: version.versionNumber,
      fileName: version.fileName,
      workbook: readXlsxWorkbook(file, { sheetName: input.sheetName, range: input.range })
    }
  }

  async saveSnapshot(scope: XpertScope, input: {
    documentId: string
    snapshot: unknown
    source: 'workbench'
    changeSummary: string
  }): Promise<OfficeSnapshotSaveResult> {
    if (!isObject(input.snapshot)) throw new BadRequestException('Workbook snapshot is required.')
    const current = await this.ensureCurrentSnapshot(scope, await this.currentVersion(scope, input.documentId))
    const edits = diffXpertWorkbookSnapshots(current.snapshot, input.snapshot)
    if (!edits.length) throw new BadRequestException('The workbook contains no value or formula changes to save.')
    const source = await this.readVersionBuffer(scope, current)
    const patched = await applyWorkbookOoxmlEdits(source, edits)
    const snapshot = await convertXlsxToSnapshot(patched.buffer, stripExtension(current.fileName))
    const version = await this.saveVersion(scope, {
      quotationId: input.documentId,
      expectedCurrentVersion: current.versionNumber,
      source: 'workbench',
      sourceVersionId: requiredId(current.id, 'Source workbook version id'),
      fileName: current.fileName,
      buffer: patched.buffer,
      snapshot,
      changeSummary: input.changeSummary
    })
    return {
      document: { id: input.documentId, currentVersionNumber: version.versionNumber },
      snapshot: { id: version.id, versionNumber: version.versionNumber, snapshot: version.snapshot },
      fileVersion: fileVersionDto(version)
    }
  }

  async patchExcelPreservingFormat(scope: XpertScope, input: {
    documentId: string
    expectedVersionNumber: number
    patches: OfficeExcelCellPatch[]
    changeSummary: string
    idempotencyKey: string
  }): Promise<OfficePatchResult> {
    const idempotencyKey = requiredText(input.idempotencyKey, 'Excel patch idempotencyKey is required.')
    const existing = await this.versionRepository.findOne({
      where: { ...scopeWhere(scope), quotationId: input.documentId, idempotencyKey }
    })
    if (existing) return this.patchResult(existing, true)
    const current = await this.currentVersion(scope, input.documentId)
    if (current.versionNumber !== input.expectedVersionNumber) {
      throw new ConflictException(`Excel file version conflict: expected ${input.expectedVersionNumber}, current version is ${current.versionNumber}.`)
    }
    const source = await this.readVersionBuffer(scope, current)
    const patched = await applyExcelOoxmlPatches(source, input.patches)
    const snapshot = await convertXlsxToSnapshot(patched.buffer, stripExtension(current.fileName))
    const version = await this.saveVersion(scope, {
      quotationId: input.documentId,
      expectedCurrentVersion: current.versionNumber,
      source: 'patch',
      sourceVersionId: requiredId(current.id, 'Source workbook version id'),
      idempotencyKey,
      fileName: current.fileName,
      buffer: patched.buffer,
      snapshot,
      changeSummary: input.changeSummary
    })
    return this.patchResult(version, false)
  }

  async findOccupiedPatchTargets(scope: XpertScope, input: {
    documentId: string
    expectedVersionNumber: number
    patches: OfficeExcelCellPatch[]
  }) {
    const current = await this.currentVersion(scope, input.documentId)
    if (current.versionNumber !== input.expectedVersionNumber) {
      throw new ConflictException(`Excel file version conflict: expected ${input.expectedVersionNumber}, current version is ${current.versionNumber}.`)
    }
    const source = await this.readVersionBuffer(scope, current)
    return {
      versionNumber: current.versionNumber,
      targets: await findOccupiedExcelPatchTargets(source, input.patches)
    }
  }

  async restoreExcelVersion(scope: XpertScope, input: {
    documentId: string
    versionId: string
    expectedVersionNumber?: number | null
    changeSummary?: string | null
  }): Promise<OfficePatchResult> {
    const current = await this.currentVersion(scope, input.documentId)
    if (input.expectedVersionNumber != null && current.versionNumber !== input.expectedVersionNumber) {
      throw new ConflictException(`Excel file version conflict: expected ${input.expectedVersionNumber}, current version is ${current.versionNumber}.`)
    }
    const source = await this.requireVersion(scope, input.documentId, input.versionId)
    const buffer = await this.readVersionBuffer(scope, source)
    const snapshot = await convertXlsxToSnapshot(buffer, stripExtension(source.fileName))
    const version = await this.saveVersion(scope, {
      quotationId: input.documentId,
      expectedCurrentVersion: current.versionNumber,
      source: 'restore',
      sourceVersionId: requiredId(source.id, 'Source workbook version id'),
      fileName: source.fileName,
      buffer,
      snapshot,
      changeSummary: input.changeSummary ?? `Restored quotation workbook version ${source.versionNumber}.`
    })
    return this.patchResult(version, false)
  }

  async getExcelFile(scope: XpertScope, documentId: string) {
    const version = await this.ensureCurrentSnapshot(scope, await this.currentVersion(scope, documentId))
    return {
      documentId,
      fileVersionId: version.id,
      versionNumber: version.versionNumber,
      fileName: version.fileName,
      filePath: version.workspaceFilePath,
      fileUrl: version.workspaceFileUrl ?? '',
      mimeType: version.mimeType,
      size: version.size,
      extension: 'xlsx' as const
    }
  }

  async openDocument(scope: XpertScope, documentId: string): Promise<OfficeDocumentDetail> {
    const version = await this.ensureCurrentSnapshot(scope, await this.currentVersion(scope, documentId))
    return {
      item: {
        id: documentId,
        title: stripExtension(version.fileName),
        documentType: 'spreadsheet',
        currentVersionNumber: version.versionNumber,
        currentFileVersionId: version.id,
        currentFileVersionNumber: version.versionNumber
      },
      currentSnapshot: { id: version.id, snapshot: version.snapshot }
    }
  }

  private async saveVersion(scope: XpertScope, input: {
    quotationId: string
    expectedCurrentVersion: number
    source: XpertQuotationWorkbookVersion['source']
    sourceVersionId?: string
    idempotencyKey?: string
    fileName: string
    buffer: Buffer
    snapshot: object
    changeSummary?: string | null
    versionNumber?: number
  }) {
    const current = await this.versionRepository.findOne({
      where: { ...scopeWhere(scope), quotationId: input.quotationId },
      order: { versionNumber: 'DESC' }
    })
    if ((current?.versionNumber ?? 0) !== input.expectedCurrentVersion) {
      throw new ConflictException(`Quotation workbook changed before a new version could be saved. Current version is ${current?.versionNumber ?? 0}.`)
    }
    const nextVersionNumber = input.versionNumber ?? input.expectedCurrentVersion + 1
    if (!Number.isInteger(nextVersionNumber) || nextVersionNumber <= input.expectedCurrentVersion) {
      throw new BadRequestException('Workbook version number must advance the current version.')
    }
    const digest = checksum(input.buffer)
    const workspaceScope = resolveWorkspaceScope(scope)
    const uploaded = await this.workspaceFiles().uploadBuffer({
      ...workspaceScope,
      buffer: input.buffer,
      originalName: input.fileName,
      mimeType: XLSX_MIME_TYPE,
      size: input.buffer.byteLength,
      folder: `files/xpert-quotation/quotations/${safeSegment(input.quotationId)}/versions`,
      fileName: `v${nextVersionNumber}-${digest.slice(0, 8)}.xlsx`,
      metadata: {
        documentType: 'xpert-quotation-workbook-version',
        quotationId: input.quotationId,
        versionNumber: nextVersionNumber,
        source: input.source
      }
    })
    try {
      return await this.versionRepository.save(this.versionRepository.create({
        ...scopeWhere(scope),
        workspaceId: optionalText(scope.workspaceId),
        projectId: optionalText(scope.projectId),
        quotationId: input.quotationId,
        versionNumber: nextVersionNumber,
        source: input.source,
        workspaceFilePath: uploaded.filePath,
        workspaceFileUrl: uploaded.fileUrl ?? uploaded.url ?? null,
        workspaceCatalog: workspaceScope.catalog as WorkspaceFileCatalog,
        workspaceScopeId: requiredId(workspaceScope.scopeId, 'Workspace scope id'),
        fileName: input.fileName,
        mimeType: XLSX_MIME_TYPE,
        size: input.buffer.byteLength,
        checksum: digest,
        sourceVersionId: optionalText(input.sourceVersionId),
        idempotencyKey: optionalText(input.idempotencyKey),
        changeSummary: optionalText(input.changeSummary),
        snapshot: input.snapshot,
        createdById: optionalText(scope.userId)
      }))
    } catch (error) {
      await this.workspaceFiles().deleteFile({ ...workspaceScope, filePath: uploaded.filePath }).catch(() => undefined)
      throw error
    }
  }

  private async currentVersion(scope: XpertScope, quotationId: string) {
    let version = await this.versionRepository.findOne({
      where: { ...scopeWhere(scope), quotationId },
      order: { versionNumber: 'DESC' }
    })
    if (!version) version = await this.adoptLegacyWorkbook(scope, quotationId)
    if (!version) throw new NotFoundException('Quotation workbook was not found. Re-import the Excel file.')
    return version
  }

  private async ensureCurrentSnapshot(scope: XpertScope, version: XpertQuotationWorkbookVersion) {
    if (isCurrentXpertWorkbookSnapshot(version.snapshot)) return version
    const buffer = await this.readVersionBuffer(scope, version)
    const snapshot = await convertXlsxToSnapshot(buffer, stripExtension(version.fileName))
    return this.versionRepository.save({ ...version, snapshot })
  }

  private async adoptLegacyWorkbook(scope: XpertScope, documentId: string) {
    if (!this.legacyOffice) return null
    let source: Awaited<ReturnType<LegacyOfficeWorkbookCapability['getExcelFile']>>
    let detail: OfficeDocumentDetail
    try {
      ;[source, detail] = await Promise.all([
        this.legacyOffice.getExcelFile(scope, documentId, true),
        this.legacyOffice.openDocument(scope, documentId)
      ])
    } catch {
      return null
    }
    const buffer = Buffer.from(source.fileBase64, 'base64')
    if (!buffer.byteLength) return null
    const title = detail.item?.title?.trim() || stripExtension(source.fileName)
    const snapshot = await convertXlsxToSnapshot(buffer, title)
    try {
      return await this.saveVersion(scope, {
        quotationId: documentId,
        expectedCurrentVersion: 0,
        versionNumber: source.versionNumber,
        source: 'import',
        fileName: source.fileName,
        buffer,
        snapshot,
        changeSummary: 'Adopted a legacy Office Editor workbook into Xpert Quotation storage.'
      })
    } catch (error) {
      const concurrent = await this.versionRepository.findOne({
        where: { ...scopeWhere(scope), quotationId: documentId },
        order: { versionNumber: 'DESC' }
      })
      if (concurrent) return concurrent
      throw error
    }
  }

  private async requireVersion(scope: XpertScope, quotationId: string, versionId: string) {
    const version = await this.versionRepository.findOne({ where: { ...scopeWhere(scope), quotationId, id: versionId } })
    if (!version) throw new NotFoundException('Quotation workbook version was not found.')
    return version
  }

  private async readVersionBuffer(scope: XpertScope, version: XpertQuotationWorkbookVersion) {
    return (await this.workspaceFiles().readBuffer(fileReference(scope, version))).buffer
  }

  private patchResult(version: XpertQuotationWorkbookVersion, replayed: boolean): OfficePatchResult {
    return {
      fileVersion: fileVersionDto(version),
      file: {
        fileName: version.fileName,
        filePath: version.workspaceFilePath,
        fileUrl: version.workspaceFileUrl ?? '',
        mimeType: version.mimeType,
        extension: 'xlsx'
      },
      replayed
    }
  }

  private workspaceFiles(): WorkspaceFilesApi {
    const files = this.runtimeCapabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!files) throw new BadRequestException('Platform Workspace Files capability is required for quotation workbook storage.')
    return files
  }
}

function resolveWorkspaceScope(scope: XpertScope): WorkspaceFileScope & { catalog: WorkspaceFileCatalog; scopeId: string } {
  const projectId = optionalText(scope.projectId)
  if (projectId) return { tenantId: scope.tenantId, userId: scope.userId, catalog: 'projects', scopeId: projectId, projectId }
  const xpertId = optionalText(scope.assistantId) ?? optionalText(scope.workspaceId)
  if (!xpertId) throw new BadRequestException('Quotation XLSX storage requires an assistant, workspace, or project scope.')
  return { tenantId: scope.tenantId, userId: scope.userId, catalog: 'xperts', scopeId: xpertId, xpertId, isolateByUser: false }
}

function fileReference(scope: XpertScope, version: XpertQuotationWorkbookVersion): WorkspaceFileScope & { filePath: string } {
  const common = { tenantId: scope.tenantId, userId: scope.userId, catalog: version.workspaceCatalog, scopeId: version.workspaceScopeId, filePath: version.workspaceFilePath }
  return version.workspaceCatalog === 'projects'
    ? { ...common, projectId: version.workspaceScopeId }
    : { ...common, xpertId: version.workspaceScopeId, isolateByUser: false }
}

function fileVersionDto(version: XpertQuotationWorkbookVersion) {
  return { id: requiredId(version.id, 'Workbook version id'), versionNumber: version.versionNumber, fileName: version.fileName }
}
function scopeWhere(scope: XpertScope) { return { tenantId: requiredText(scope.tenantId, 'Tenant scope is required.'), organizationId: optionalText(scope.organizationId) } }
function requiredText(value: string | null | undefined, message: string) { const normalized = value?.trim(); if (!normalized) throw new BadRequestException(message); return normalized }
function requiredId(value: string | null | undefined, label: string) { return requiredText(value, `${label} is required.`) }
function optionalText(value?: string | null) { return value?.trim() || null }
function checksum(buffer: Buffer) { return createHash('sha256').update(buffer).digest('hex') }
function safeSegment(value: string) { const normalized = value.trim(); if (!/^[A-Za-z0-9._-]+$/.test(normalized)) throw new BadRequestException('Invalid quotation path segment.'); return normalized }
function stripExtension(value: string) { return value.replace(/\.xlsx?$/i, '') || 'Xpert报价' }
function isObject(value: unknown): value is object { return Boolean(value && typeof value === 'object' && !Array.isArray(value)) }
