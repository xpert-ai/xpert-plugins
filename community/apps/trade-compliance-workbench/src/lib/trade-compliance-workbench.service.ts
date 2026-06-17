import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import {
  ControlledGoodsRecord,
  CustomsWorkbookGeneration,
  TradeComplianceImportBatch,
  TradeComplianceReviewItem,
  TradeProduct,
  TradeSupplier
} from './entities/index.js'
import type {
  ControlledGoodsStatus,
  ImportBatchType,
  ReviewItemType,
  TradeComplianceScope
} from './types.js'

export type CreateReviewBatchInput = {
  type: ImportBatchType
  sourceFileName?: string
  metadata?: Record<string, unknown>
  items: Array<{
    type: ReviewItemType
    title: string
    extractedData?: Record<string, unknown>
    defaultData?: Record<string, unknown>
    fields?: Array<Record<string, unknown>>
    confidence?: number
    sourceLocation?: string
  }>
}

export type SaveControlledGoodsInput = {
  productName: string
  hsCode?: string
  keywords?: string[]
  controlNote?: string
  enabled?: boolean
  sourceFileName?: string
  sourceLocation?: string
}

export type SaveSupplierProductInput = {
  supplierName: string
  supplierCreditCode?: string
  supplierAddress?: string
  productName: string
  model?: string
  description?: string
  quantity?: number
  unit?: string
  taxInclusiveUnitPrice?: number
  taxInclusiveTotalAmount?: number
  contractHsCode?: string
  enrichedHsCode?: string
  taxRefundRate?: string
  englishName?: string
  controlledStatus?: ControlledGoodsStatus
  controlNote?: string
  matchedControlledGoods?: Array<Record<string, unknown>>
}

export type RecordWorkbookGenerationInput = {
  sourceFileName?: string
  invoiceNo?: string
  contractNo?: string
  fileName: string
  sheetNames: string[]
  workbookData?: Record<string, unknown>
}

@Injectable()
export class TradeComplianceWorkbenchService {
  constructor(
    @InjectRepository(TradeComplianceImportBatch)
    private readonly batchRepository: Repository<TradeComplianceImportBatch>,
    @InjectRepository(TradeComplianceReviewItem)
    private readonly reviewItemRepository: Repository<TradeComplianceReviewItem>,
    @InjectRepository(ControlledGoodsRecord)
    private readonly controlledGoodsRepository: Repository<ControlledGoodsRecord>,
    @InjectRepository(TradeSupplier)
    private readonly supplierRepository: Repository<TradeSupplier>,
    @InjectRepository(TradeProduct)
    private readonly productRepository: Repository<TradeProduct>,
    @InjectRepository(CustomsWorkbookGeneration)
    private readonly workbookRepository: Repository<CustomsWorkbookGeneration>
  ) {}

  async createReviewBatch(scope: TradeComplianceScope, input: CreateReviewBatchInput) {
    const batch = await this.batchRepository.save(
      this.batchRepository.create({
        ...scopeColumns(scope),
        type: input.type,
        status: 'pending_review',
        sourceFileName: input.sourceFileName,
        metadata: input.metadata
      })
    )

    const items = await this.reviewItemRepository.save(
      input.items.map((item) =>
        this.reviewItemRepository.create({
          ...scopeColumns(scope),
          batchId: batch.id!,
          type: item.type,
          title: item.title,
          reviewStatus: 'pending',
          extractedData: item.extractedData,
          defaultData: item.defaultData,
          fields: item.fields,
          confidence: item.confidence,
          sourceLocation: item.sourceLocation
        })
      )
    )

    return { batch, items }
  }

  async listReviewItems(scope: TradeComplianceScope, batchId?: string) {
    return this.reviewItemRepository.find({
      where: {
        ...scopeWhere(scope),
        ...(batchId ? { batchId } : {})
      }
    })
  }

