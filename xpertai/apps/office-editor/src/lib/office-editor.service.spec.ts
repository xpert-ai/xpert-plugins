import { BadRequestException } from '@nestjs/common'
import { createRequire } from 'node:module'
import * as Y from 'yjs'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  XPERT_RUNTIME_CAPABILITIES_TOKEN: Symbol('XPERT_RUNTIME_CAPABILITIES_TOKEN'),
  pluginArtifactTableName: (namespace: string, tableKey: string) => `plugin_${namespace}_${tableKey}`
}))

import { OfficeEditorService } from './office-editor.service.js'

const requireFromHere = createRequire(import.meta.url)

describe('OfficeEditorService', () => {
  let documents: MemoryRepository<any>
  let snapshots: MemoryRepository<any>
  let updates: MemoryRepository<any>
  let operations: MemoryRepository<any>
  let fileVersions: MemoryRepository<any>
  let workspaceFiles: MemoryWorkspaceFiles
  let service: OfficeEditorService

  beforeEach(() => {
    documents = new MemoryRepository('document')
    snapshots = new MemoryRepository('snapshot')
    updates = new MemoryRepository('update')
    operations = new MemoryRepository('operation')
    fileVersions = new MemoryRepository('file-version')
    workspaceFiles = new MemoryWorkspaceFiles()
    service = new OfficeEditorService(
      documents as never,
      snapshots as never,
      updates as never,
      operations as never,
      fileVersions as never,
      {
        get: () => workspaceFiles
      } as never
    )
  })

  it('creates typed documents with scoped snapshots and hides them across organizations', async () => {
    const created = await service.createDocument(testScope(), {
      documentType: 'spreadsheet',
      title: 'Revenue model'
    })

    expect(created.document).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        documentType: 'spreadsheet',
        title: 'Revenue model',
        currentVersionNumber: 1
      })
    )
    expect(created.snapshot).toEqual(
      expect.objectContaining({
        documentId: created.document.id,
        versionNumber: 1,
        source: 'system',
        snapshot: expect.objectContaining({
          sheets: expect.any(Object)
        })
      })
    )

    const visible = await service.getWorkbenchData(testScope(), { page: 1, pageSize: 20 })
    const hidden = await service.getWorkbenchData({ ...testScope(), organizationId: 'org-2' }, { page: 1, pageSize: 20 })

    expect(visible.items.map((item: any) => item.id)).toEqual([created.document.id])
    expect(hidden.items).toHaveLength(0)
  })

  it('increments snapshot versions and points the document at the latest snapshot', async () => {
    const created = await service.createDocument(testScope(), {
      documentType: 'document',
      title: 'Launch memo'
    })

    const saved = await service.saveSnapshot(testScope(), {
      documentId: created.document.id,
      source: 'workbench',
      snapshot: {
        id: 'unit-1',
        title: 'Launch memo',
        body: {
          dataStream: 'Hello office\r\n'
        }
      },
      changeSummary: 'Workbench save'
    })

    expect(saved.snapshot.versionNumber).toBe(2)
    expect(saved.document.currentVersionNumber).toBe(2)
    expect(saved.document.currentSnapshotId).toBe(saved.snapshot.id)
    expect((await snapshots.find({ where: { documentId: created.document.id } })).map((item) => item.versionNumber)).toEqual([1, 2])
  })

  it('merges Yjs updates idempotently by update hash', async () => {
    const created = await service.createDocument(testScope(), {
      documentType: 'presentation',
      title: 'Quarterly update'
    })
    const updateBase64 = createYjsUpdateBase64({
      id: 'unit-1',
      title: 'Quarterly update',
      slides: {}
    })

    const first = await service.syncYjsState(testScope(), {
      documentId: created.document.id,
      updateBase64,
      origin: 'spec',
      clientId: 'client-1'
    })
    const second = await service.syncYjsState(testScope(), {
      documentId: created.document.id,
      updateBase64,
      origin: 'spec',
      clientId: 'client-1'
    })

    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(await updates.find({ where: { documentId: created.document.id } })).toHaveLength(1)
    expect(second.yjsStateVectorBase64).toEqual(expect.any(String))
  })

  it('queues operations only when the operationType discriminator matches the input', async () => {
    const created = await service.createDocument(testScope(), {
      documentType: 'spreadsheet',
      title: 'Queue target'
    })

    await expect(
      service.queueOperation(testScope(), {
        documentId: created.document.id,
        operationType: 'doc_append_text',
        input: {
          operationType: 'sheet_set_range_values',
          range: 'A1:B1',
          values: [['A', 'B']]
        },
        source: 'agent'
      })
    ).rejects.toThrow(BadRequestException)

    const queued = await service.queueOperation(testScope(), {
      documentId: created.document.id,
      operationType: 'sheet_set_range_values',
      input: {
        operationType: 'sheet_set_range_values',
        range: 'A1:B1',
        values: [['A', 'B']]
      },
      reviewNote: 'Needs human review',
      confidence: 0.84,
      source: 'agent'
    })
    const completed = await service.completeOperation(testScope(), {
      operationId: queued.id,
      status: 'applied',
      result: {
        applied: true
      }
    })

    expect(queued).toEqual(
      expect.objectContaining({
        documentId: created.document.id,
        operationType: 'sheet_set_range_values',
        source: 'agent',
        status: 'queued',
        confidence: 0.84
      })
    )
    expect(completed.status).toBe('applied')
  })

  it('imports XLSX files as scoped spreadsheet snapshots with import audit', async () => {
    const buffer = createXlsxBuffer()
    const imported = await service.importDocument(testScope(), {
      importFormat: 'xlsx',
      documentType: 'spreadsheet',
      title: 'Imported workbook',
      fileName: 'workbook.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: buffer.byteLength,
      fileBase64: buffer.toString('base64')
    })

    expect(imported.document).toEqual(
      expect.objectContaining({
        documentType: 'spreadsheet',
        title: 'Imported workbook',
        currentVersionNumber: 1
      })
    )
    expect(imported.snapshot).toEqual(
      expect.objectContaining({
        source: 'import',
        snapshotText: expect.stringContaining('R2C2: 123')
      })
    )
    expect(imported.import).toEqual(
      expect.objectContaining({
        importFormat: 'xlsx',
        documentType: 'spreadsheet',
        fidelity: 'best_effort'
      })
    )
    expect(imported.operation).toEqual(
      expect.objectContaining({
        documentId: imported.document.id,
        snapshotId: imported.snapshot.id,
        operationType: 'import_document',
        source: 'workbench',
        status: 'applied'
      })
    )
    expect(await operations.find({ where: { documentId: imported.document.id } })).toHaveLength(1)
    expect(imported.fileVersion).toEqual(expect.objectContaining({
      documentId: imported.document.id,
      versionNumber: 1,
      fileName: 'workbook.xlsx'
    }))
  })

  it('automatically edits the persisted XLSX file and creates an idempotent downloadable version', async () => {
    const imported = await service.importDocument(testScope(), {
      importFormat: 'xlsx',
      documentType: 'spreadsheet',
      title: 'Automated workbook',
      fileName: 'workbook.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileBase64: createXlsxBuffer().toString('base64')
    })

    const before = await service.readExcel(testScope(), {
      documentId: imported.document.id,
      sheetName: 'Data',
      range: 'A1:C2'
    })
    expect(before.versionNumber).toBe(1)
    expect(before.workbook.rows[1][1].value).toBe(123)

    const edited = await service.editExcel(testScope(), {
      documentId: imported.document.id,
      expectedVersionNumber: 1,
      idempotencyKey: 'edit-1',
      operations: [
        {
          type: 'set_range_values',
          sheetName: 'Data',
          range: 'B2',
          values: [[456]]
        },
        {
          type: 'set_range_formulas',
          sheetName: 'Data',
          range: 'C2',
          formulas: [['=B2*3']]
        }
      ]
    })

    expect(edited.fileVersion.versionNumber).toBe(2)
    expect(edited.operation.status).toBe('applied')
    expect(edited.file).toEqual(expect.objectContaining({
      fileName: 'workbook.xlsx',
      extension: 'xlsx'
    }))

    const file = await service.getExcelFile(testScope(), imported.document.id, true)
    const XLSX = requireFromHere('xlsx') as any
    const workbook = XLSX.read(Buffer.from(file.fileBase64, 'base64'), { type: 'buffer', cellFormula: true })
    expect(workbook.Sheets.Data.B2.v).toBe(456)
    expect(workbook.Sheets.Data.C2.f).toBe('B2*3')

    const replayed = await service.editExcel(testScope(), {
      documentId: imported.document.id,
      expectedVersionNumber: 1,
      idempotencyKey: 'edit-1',
      operations: [{
        type: 'clear_range',
        sheetName: 'Data',
        range: 'A1'
      }]
    })
    expect(replayed.replayed).toBe(true)
    expect((await fileVersions.find({ where: { documentId: imported.document.id } }))).toHaveLength(2)
  })

  it('keeps later XLSX versions in the persisted owner scope when another assistant edits the document', async () => {
    const ownerScope = {
      ...testScope(),
      projectId: null,
      assistantId: 'assistant-a',
      conversationId: 'conversation-a'
    }
    const imported = await service.importDocument(ownerScope, {
      importFormat: 'xlsx',
      documentType: 'spreadsheet',
      title: 'Shared workbook',
      fileName: 'shared.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileBase64: createXlsxBuffer().toString('base64')
    })
    expect(workspaceFiles.uploads[0]).toEqual(expect.objectContaining({
      catalog: 'xperts',
      scopeId: 'assistant-a',
      xpertId: 'assistant-a'
    }))

    const otherAssistantScope = {
      ...ownerScope,
      assistantId: 'assistant-b',
      conversationId: 'conversation-b'
    }
    await service.editExcel(otherAssistantScope, {
      documentId: imported.document.id,
      expectedVersionNumber: 1,
      idempotencyKey: 'assistant-b-edit',
      operations: [{
        type: 'set_range_values',
        sheetName: 'Data',
        range: 'B2',
        values: [[789]]
      }]
    })

    expect(workspaceFiles.uploads[1]).toEqual(expect.objectContaining({
      catalog: 'xperts',
      scopeId: 'assistant-a',
      xpertId: 'assistant-a'
    }))
    await service.saveSnapshot(otherAssistantScope, {
      documentId: imported.document.id,
      source: 'workbench',
      snapshot: imported.snapshot.snapshot,
      changeSummary: 'Saved by assistant B Workbench'
    })
    expect(workspaceFiles.uploads[2]).toEqual(expect.objectContaining({
      catalog: 'xperts',
      scopeId: 'assistant-a',
      xpertId: 'assistant-a'
    }))
    const storedDocument = await documents.findOne({ where: { id: imported.document.id } })
    expect(storedDocument).toEqual(expect.objectContaining({
      assistantId: 'assistant-a',
      workspaceCatalog: 'xperts',
      workspaceScopeId: 'assistant-a',
      currentFileVersionNumber: 3
    }))
    expect(
      (await fileVersions.find({ where: { documentId: imported.document.id } }))
        .map((version) => version.workspaceScopeId)
    ).toEqual(['assistant-a', 'assistant-a', 'assistant-a'])
  })

  it('rejects mismatched import discriminators without guessing from filenames', async () => {
    const buffer = createXlsxBuffer()
    await expect(
      service.importDocument(testScope(), {
        importFormat: 'xlsx',
        documentType: 'document',
        fileName: 'looks-like-a-doc.xlsx',
        size: buffer.byteLength,
        fileBase64: buffer.toString('base64')
      })
    ).rejects.toThrow(BadRequestException)
  })

  it('imports minimal DOCX and PPTX files with best-effort warnings', async () => {
    const docxBuffer = await createMinimalDocxBuffer('Hello imported document')
    const docx = await service.importDocument(testScope(), {
      importFormat: 'docx',
      documentType: 'document',
      fileName: 'memo.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: docxBuffer.byteLength,
      fileBase64: docxBuffer.toString('base64')
    })

    expect(docx.snapshot.source).toBe('import')
    expect(docx.snapshot.snapshotText).toContain('Hello imported document')
    expect(docx.snapshot.snapshotText).toContain('Widget\t2')
    expect(docx.warnings.join('\n')).toContain('DOCX import is best-effort')
    expect(docx.warnings.join('\n')).toContain('DOCX tables were converted')

    const pptxBuffer = await createMinimalPptxBuffer('Quarterly Update', 'Revenue grew 12%')
    const pptx = await service.importDocument(testScope(), {
      importFormat: 'pptx',
      documentType: 'presentation',
      fileName: 'deck.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      size: pptxBuffer.byteLength,
      fileBase64: pptxBuffer.toString('base64')
    })

    expect(pptx.snapshot.source).toBe('import')
    expect(pptx.snapshot.snapshotText).toContain('Quarterly Update')
    expect(pptx.warnings.join('\n')).toContain('PPTX import is experimental')
    const page = Object.values((pptx.snapshot.snapshot as any).body.pages)[0] as any
    const firstElement = Object.values(page.pageElements)[0] as any
    expect(firstElement.zIndex).toBeGreaterThanOrEqual(22)
    expect(firstElement.left).toBeGreaterThan(0)
  })
})

