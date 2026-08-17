jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, tableKey: string) => `plugin_${namespace}_${tableKey}`,
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' },
  XPERT_RUNTIME_CAPABILITIES_TOKEN: 'XPERT_RUNTIME_CAPABILITIES'
}))

import JSZip from 'jszip'
import { createRequire } from 'node:module'
import { WorkspaceFilesRuntimeCapability } from '@xpert-ai/plugin-sdk'
import { XpertQuotationWorkbookService } from './xpert-quotation-workbook.service.js'
import type { XpertQuotationWorkbookVersion } from './entities/index.js'
import { XPERT_WORKBOOK_SNAPSHOT_IMPORTER } from './xpert-workbook.ooxml.js'

const XLSX = createRequire(import.meta.url)('xlsx') as typeof import('xlsx')

describe('XpertQuotationWorkbookService', () => {
  it('imports, reads, patches, replays, and restores internal workbook versions', async () => {
    const repository = new VersionRepository()
    const files = new MemoryWorkspaceFiles()
    const service = createService(repository, files)
    const imported = await service.importWorkbook(scope(), {
      quotationId: 'quotation-1', title: '测试报价', fileName: '测试报价.xlsx', buffer: await createWorkbook()
    })

    expect(imported.fileVersion).toEqual(expect.objectContaining({ versionNumber: 1 }))
    expect((await service.readExcel(scope(), { documentId: 'quotation-1' })).workbook.sheets).toEqual([
      expect.objectContaining({ name: '报价表' })
    ])

    const input = {
      documentId: 'quotation-1', expectedVersionNumber: 1,
      patches: [{ sheetName: '报价表', address: 'I8', kind: 'number' as const, value: '12.35', expectedCellState: { kind: 'empty' as const } }],
      changeSummary: '写入审核价格', idempotencyKey: 'quotation-1:v1'
    }
    const patched = await service.patchExcelPreservingFormat(scope(), input)
    const replayed = await service.patchExcelPreservingFormat(scope(), input)
    expect(patched).toEqual(expect.objectContaining({ replayed: false, fileVersion: expect.objectContaining({ versionNumber: 2 }) }))
    expect(replayed).toEqual(expect.objectContaining({ replayed: true, fileVersion: expect.objectContaining({ versionNumber: 2 }) }))
    const read = await service.readExcel(scope(), { documentId: 'quotation-1', sheetName: '报价表', range: 'H8:J8' })
    expect(read.workbook.rows?.[0]?.[1]?.value).toBe(12.35)

    const restored = await service.restoreExcelVersion(scope(), {
      documentId: 'quotation-1', versionId: imported.fileVersion?.id ?? '', expectedVersionNumber: 2
    })
    expect(restored.fileVersion.versionNumber).toBe(3)
    expect((await service.readExcel(scope(), { documentId: 'quotation-1', sheetName: '报价表', range: 'I8:I8' })).workbook.rows?.[0]?.[0]?.value).toBeNull()
  })

  it('converts a legacy XLS upload into the canonical XLSX workbook pipeline', async () => {
    const repository = new VersionRepository()
    const files = new MemoryWorkspaceFiles()
    const service = createService(repository, files)

    const imported = await service.importWorkbook(scope(), {
      quotationId: 'quotation-xls',
      title: '旧格式报价',
      fileName: '旧格式报价.xls',
      mimeType: 'application/vnd.ms-excel',
      buffer: createLegacyXlsWorkbook()
    })

    expect(imported).toEqual(expect.objectContaining({
      convertedFromLegacyXls: true,
      fileVersion: expect.objectContaining({ fileName: '旧格式报价.xlsx', versionNumber: 1 })
    }))
    expect(repository.items[0]).toEqual(expect.objectContaining({
      fileName: '旧格式报价.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }))
    expect((await service.readExcel(scope(), {
      documentId: 'quotation-xls', sheetName: '旧报价', range: 'A1:B2'
    })).workbook.rows).toEqual([
      [expect.objectContaining({ value: '项目' }), expect.objectContaining({ value: '工程量' })],
      [expect.objectContaining({ value: '平整场地' }), expect.objectContaining({ value: 12.5 })]
    ])
    expect(files.bufferFor(repository.items[0].workspaceFilePath).subarray(0, 2).toString()).toBe('PK')
  })

  it('allows the same idempotency key to be retried after a failed patch', async () => {
    const service = createService(new VersionRepository(), new MemoryWorkspaceFiles())
    await service.importWorkbook(scope(), {
      quotationId: 'quotation-2', title: '测试报价', fileName: '测试报价.xlsx', buffer: await createWorkbook()
    })
    await expect(service.patchExcelPreservingFormat(scope(), {
      documentId: 'quotation-2', expectedVersionNumber: 1,
      patches: [{ sheetName: '报价表', address: 'H8', kind: 'number', value: '9', expectedCellState: { kind: 'empty' } }],
      changeSummary: '错误目标', idempotencyKey: 'quotation-2:v1'
    })).rejects.toThrow('is not empty')

    await expect(service.patchExcelPreservingFormat(scope(), {
      documentId: 'quotation-2', expectedVersionNumber: 1,
      patches: [{ sheetName: '报价表', address: 'I8', kind: 'number', value: '9', expectedCellState: { kind: 'empty' } }],
      changeSummary: '重试正确目标', idempotencyKey: 'quotation-2:v1'
    })).resolves.toEqual(expect.objectContaining({ replayed: false }))
  })

  it('detects occupied targets and overwrites them only with an explicit any-state patch', async () => {
    const service = createService(new VersionRepository(), new MemoryWorkspaceFiles())
    await service.importWorkbook(scope(), {
      quotationId: 'quotation-overwrite', title: '覆盖测试', fileName: '覆盖测试.xlsx', buffer: await createWorkbook()
    })

    const occupied = await service.findOccupiedPatchTargets(scope(), {
      documentId: 'quotation-overwrite', expectedVersionNumber: 1,
      patches: [
        { sheetName: '报价表', address: 'H8', kind: 'number', value: '9', expectedCellState: { kind: 'empty' } },
        { sheetName: '报价表', address: 'I8', kind: 'number', value: '9', expectedCellState: { kind: 'empty' } }
      ]
    })
    expect(occupied).toEqual({ versionNumber: 1, targets: [{ sheetName: '报价表', address: 'H8' }] })

    await service.patchExcelPreservingFormat(scope(), {
      documentId: 'quotation-overwrite', expectedVersionNumber: 1,
      patches: [{ sheetName: '报价表', address: 'H8', kind: 'number', value: '9', expectedCellState: { kind: 'any' } }],
      changeSummary: '确认覆盖已有数字', idempotencyKey: 'quotation-overwrite:v1:overwrite'
    })
    expect((await service.readExcel(scope(), {
      documentId: 'quotation-overwrite', sheetName: '报价表', range: 'H8:H8'
    })).workbook.rows?.[0]?.[0]?.value).toBe(9)
  })

  it('imports blank bordered cells and preserves OOXML styles when workbook values are saved', async () => {
    const source = await createWorkbook()
    const repository = new VersionRepository()
    const files = new MemoryWorkspaceFiles()
    const service = createService(repository, files)
    await service.importWorkbook(scope(), {
      quotationId: 'quotation-format', title: '格式报价', fileName: '格式报价.xlsx', buffer: source
    })

    const opened = await service.openDocument(scope(), 'quotation-format')
    const snapshot = requireSnapshot(opened.currentSnapshot?.snapshot)
    const sheetId = snapshot.sheetOrder[0]
    const sheet = snapshot.sheets[sheetId]
    expect(snapshot.custom.importer).toBe(XPERT_WORKBOOK_SNAPSHOT_IMPORTER)
    expect(snapshot.styles['xlsx-style-1']?.bd).toEqual(expect.objectContaining({
      t: expect.objectContaining({ s: expect.any(Number) }),
      r: expect.objectContaining({ s: expect.any(Number) }),
      b: expect.objectContaining({ s: expect.any(Number) }),
      l: expect.objectContaining({ s: expect.any(Number) })
    }))
    expect(sheet.cellData[7][8]).toEqual({ s: 'xlsx-style-1' })
    expect(sheet.rowData[7].h).toBe(32)
    expect(sheet.columnData[8].w).toBe(89)

    const edited = structuredClone(snapshot)
    edited.sheets[sheetId].cellData[7][8].v = 15.25
    const saved = await service.saveSnapshot(scope(), {
      documentId: 'quotation-format', snapshot: edited, source: 'workbench', changeSummary: '人工填写单价'
    })
    expect(saved.fileVersion?.versionNumber).toBe(2)

    const beforeZip = await JSZip.loadAsync(source)
    const savedVersion = repository.items.find((item) => item.versionNumber === 2)
    if (!savedVersion) throw new Error('Saved workbook version was not found')
    const afterZip = await JSZip.loadAsync(files.bufferFor(savedVersion.workspaceFilePath))
    expect(await afterZip.file('xl/styles.xml')?.async('string')).toBe(await beforeZip.file('xl/styles.xml')?.async('string'))
    const worksheetXml = await afterZip.file('xl/worksheets/sheet1.xml')?.async('string')
    expect(worksheetXml).toMatch(/<c r="I8" s="1"><v>15\.25<\/v><\/c>/)

    const reopened = requireSnapshot((await service.openDocument(scope(), 'quotation-format')).currentSnapshot?.snapshot)
    const reopenedSheet = reopened.sheets[reopened.sheetOrder[0]]
    expect(reopenedSheet.cellData[7][8]).toEqual(expect.objectContaining({ v: 15.25, s: 'xlsx-style-1' }))
    expect(reopenedSheet.cellData[7][9]).toEqual({ s: 'xlsx-style-1' })
  })

  it('rejects workbook structure changes from the quotation editor', async () => {
    const service = createService(new VersionRepository(), new MemoryWorkspaceFiles())
    await service.importWorkbook(scope(), {
      quotationId: 'quotation-structure', title: '结构报价', fileName: '结构报价.xlsx', buffer: await createWorkbook()
    })
    const snapshot = requireSnapshot((await service.openDocument(scope(), 'quotation-structure')).currentSnapshot?.snapshot)
    const edited = structuredClone(snapshot)
    edited.sheets[edited.sheetOrder[0]].name = '已重命名'

    await expect(service.saveSnapshot(scope(), {
      documentId: 'quotation-structure', snapshot: edited, source: 'workbench', changeSummary: '修改结构'
    })).rejects.toThrow('cannot be renamed')
  })

  it('rebuilds stale stored snapshots from the canonical XLSX on open', async () => {
    const repository = new VersionRepository()
    const service = createService(repository, new MemoryWorkspaceFiles())
    await service.importWorkbook(scope(), {
      quotationId: 'quotation-stale', title: '旧快照', fileName: '旧快照.xlsx', buffer: await createWorkbook()
    })
    repository.items[0].snapshot = { custom: { importer: 'xpert-ooxml-v1' } }

    const opened = requireSnapshot((await service.openDocument(scope(), 'quotation-stale')).currentSnapshot?.snapshot)

    expect(opened.custom.importer).toBe(XPERT_WORKBOOK_SNAPSHOT_IMPORTER)
    expect(opened.styles['xlsx-style-1']?.bd).toBeDefined()
    expect(repository.items).toHaveLength(1)
    expect(repository.items[0].versionNumber).toBe(1)
  })

  it('adopts an existing Office Editor workbook once for upgrade compatibility', async () => {
    const source = await createWorkbook()
    const repository = new VersionRepository()
    const service = createService(repository, new MemoryWorkspaceFiles(), {
      getExcelFile: jest.fn().mockResolvedValue({ versionNumber: 4, fileName: '旧版报价.xlsx', fileBase64: source.toString('base64') }),
      openDocument: jest.fn().mockResolvedValue({ item: { title: '旧版报价' }, currentSnapshot: { snapshot: {} } })
    })

    const result = await service.readExcel(scope(), { documentId: 'legacy-document' })

    expect(result).toEqual(expect.objectContaining({ versionNumber: 4, fileName: '旧版报价.xlsx' }))
    expect(repository.items).toEqual([expect.objectContaining({ quotationId: 'legacy-document', versionNumber: 4, source: 'import' })])
    expect(requireSnapshot(repository.items[0].snapshot).styles['xlsx-style-1']?.bd).toBeDefined()
  })
})

function createService(repository: VersionRepository, files: MemoryWorkspaceFiles, legacyOffice?: object) {
  return new XpertQuotationWorkbookService(repository as never, {
    get: (key: object) => key === WorkspaceFilesRuntimeCapability ? files : undefined
  } as never, legacyOffice as never)
}

function scope() {
  return { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1', assistantId: 'assistant-1' }
}

class VersionRepository {
  items: XpertQuotationWorkbookVersion[] = []
  create(value: XpertQuotationWorkbookVersion) { return { ...value } }
  async save(value: XpertQuotationWorkbookVersion) {
    const saved = { ...value, id: value.id ?? `version-${this.items.length + 1}`, createdAt: value.createdAt ?? new Date() }
    const index = this.items.findIndex((item) => item.id === saved.id)
    if (index >= 0) this.items[index] = saved
    else this.items.push(saved)
    return saved
  }
  async count(query: { where: Partial<XpertQuotationWorkbookVersion> }) { return this.match(query.where).length }
  async findOne(query: { where: Partial<XpertQuotationWorkbookVersion>; order?: { versionNumber?: 'DESC' } }) {
    const matches = this.match(query.where)
    if (query.order?.versionNumber === 'DESC') matches.sort((left, right) => right.versionNumber - left.versionNumber)
    return matches[0] ?? null
  }
  private match(where: Partial<XpertQuotationWorkbookVersion>) {
    return this.items.filter((item) => Object.entries(where).every(([key, value]) => item[key as keyof XpertQuotationWorkbookVersion] === value))
  }
}

class MemoryWorkspaceFiles {
  private readonly files = new Map<string, Buffer>()
  async uploadBuffer(input: { buffer: Buffer; folder?: string | null; fileName?: string | null; catalog: string; scopeId: string }) {
    const filePath = `${input.folder}/${input.fileName}`
    this.files.set(filePath, Buffer.from(input.buffer))
    return { name: input.fileName ?? 'workbook.xlsx', filePath, workspacePath: `/workspace/${filePath}`, fileUrl: `http://localhost/files/${filePath}`, catalog: input.catalog, scopeId: input.scopeId, size: input.buffer.byteLength }
  }
  async readBuffer(input: { filePath: string; catalog: string; scopeId?: string | null }) {
    const buffer = this.files.get(input.filePath)
    if (!buffer) throw new Error('File not found')
    return { name: 'workbook.xlsx', filePath: input.filePath, workspacePath: `/workspace/${input.filePath}`, catalog: input.catalog, scopeId: input.scopeId, buffer: Buffer.from(buffer) }
  }
  async deleteFile(input: { filePath: string }) { this.files.delete(input.filePath) }
  bufferFor(filePath: string) {
    const buffer = this.files.get(filePath)
    if (!buffer) throw new Error('File not found')
    return Buffer.from(buffer)
  }
}

async function createWorkbook() {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
  zip.file('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="报价表" sheetId="1" r:id="rId1"/></sheets></workbook>')
  zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
  zip.file('xl/worksheets/sheet1.xml', '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols><col min="8" max="10" width="12" customWidth="1"/></cols><dimension ref="H8:J8"/><sheetData><row r="8" ht="24" customHeight="1"><c r="H8" s="1"><v>2</v></c><c r="I8" s="1"/><c r="J8" s="1"/></row></sheetData></worksheet>')
  zip.file('xl/styles.xml', '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/></cellXfs></styleSheet>')
  return zip.generateAsync({ type: 'nodebuffer' })
}

function createLegacyXlsWorkbook() {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['项目', '工程量'],
    ['平整场地', 12.5]
  ]), '旧报价')
  const output = XLSX.write(workbook, { type: 'buffer', bookType: 'xls' })
  return Buffer.isBuffer(output) ? output : Buffer.from(output)
}

type TestSnapshot = {
  custom: { importer: string }
  sheetOrder: string[]
  styles: Record<string, { bd?: object }>
  sheets: Record<string, {
    name: string
    cellData: Record<number, Record<number, { v?: string | number | boolean; f?: string; s?: string }>>
    rowData: Record<number, { h?: number }>
    columnData: Record<number, { w?: number }>
  }>
}

function requireSnapshot(value: unknown): TestSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Workbook snapshot is invalid')
  return value as TestSnapshot
}