  async confirmReviewItem(scope: TradeComplianceScope, itemId: string, confirmedData?: Record<string, unknown>) {
    const item = await this.reviewItemRepository.findOne({
      where: {
        ...scopeWhere(scope),
        id: itemId
      }
    })
    if (!item) {
      throw new NotFoundException(`Review item not found: ${itemId}`)
    }

    item.reviewStatus = 'confirmed'
    item.confirmedData = confirmedData ?? item.confirmedData ?? item.extractedData ?? item.defaultData ?? {}
    return this.reviewItemRepository.save(item)
  }

  async confirmReviewItems(scope: TradeComplianceScope, itemIds: string[]) {
    const confirmed: TradeComplianceReviewItem[] = []
    for (const itemId of itemIds) {
      confirmed.push(await this.confirmReviewItem(scope, itemId))
    }
    return confirmed
  }

  async saveControlledGoods(scope: TradeComplianceScope, input: SaveControlledGoodsInput) {
    return this.controlledGoodsRepository.save(
      this.controlledGoodsRepository.create({
        ...scopeColumns(scope),
        productName: input.productName,
        hsCode: input.hsCode,
        keywords: input.keywords,
        controlNote: input.controlNote,
        enabled: input.enabled ?? true,
        sourceFileName: input.sourceFileName,
        sourceLocation: input.sourceLocation
      })
    )
  }

  async listControlledGoods(scope: TradeComplianceScope) {
    return this.controlledGoodsRepository.find({
      where: scopeWhere(scope)
    })
  }

  async saveSupplierProduct(scope: TradeComplianceScope, input: SaveSupplierProductInput) {
    const supplier = await this.findOrCreateSupplier(scope, input)
    return this.productRepository.save(
      this.productRepository.create({
        ...scopeColumns(scope),
        supplierId: supplier.id,
        supplierName: supplier.name,
        productName: input.productName,
        model: input.model,
        description: input.description,
        quantity: input.quantity,
        unit: input.unit,
        taxInclusiveUnitPrice: input.taxInclusiveUnitPrice,
        taxInclusiveTotalAmount: input.taxInclusiveTotalAmount,
        contractHsCode: input.contractHsCode,
        enrichedHsCode: input.enrichedHsCode,
        taxRefundRate: input.taxRefundRate,
        englishName: input.englishName,
        controlledStatus: input.controlledStatus ?? 'unchecked',
        controlNote: input.controlNote,
        matchedControlledGoods: input.matchedControlledGoods
      })
    )
  }

  async listProducts(scope: TradeComplianceScope) {
    return this.productRepository.find({
      where: scopeWhere(scope)
    })
  }

  async recordWorkbookGeneration(scope: TradeComplianceScope, input: RecordWorkbookGenerationInput) {
    return this.workbookRepository.save(
      this.workbookRepository.create({
        ...scopeColumns(scope),
        sourceFileName: input.sourceFileName,
        invoiceNo: input.invoiceNo,
        contractNo: input.contractNo,
        fileName: input.fileName,
        status: 'generated',
        sheetNames: input.sheetNames,
        workbookData: input.workbookData
      })
    )
  }

  async listWorkbookGenerations(scope: TradeComplianceScope) {
    return this.workbookRepository.find({
      where: scopeWhere(scope)
    })
  }

  private async findOrCreateSupplier(scope: TradeComplianceScope, input: SaveSupplierProductInput) {
    const existing = await this.supplierRepository.findOne({
      where: {
        ...scopeWhere(scope),
        name: input.supplierName
      }
    })
    if (existing) {
      return existing
    }
    return this.supplierRepository.save(
      this.supplierRepository.create({
        ...scopeColumns(scope),
        name: input.supplierName,
        creditCode: input.supplierCreditCode,
        address: input.supplierAddress
      })
    )
  }
}

function scopeColumns(scope: TradeComplianceScope) {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? undefined,
    workspaceId: scope.workspaceId ?? undefined,
    assistantId: scope.assistantId ?? undefined,
    createdById: scope.userId ?? undefined
  }
}

function scopeWhere(scope: TradeComplianceScope) {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? undefined
  }
}