function testScope() {
  return {
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    userId: 'user-1',
    assistantId: 'assistant-1',
    conversationId: 'conversation-1'
  }
}

function createYjsUpdateBase64(snapshot: unknown) {
  const doc = new Y.Doc()
  const map = doc.getMap('office')
  map.set('documentId', 'document-1')
  map.set('documentType', 'presentation')
  map.set('snapshot', snapshot)
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64')
}

function createXlsxBuffer() {
  const XLSX = requireFromHere('xlsx') as any
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Name', 'Value'],
    ['Revenue', 123]
  ])
  worksheet.C2 = { t: 'n', f: 'B2*2', v: 246 }
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data')
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
}

async function createMinimalDocxBuffer(text: string) {
  const JSZip = requireFromHere('jszip') as any
  const zip = new JSZip()
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
  zip.folder('word').file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Item</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Qty</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Widget</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>2</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`)
  return zip.generateAsync({ type: 'nodebuffer' }) as Promise<Buffer>
}

async function createMinimalPptxBuffer(title: string, body: string) {
  const JSZip = requireFromHere('jszip') as any
  const zip = new JSZip()
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`)
  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`)
  zip.folder('ppt').file('presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
</p:presentation>`)
  zip.folder('ppt').folder('_rels').file('presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`)
  zip.folder('ppt').folder('slides').file('slide1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:spPr><a:xfrm><a:off x="914400" y="685800"/><a:ext cx="7315200" cy="914400"/></a:xfrm></p:spPr>
        <p:txBody><a:p><a:r><a:rPr sz="3200"/><a:t>${escapeXml(title)}</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:spPr><a:xfrm><a:off x="914400" y="1828800"/><a:ext cx="7315200" cy="1828800"/></a:xfrm></p:spPr>
        <p:txBody><a:p><a:r><a:rPr sz="2000"/><a:t>${escapeXml(body)}</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`)
  return zip.generateAsync({ type: 'nodebuffer' }) as Promise<Buffer>
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

class MemoryRepository<T extends Record<string, any>> {
  private values: T[] = []
  private sequence = 0

  constructor(private readonly prefix: string) {}

  create(value: Partial<T>) {
    return { ...value } as T
  }

  async save(value: T) {
    const now = new Date()
    const next = {
      ...value,
      id: value.id ?? `${this.prefix}-${++this.sequence}`,
      createdAt: value.createdAt ?? now,
      updatedAt: now
    } as T
    const index = this.values.findIndex((candidate) => candidate.id === next.id)
    if (index >= 0) {
      this.values[index] = next
    } else {
      this.values.push(next)
    }
    return next
  }

  async findOne(options: { where?: Record<string, unknown>; order?: Record<string, 'ASC' | 'DESC'> } = {}) {
    return this.applyOrder(this.filter(options.where), options.order)[0] ?? null
  }

  async find(options: { where?: Record<string, unknown>; order?: Record<string, 'ASC' | 'DESC'>; take?: number } = {}) {
    const items = this.applyOrder(this.filter(options.where), options.order)
    return typeof options.take === 'number' ? items.slice(0, options.take) : items
  }

  async findAndCount(options: {
    where?: Record<string, unknown>
    order?: Record<string, 'ASC' | 'DESC'>
    skip?: number
    take?: number
  } = {}) {
    const items = this.applyOrder(this.filter(options.where), options.order)
    const skip = options.skip ?? 0
    const take = options.take ?? items.length
    return [items.slice(skip, skip + take), items.length] as const
  }

  async delete(where: Record<string, unknown>) {
    const before = this.values.length
    this.values = this.values.filter((item) => !matchesWhere(item, where))
    return { affected: before - this.values.length }
  }

  private filter(where?: Record<string, unknown>) {
    return this.values.filter((item) => matchesWhere(item, where))
  }

  private applyOrder(items: T[], order?: Record<string, 'ASC' | 'DESC'>) {
    const entries = Object.entries(order ?? {})
    if (!entries.length) {
      return [...items]
    }
    return [...items].sort((left, right) => {
      for (const [key, direction] of entries) {
        const leftValue = left[key]
        const rightValue = right[key]
        if (leftValue === rightValue) {
          continue
        }
        const modifier = direction === 'DESC' ? -1 : 1
        return leftValue > rightValue ? modifier : -modifier
      }
      return 0
    })
  }
}

class MemoryWorkspaceFiles {
  private readonly files = new Map<string, Buffer>()
  private sequence = 0
  readonly uploads: Array<{
    catalog?: string
    scopeId?: string
    xpertId?: string
    projectId?: string
  }> = []

  async uploadBuffer(input: {
    buffer: Buffer
    fileName?: string
    originalName: string
    catalog?: string
    scopeId?: string
    xpertId?: string
    projectId?: string
  }) {
    this.uploads.push({
      catalog: input.catalog,
      scopeId: input.scopeId,
      xpertId: input.xpertId,
      projectId: input.projectId
    })
    const filePath = `workspace/file-${++this.sequence}/${input.fileName ?? input.originalName}`
    this.files.set(filePath, Buffer.from(input.buffer))
    return {
      filePath,
      workspacePath: filePath,
      fileUrl: `https://files.example.test/${this.sequence}`,
      size: input.buffer.byteLength
    }
  }

  async readBuffer(input: { filePath: string }) {
    const buffer = this.files.get(input.filePath)
    if (!buffer) {
      throw new Error('File not found')
    }
    return {
      filePath: input.filePath,
      buffer: Buffer.from(buffer)
    }
  }

  async deleteFile(input: { filePath: string }) {
    this.files.delete(input.filePath)
  }
}

function matchesWhere(item: Record<string, any>, where?: Record<string, unknown>) {
  return Object.entries(where ?? {}).every(([key, value]) => item[key] === value)
}
