import type { Repository } from 'typeorm'
import { TradeComplianceWorkbenchService } from './trade-compliance-workbench.service.js'
import {
  ControlledGoodsRecord,
  TradeComplianceImportBatch,
  TradeComplianceReviewItem,
  TradeProduct,
  TradeSupplier,
  CustomsWorkbookGeneration
} from './entities/index.js'
import type { TradeComplianceScope } from './types.js'

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
    async find(options?: { where?: Partial<T> }) {
      return options?.where ? items.filter((item) => matchesWhere(item, options.where ?? {})) : [...items]
    },
    async findOne(options: { where: Partial<T> }) {
      return items.find((item) => matchesWhere(item, options.where)) ?? null
    }
  } as {
    items: T[]
    create(input: Partial<T>): T
    save(input: T): Promise<T>
    save(input: T[]): Promise<T[]>
    find(options?: { where?: Partial<T> }): Promise<T[]>
    findOne(options: { where: Partial<T> }): Promise<T | null>
  }
}

function matchesWhere<T extends object>(item: T, where: Partial<T>) {
  return Object.entries(where).every(([key, expected]) => {
    const value = Reflect.get(item, key)
    return expected === undefined || value === expected
  })
}

function asRepository<T extends { id?: string }>(repository: ReturnType<typeof createRepository<T>>) {
  return repository as unknown as Repository<T>
}

const scope: TradeComplianceScope = {
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  workspaceId: 'workspace-1',
  assistantId: 'assistant-1',
  userId: 'user-1'
}

function createService() {
  const batchRepository = createRepository<TradeComplianceImportBatch>()
  const reviewItemRepository = createRepository<TradeComplianceReviewItem>()
  const controlledGoodsRepository = createRepository<ControlledGoodsRecord>()
  const supplierRepository = createRepository<TradeSupplier>()
  const productRepository = createRepository<TradeProduct>()
  const workbookRepository = createRepository<CustomsWorkbookGeneration>()

  const service = new TradeComplianceWorkbenchService(
    asRepository(batchRepository),
    asRepository(reviewItemRepository),
    asRepository(controlledGoodsRepository),
    asRepository(supplierRepository),
    asRepository(productRepository),
    asRepository(workbookRepository)
  )

  return {
    service,
    batchRepository,
    reviewItemRepository,
    controlledGoodsRepository,
    supplierRepository,
    productRepository,
    workbookRepository
  }
}

describe('TradeComplianceWorkbenchService', () => {
  it('creates a scoped review batch with pending review items', async () => {
    const { service, batchRepository, reviewItemRepository } = createService()

    const result = await service.createReviewBatch(scope, {
      type: 'controlled_goods_file',
      sourceFileName: 'control.pdf',
      items: [
        {
          type: 'controlled_goods',
          title: '数字计算机',
          extractedData: { productName: '数字计算机', hsCode: '8471501010' },
          fields: [{ key: 'productName', label: '商品名称', extractedValue: '数字计算机' }]
        }
      ]
    })

    expect(result.batch.id).toBeTruthy()
    expect(result.batch.tenantId).toBe(scope.tenantId)
    expect(result.batch.type).toBe('controlled_goods_file')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.reviewStatus).toBe('pending')
    expect(batchRepository.items).toHaveLength(1)
    expect(reviewItemRepository.items).toHaveLength(1)
  })

  it('confirms one item and preserves confirmed values', async () => {
    const { service, reviewItemRepository } = createService()
    const result = await service.createReviewBatch(scope, {
      type: 'controlled_goods_file',
      items: [{ type: 'controlled_goods', title: '服务器', extractedData: { productName: '服务器' } }]
    })

    const confirmed = await service.confirmReviewItem(scope, result.items[0]!.id!, { productName: '服务器' })

    expect(confirmed.reviewStatus).toBe('confirmed')
    expect(confirmed.confirmedData).toEqual({ productName: '服务器' })
    expect(reviewItemRepository.items[0]?.reviewStatus).toBe('confirmed')
  })

  it('confirms multiple review items', async () => {
    const { service } = createService()
    const result = await service.createReviewBatch(scope, {
      type: 'supplier_contract',
      items: [
        { type: 'supplier_product', title: 'HPC-8208', extractedData: { productName: '服务器' } },
        { type: 'supplier_product', title: 'HPC-7242', extractedData: { productName: '服务器' } }
      ]
    })

    const confirmed = await service.confirmReviewItems(scope, result.items.map((item) => item.id!))

    expect(confirmed).toHaveLength(2)
    expect(confirmed.every((item) => item.reviewStatus === 'confirmed')).toBe(true)
  })

  it('saves controlled goods and supplier products from confirmed data', async () => {
    const { service, controlledGoodsRepository, productRepository, supplierRepository } = createService()

    const controlledGoods = await service.saveControlledGoods(scope, {
      productName: '数字计算机',
      hsCode: '8471501010',
      keywords: ['数字计算机'],
      controlNote: 'APP 大于 8.0 WT 时需关注'
    })
    const product = await service.saveSupplierProduct(scope, {
      supplierName: '深圳市测试科技有限公司',
      productName: '服务器',
      model: 'HPC-8208',
      enrichedHsCode: '8471499100',
      controlledStatus: 'suspected'
    })

    expect(controlledGoods.enabled).toBe(true)
    expect(product.supplierName).toBe('深圳市测试科技有限公司')
    expect(supplierRepository.items).toHaveLength(1)
    expect(controlledGoodsRepository.items).toHaveLength(1)
    expect(productRepository.items).toHaveLength(1)
  })

  it('records a generated customs workbook', async () => {
    const { service, workbookRepository } = createService()

    const saved = await service.recordWorkbookGeneration(scope, {
      sourceFileName: 'sales-contract.docx',
      invoiceNo: 'INV-2026-001',
      contractNo: 'SC-2026-001',
      fileName: 'INV-2026-001-customs-workbook.xlsx',
      sheetNames: ['报关单', 'CI', 'Contract', 'PL']
    })

    expect(saved.status).toBe('generated')
    expect(saved.fileName).toBe('INV-2026-001-customs-workbook.xlsx')
    expect(workbookRepository.items).toHaveLength(1)
  })
})
