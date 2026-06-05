import { BadRequestException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { ProcurementQuoteComparisonService } from './procurement-quote-comparison.service.js'
import {
  ProcurementComparisonCase,
  ProcurementSourceDocument,
  ProcurementParseJob,
  ProcurementRequirementItem,
  ProcurementSupplierQuote,
  ProcurementQuoteItem,
  ProcurementItemMatch,
  ProcurementRiskItem,
  ProcurementRecommendation
} from './entities/index.js'
import type { ProcurementDocumentRole, ProcurementScope, StartParseInput } from './types.js'

interface PreparedChatCommand {
  commandKey: string
  payload: {
    text: string
    clientMessageId: string
    files: Array<{ fileAssetId?: string; storageFileId?: string; name?: string }>
    attachments: Array<{ id: string; name: string }>
    references: Array<{ label: string; text: string }>
  }
  caseId: string
  documentId?: string
  parseJobId?: string
}

interface PreparedQuoteMessages {
  total: number
  prepared: number
  messages: PreparedChatCommand[]
}

function createRepository<T extends { id?: string }>(initial: T[] = []) {
  const items = [...initial]
  let nextId = items.length + 1

  return {
    items,
    create(input: Partial<T>) {
      return { ...input } as T
    },
    async save(input: T | T[]) {
      if (Array.isArray(input)) {
        const saved: T[] = []
        for (const item of input) {
          saved.push(await this.save(item))
        }
        return saved
      }

      const entity = { ...input }
      entity.id ??= `id-${nextId++}`
      const index = items.findIndex((item) => item.id === entity.id)
      if (index >= 0) {
        items[index] = entity
      } else {
        items.push(entity)
      }
      return entity
    },
    async findOne(options: { where: Partial<T> }) {
      return items.find((item) => matchesWhere(item, options.where)) ?? null
    },
    async find(options?: { where?: Partial<T> }) {
      return options?.where ? items.filter((item) => matchesWhere(item, options.where ?? {})) : [...items]
    },
    async delete(options: Partial<T>) {
      const before = items.length
      for (let index = items.length - 1; index >= 0; index--) {
        if (matchesWhere(items[index], options)) {
          items.splice(index, 1)
        }
      }
      return { affected: before - items.length }
    }
  } satisfies Partial<Repository<T>> & { items: T[] }
}

function matchesWhere<T>(item: T, where: Partial<T>) {
  return Object.entries(where).every(([key, expected]) => {
    const value = Reflect.get(item, key)
    return expected === undefined || value === expected
  })
}

function asRepository<T extends { id?: string }>(repository: ReturnType<typeof createRepository<T>>) {
  return repository as unknown as Repository<T>
}

function prepareRequirementParseChatMessage(service: ProcurementQuoteComparisonService) {
  const method = Reflect.get(service, 'prepareRequirementParseChatMessage')
  expect(typeof method).toBe('function')
  return method.bind(service) as (scope: ProcurementScope, input: StartParseInput) => Promise<PreparedChatCommand>
}

function prepareSupplierQuoteParseMessages(service: ProcurementQuoteComparisonService) {
  const method = Reflect.get(service, 'prepareSupplierQuoteParseMessages')
  expect(typeof method).toBe('function')
  return method.bind(service) as (scope: ProcurementScope, input: StartParseInput) => Promise<PreparedQuoteMessages>
}

const scope: ProcurementScope = {
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  workspaceId: 'workspace-1',
  projectId: 'project-1',
  userId: 'user-1'
}

function createService(seed?: {
  cases?: ProcurementComparisonCase[]
  documents?: ProcurementSourceDocument[]
}) {
  const caseRepository = createRepository<ProcurementComparisonCase>(seed?.cases)
  const documentRepository = createRepository<ProcurementSourceDocument>(seed?.documents)
  const parseJobRepository = createRepository<ProcurementParseJob>()
  const requirementRepository = createRepository<ProcurementRequirementItem>()
  const supplierQuoteRepository = createRepository<ProcurementSupplierQuote>()
  const quoteItemRepository = createRepository<ProcurementQuoteItem>()
  const matchRepository = createRepository<ProcurementItemMatch>()
  const riskRepository = createRepository<ProcurementRiskItem>()
  const recommendationRepository = createRepository<ProcurementRecommendation>()

  const service = new ProcurementQuoteComparisonService(
    asRepository(caseRepository),
    asRepository(documentRepository),
    asRepository(parseJobRepository),
    asRepository(requirementRepository),
    asRepository(supplierQuoteRepository),
    asRepository(quoteItemRepository),
    asRepository(matchRepository),
    asRepository(riskRepository),
    asRepository(recommendationRepository)
  )

  return {
    service,
    caseRepository,
    documentRepository,
    parseJobRepository,
    requirementRepository,
    supplierQuoteRepository,
    quoteItemRepository,
    matchRepository,
    riskRepository,
    recommendationRepository
  }
}

describe('ProcurementQuoteComparisonService', () => {
  it('requires project title and purchase number when creating a procurement project', async () => {
    const { service } = createService()

    await expect(service.createComparisonCase(scope, { title: '', purchaseNo: 'PR-1' })).rejects.toBeInstanceOf(
      BadRequestException
    )
    await expect(service.createComparisonCase(scope, { title: 'IT equipment', purchaseNo: '' })).rejects.toBeInstanceOf(
      BadRequestException
    )
  })

  it('creates a scoped procurement project with manual fields', async () => {
    const { service, caseRepository } = createService()

    const saved = await service.createComparisonCase(scope, {
      title: 'IT equipment procurement',
      purchaseNo: 'PR-2026-0602',
      applicant: 'Zhang Ming',
      budgetAmount: '132000'
    })

    expect(saved.id).toBeTruthy()
    expect(saved.tenantId).toBe(scope.tenantId)
    expect(saved.organizationId).toBe(scope.organizationId)
    expect(saved.projectId).toBe(scope.projectId)
    expect(saved.title).toBe('IT equipment procurement')
    expect(saved.purchaseNo).toBe('PR-2026-0602')
    expect(caseRepository.items).toHaveLength(1)
  })

  it('creates a procurement project from an uploaded requirement document', async () => {
    const { service, caseRepository, documentRepository } = createService()

    const result = await service.createCaseFromRequirementDocument(scope, {
      name: '办公电脑采购需求单.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      fileAssetId: 'file-asset-1',
      storageFileId: 'storage-file-1',
      xpertId: 'xpert-1'
    })

    expect(result.case.id).toBeTruthy()
    expect(result.case.title).toBe('办公电脑采购需求单')
    expect(result.case.purchaseNo).toMatch(/^REQ-\d{8}-/)
    expect(result.case.status).toBe('files_uploaded')
    expect(result.document.caseId).toBe(result.case.id)
    expect(result.document.role).toBe('requirement')
    expect(result.document.name).toBe('办公电脑采购需求单.pdf')
    expect(result.document.mimeType).toBe('application/pdf')
    expect(result.document.size).toBe(1024)
    expect(result.document.fileAssetId).toBe('file-asset-1')
    expect(result.document.storageFileId).toBe('storage-file-1')
    expect(caseRepository.items).toHaveLength(1)
    expect(documentRepository.items).toHaveLength(1)
  })

  it('deletes a scoped procurement project and all related procurement records', async () => {
    const {
      service,
      caseRepository,
      documentRepository,
      parseJobRepository,
      requirementRepository,
      supplierQuoteRepository,
      quoteItemRepository,
      matchRepository,
      riskRepository,
      recommendationRepository
    } = createService({
      cases: [
        {
          id: 'case-1',
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          title: '办公电脑采购',
          purchaseNo: 'PR-1'
        },
        {
          id: 'case-other-project',
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: 'project-other',
          title: '其他项目',
          purchaseNo: 'PR-2'
        }
      ],
      documents: [
        {
          id: 'document-1',
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          caseId: 'case-1',
          role: 'requirement',
          name: '采购需求单.xlsx'
        },
        {
          id: 'document-other',
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: 'project-other',
          caseId: 'case-other-project',
          role: 'requirement',
          name: '其他需求单.xlsx'
        }
      ]
    })

    await parseJobRepository.save({
      id: 'job-1',
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      caseId: 'case-1',
      type: 'requirement'
    } as ProcurementParseJob)
    await requirementRepository.save({
      id: 'requirement-1',
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      caseId: 'case-1',
      name: '笔记本电脑'
    } as ProcurementRequirementItem)
    await supplierQuoteRepository.save({
      id: 'supplier-quote-1',
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      caseId: 'case-1',
      supplierName: '供应商 A'
    } as ProcurementSupplierQuote)
    await quoteItemRepository.save({
      id: 'quote-item-1',
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      caseId: 'case-1',
      supplierQuoteId: 'supplier-quote-1',
      productName: '笔记本电脑'
    } as ProcurementQuoteItem)
    await matchRepository.save({
      id: 'match-1',
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      caseId: 'case-1',
      status: 'exact'
    } as ProcurementItemMatch)
    await riskRepository.save({
      id: 'risk-1',
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      caseId: 'case-1',
      type: 'price',
      severity: 'medium',
      title: '价格偏高',
      description: '报价超过预算'
    } as ProcurementRiskItem)
    await recommendationRepository.save({
      id: 'recommendation-1',
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      caseId: 'case-1',
      summary: '建议选择供应商 A'
    } as ProcurementRecommendation)

    const result = await service.deleteComparisonCase(scope, 'case-1')

    expect(result).toEqual({ deleted: true, caseId: 'case-1' })
    expect(caseRepository.items.map((item) => item.id)).toEqual(['case-other-project'])
    expect(documentRepository.items.map((item) => item.id)).toEqual(['document-other'])
    expect(parseJobRepository.items).toHaveLength(0)
    expect(requirementRepository.items).toHaveLength(0)
    expect(supplierQuoteRepository.items).toHaveLength(0)
    expect(quoteItemRepository.items).toHaveLength(0)
    expect(matchRepository.items).toHaveLength(0)
    expect(riskRepository.items).toHaveLength(0)
    expect(recommendationRepository.items).toHaveLength(0)
  })

  it('requires uploaded requirement documents to have a platform file handle or extracted content', async () => {
    const { service, caseRepository, documentRepository } = createService()

    await expect(
      service.createCaseFromRequirementDocument(scope, {
        name: '采购需求单.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 1024
      })
    ).rejects.toThrow('Uploaded source document was not persisted to platform storage.')

    expect(caseRepository.items).toHaveLength(0)
    expect(documentRepository.items).toHaveLength(0)
  })

  it('creates a procurement project from extracted requirement content without a platform file handle', async () => {
    const { service, caseRepository, documentRepository } = createService()

    const result = await service.createCaseFromRequirementDocument(scope, {
      name: '采购需求单.csv',
      mimeType: 'text/csv',
      size: 128,
      extractedContent: '采购编号,项目名称\nPR-001,研发中心办公电脑更新采购',
      extractionStatus: 'extracted'
    })

    expect(result.case.id).toBeTruthy()
    expect(result.case.title).toBe('采购需求单')
    expect(result.document.fileAssetId).toBeUndefined()
    expect(result.document.storageFileId).toBeUndefined()
    expect(result.document.extractedContent).toContain('研发中心办公电脑更新采购')
    expect(result.document.extractionStatus).toBe('extracted')
    expect(caseRepository.items).toHaveLength(1)
    expect(documentRepository.items).toHaveLength(1)
  })

  it('repairs mojibake requirement document names before saving', async () => {
    const { service } = createService()
    const mojibakeName = Buffer.from('采购需求单-研发中心办公电脑更新采购.xlsx', 'utf8').toString('latin1')

    const result = await service.createCaseFromRequirementDocument(scope, {
      name: mojibakeName,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 1024,
      fileAssetId: 'file-asset-1'
    })

    expect(result.document.name).toBe('采购需求单-研发中心办公电脑更新采购.xlsx')
    expect(result.case.title).toBe('采购需求单 研发中心办公电脑更新采购')
  })

  it('prepares requirement parsing as an assistant chat command with source file references', async () => {
    const { service, caseRepository, documentRepository, parseJobRepository } = createService({
      cases: [
        {
          id: 'case-1',
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          projectId: scope.projectId,
          title: '办公电脑采购',
          purchaseNo: 'PR-1',
          applicant: 'Manual applicant',
          status: 'files_uploaded'
        }
      ],
      documents: [
        {
          id: 'doc-1',
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          projectId: scope.projectId,
          caseId: 'case-1',
          role: 'requirement',
          name: '采购需求单.xlsx',
          status: 'uploaded',
          fileAssetId: 'file-asset-1',
          storageFileId: 'storage-file-1',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      ]
    })

    const command = await prepareRequirementParseChatMessage(service)(scope, {
      caseId: 'case-1',
      xpertId: 'xpert-1'
    })

    expect(command.commandKey).toBe('assistant.chat.send_message')
    expect(command.payload.text).toContain('采购需求单.xlsx')
    expect(command.payload.text).toContain('读取本消息附带的采购需求单文件')
    expect(command.payload.text).toContain('procurement_save_requirement')
    expect(command.payload.text).toContain('procurement_report_parse_failure')
    expect(command.payload.clientMessageId).toBe(`procurement-requirement-parse:${command.parseJobId}`)
    expect(command.payload.files).toEqual([
      expect.objectContaining({
        fileAssetId: 'file-asset-1',
        storageFileId: 'storage-file-1',
        name: '采购需求单.xlsx'
      })
    ])
    expect(command.payload.attachments).toEqual([
      expect.objectContaining({
        id: 'file-asset-1',
        name: '采购需求单.xlsx'
      })
    ])
    expect(command.payload.references[0].text).toContain('fileId=file-asset-1')
    expect(command.documentId).toBe('doc-1')
    expect(parseJobRepository.items).toHaveLength(1)
    expect(parseJobRepository.items[0].status).toBe('running')
    expect(documentRepository.items[0].status).toBe('parsing')
    expect(caseRepository.items[0].status).toBe('parsing')
    expect(caseRepository.items[0].xpertId).toBe('xpert-1')
  })

  it('prepares requirement parsing from extracted content when no platform file handle exists', async () => {
    const { service } = createService({
      cases: [
        {
          id: 'case-1',
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          projectId: scope.projectId,
          title: '办公电脑采购',
          purchaseNo: 'PR-1',
          status: 'files_uploaded'
        }
      ],
      documents: [
        {
          id: 'doc-1',
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          projectId: scope.projectId,
          caseId: 'case-1',
          role: 'requirement',
          name: '采购需求单.csv',
          status: 'uploaded',
          mimeType: 'text/csv',
          extractedContent: '采购编号,项目名称\nPR-001,研发中心办公电脑更新采购',
          extractionStatus: 'extracted'
        }
      ]
    })

    const command = await prepareRequirementParseChatMessage(service)(scope, {
      caseId: 'case-1',
      xpertId: 'xpert-1'
    })

    expect(command.payload.files).toEqual([])
    expect(command.payload.attachments).toEqual([])
    expect(command.payload.text).toContain('以下是插件从上传文件中提取的文本内容')
    expect(command.payload.text).toContain('研发中心办公电脑更新采购')
  })

  it('uses the latest requirement document with a platform file handle when stale uploads exist', async () => {
    const mojibakeName = Buffer.from('采购需求单-研发中心办公电脑更新采购.xlsx', 'utf8').toString('latin1')
    const { service, documentRepository } = createService({
      cases: [
        {
          id: 'case-1',
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          projectId: scope.projectId,
          title: '办公电脑采购',
          purchaseNo: 'PR-1',
          status: 'files_uploaded'
        }
      ],
      documents: [
        {
          id: 'old-doc',
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          projectId: scope.projectId,
          caseId: 'case-1',
          role: 'requirement',
          name: mojibakeName,
          status: 'uploaded',
          createdAt: new Date('2026-06-02T00:00:00.000Z')
        },
        {
          id: 'new-doc',
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          projectId: scope.projectId,
          caseId: 'case-1',
          role: 'requirement',
          name: '采购需求单-研发中心办公电脑更新采购.xlsx',
          status: 'uploaded',
          storageFileId: 'storage-file-new',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          createdAt: new Date('2026-06-02T01:00:00.000Z')
        }
      ]
    })

    const command = await prepareRequirementParseChatMessage(service)(scope, {
      caseId: 'case-1',
      xpertId: 'xpert-1'
    })

    expect(command.documentId).toBe('new-doc')
    expect(command.payload.files).toEqual([
      expect.objectContaining({
        storageFileId: 'storage-file-new',
        name: '采购需求单-研发中心办公电脑更新采购.xlsx'
      })
    ])
    expect(command.payload.attachments).toEqual([
      expect.objectContaining({
        id: 'storage-file-new',
        name: '采购需求单-研发中心办公电脑更新采购.xlsx'
      })
    ])
    expect(documentRepository.items.find((document) => document.id === 'old-doc')?.status).toBe('uploaded')
    expect(documentRepository.items.find((document) => document.id === 'new-doc')?.status).toBe('parsing')
  })

  it('repairs stale mojibake document names in missing file handle errors', async () => {
    const mojibakeName = Buffer.from('采购需求单-研发中心办公电脑更新采购.xlsx', 'utf8').toString('latin1')
    const { service } = createService({
      cases: [
        {
          id: 'case-1',
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          projectId: scope.projectId,
          title: '办公电脑采购',
          purchaseNo: 'PR-1',
          status: 'files_uploaded'
        }
      ],
      documents: [
        {
          id: 'old-doc',
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          projectId: scope.projectId,
          caseId: 'case-1',
          role: 'requirement',
          name: mojibakeName,
          status: 'uploaded',
          createdAt: new Date('2026-06-02T00:00:00.000Z')
        }
      ]
    })

    await expect(
      prepareRequirementParseChatMessage(service)(scope, {
        caseId: 'case-1',
        xpertId: 'xpert-1'
      })
    ).rejects.toThrow(
      "The uploaded procurement requirement document '采购需求单-研发中心办公电脑更新采购.xlsx' has no platform file handle. Re-upload it and try parsing again."
    )
  })

  it('marks a prepared chat parse job as dispatched', async () => {
    const { service, parseJobRepository } = createService({
      cases: [
        {
          id: 'case-1',
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          projectId: scope.projectId,
          title: '办公电脑采购',
          purchaseNo: 'PR-1',
          status: 'files_uploaded'
        }
      ],
      documents: [
        {
          id: 'doc-1',
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          projectId: scope.projectId,
          caseId: 'case-1',
          role: 'requirement',
          name: '采购需求单.xlsx',
          status: 'uploaded',
          fileAssetId: 'file-asset-1',
          storageFileId: 'storage-file-1',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      ]
    })

    const command = await prepareRequirementParseChatMessage(service)(scope, {
      caseId: 'case-1',
      xpertId: 'xpert-1'
    })
    const result = await service.markParseMessageDispatched(scope, {
      caseId: 'case-1',
      parseJobId: command.parseJobId ?? '',
      clientMessageId: command.payload.clientMessageId,
      conversationId: 'conversation-1',
      threadId: 'thread-1'
    })

    expect(result.status).toBe('running')
    expect(result.clientMessageId).toBe(command.payload.clientMessageId)
    expect(result.conversationId).toBe('conversation-1')
    expect(result.threadId).toBe('thread-1')
    expect(parseJobRepository.items[0].conversationId).toBe('conversation-1')
  })

  it('prepares one isolated assistant chat message per supplier quote document', async () => {
    const documents: ProcurementSourceDocument[] = [
      {
        id: 'doc-1',
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        caseId: 'case-1',
        role: 'supplier_quote',
        name: '报价单-A.xlsx',
        status: 'uploaded',
        fileAssetId: 'file-asset-a',
        storageFileId: 'storage-file-a',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      },
      {
        id: 'doc-2',
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        caseId: 'case-1',
        role: 'supplier_quote',
        name: '报价单-B.xlsx',
        status: 'uploaded',
        fileAssetId: 'file-asset-b',
        storageFileId: 'storage-file-b',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    ]
    const { service, parseJobRepository, documentRepository } = createService({
      cases: [
        {
          id: 'case-1',
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          projectId: scope.projectId,
          title: '办公电脑采购',
          purchaseNo: 'PR-1',
          status: 'files_uploaded'
        }
      ],
      documents
    })

    const result = await prepareSupplierQuoteParseMessages(service)(scope, {
      caseId: 'case-1',
      xpertId: 'xpert-1',
      maxConcurrency: 2
    })

    expect(result.total).toBe(2)
    expect(result.prepared).toBe(2)
    expect(result.messages).toHaveLength(2)
    expect(result.messages[0].payload.text).toContain('报价单-A.xlsx')
    expect(result.messages[0].payload.text).toContain('只读取本消息附带的这一份报价单文件')
    expect(result.messages[0].payload.files).toEqual([expect.objectContaining({ fileAssetId: 'file-asset-a' })])
    expect(result.messages[1].payload.text).toContain('报价单-B.xlsx')
    expect(result.messages[1].payload.files).toEqual([expect.objectContaining({ fileAssetId: 'file-asset-b' })])
    expect(result.messages.every((message) => message.commandKey === 'assistant.chat.send_message')).toBe(true)
    expect(result.messages.every((message) => message.payload.text.includes('procurement_save_supplier_quote'))).toBe(true)
    expect(parseJobRepository.items).toHaveLength(2)
    expect(documentRepository.items.every((document) => document.status === 'parsing')).toBe(true)
  })

  it('fills empty project fields from parsed requirements without overwriting manual values', async () => {
    const existing: ProcurementComparisonCase = {
      id: 'case-1',
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      title: 'Manual title',
      purchaseNo: 'PR-1',
      applicant: 'Manual applicant',
      status: 'draft'
    }
    const { service, caseRepository, requirementRepository } = createService({ cases: [existing] })

    const result = await service.saveRequirementExtraction(scope, {
      caseId: 'case-1',
      project: {
        title: 'AI parsed title',
        purchaseNo: 'PR-1',
        applicant: 'AI applicant',
        department: 'IT',
        budgetAmount: '132000',
        expectedDeliveryDate: '2026-06-20'
      },
      items: [
        {
          name: 'Laptop',
          specification: 'i5 / 16G / 512G',
          quantity: 20,
          budgetAmount: '120000',
          expectedDeliveryDate: '7 days'
        }
      ]
    })

    const savedCase = caseRepository.items[0]
    expect(savedCase.title).toBe('Manual title')
    expect(savedCase.applicant).toBe('Manual applicant')
    expect(savedCase.department).toBe('IT')
    expect(savedCase.budgetAmount).toBe('132000')
    expect(result.fieldConflicts).toEqual([
      {
        field: 'title',
        manualValue: 'Manual title',
        parsedValue: 'AI parsed title'
      },
      {
        field: 'applicant',
        manualValue: 'Manual applicant',
        parsedValue: 'AI applicant'
      }
    ])
    expect(requirementRepository.items).toHaveLength(1)
  })

  it('starts independent assistant tasks for quote documents with limited concurrency metadata', async () => {
    const documents: ProcurementSourceDocument[] = ['doc-1', 'doc-2', 'doc-3'].map((id) => ({
      id,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      caseId: 'case-1',
      role: 'supplier_quote' as ProcurementDocumentRole,
      name: `${id}.pdf`,
      fileAssetId: `${id}-file`,
      status: 'uploaded'
    }))
    const { service, parseJobRepository } = createService({
      cases: [
        {
          id: 'case-1',
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          projectId: scope.projectId,
          title: 'IT equipment procurement',
          purchaseNo: 'PR-1',
          status: 'draft'
        }
      ],
      documents
    })
    const startedTasks: Array<{ taskId?: string; conversationId?: string | null }> = []

    const result = await service.startSupplierQuoteParseBatch(
      scope,
      {
        caseId: 'case-1',
        xpertId: 'xpert-1',
        maxConcurrency: 2
      },
      {
        startTask: async (input) => {
          startedTasks.push({ taskId: input.taskId, conversationId: input.conversationId })
          return {
            status: 'running',
            taskId: input.taskId,
            executionId: `execution-${input.taskId}`,
            conversationId: `conversation-${input.taskId}`
          }
        }
      }
    )

    expect(result.total).toBe(3)
    expect(result.started).toBe(3)
    expect(result.maxConcurrency).toBe(2)
    expect(startedTasks).toHaveLength(3)
    expect(startedTasks.every((task) => task.conversationId == null)).toBe(true)
    expect(new Set(startedTasks.map((task) => task.taskId)).size).toBe(3)
    expect(parseJobRepository.items).toHaveLength(3)
  })
})
