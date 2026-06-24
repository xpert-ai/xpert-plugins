// @ts-nocheck
import { __decorate, __metadata, __param } from "tslib";
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ControlledGoodsRecord, CustomsWorkbookGeneration, TradeComplianceImportBatch, TradeComplianceReviewItem, TradeProduct, TradeSupplier } from './entities/index.js';
let TradeComplianceWorkbenchService = class TradeComplianceWorkbenchService {
    constructor(batchRepository, reviewItemRepository, controlledGoodsRepository, supplierRepository, productRepository, workbookRepository) {
        this.batchRepository = batchRepository;
        this.reviewItemRepository = reviewItemRepository;
        this.controlledGoodsRepository = controlledGoodsRepository;
        this.supplierRepository = supplierRepository;
        this.productRepository = productRepository;
        this.workbookRepository = workbookRepository;
    }
    async createReviewBatch(scope, input) {
        const existingBatch = input.batchId
            ? await this.batchRepository.findOne({ where: { id: input.batchId } })
            : null;
        const itemScope = existingBatch ? scopeFromBatch(existingBatch, scope) : scope;
        const batch = existingBatch ?? await this.batchRepository.save(this.batchRepository.create({
            ...scopeColumns(scope),
            type: input.type,
            status: 'pending_review',
            sourceFileName: input.sourceFileName,
            metadata: input.metadata
        }));
        const dedupedItems = await this.deduplicateReviewItems(itemScope, input.items);
        const items = await this.reviewItemRepository.save(dedupedItems.map((item) => this.reviewItemRepository.create({
            ...scopeColumns(itemScope),
            batchId: batch.id,
            type: item.type,
            title: item.title,
            reviewStatus: 'pending',
            extractedData: item.extractedData,
            defaultData: item.defaultData,
            fields: item.fields,
            confidence: item.confidence,
            sourceLocation: item.sourceLocation
        })));
        return { batch, items };
    }
    async listReviewItems(scope, batchId) {
        return this.reviewItemRepository.find({
            where: {
                ...scopeWhere(scope),
                ...(batchId ? { batchId } : {})
            }
        });
    }
    async confirmReviewItem(scope, itemId, confirmedData) {
        const item = await this.reviewItemRepository.findOne({
            where: {
                ...scopeWhere(scope),
                id: itemId
            }
        });
        if (!item) {
            throw new NotFoundException(`Review item not found: ${itemId}`);
        }
        item.reviewStatus = 'confirmed';
        item.confirmedData = confirmedData ?? item.confirmedData ?? item.extractedData ?? item.defaultData ?? {};
        return this.reviewItemRepository.save(item);
    }
    async confirmReviewItems(scope, itemIds) {
        const confirmed = [];
        for (const itemId of itemIds) {
            confirmed.push(await this.confirmReviewItem(scope, itemId));
        }
        return confirmed;
    }
    async rejectReviewItem(scope, itemId) {
        const item = await this.reviewItemRepository.findOne({
            where: {
                ...scopeWhere(scope),
                id: itemId
            }
        });
        if (!item) {
            throw new NotFoundException(`Review item not found: ${itemId}`);
        }
        item.reviewStatus = 'rejected';
        return this.reviewItemRepository.save(item);
    }
    async rejectReviewItems(scope, itemIds) {
        const rejected = [];
        for (const itemId of itemIds) {
            rejected.push(await this.rejectReviewItem(scope, itemId));
        }
        return rejected;
    }
    async updateReviewItem(scope, itemId, data) {
        const item = await this.reviewItemRepository.findOne({ where: { ...scopeWhere(scope), id: itemId } });
        if (!item)
            throw new NotFoundException(`Review item not found: ${itemId}`);
        item.confirmedData = data;
        return this.reviewItemRepository.save(item);
    }
    async deleteReviewItem(scope, itemId) {
        const item = await this.reviewItemRepository.findOne({ where: { ...scopeWhere(scope), id: itemId } });
        if (!item)
            throw new NotFoundException(`Review item not found: ${itemId}`);
        await this.reviewItemRepository.delete({ ...scopeWhere(scope), id: itemId });
        return item;
    }
    async saveControlledGoods(scope, input) {
        const existing = await this.findDuplicateControlledGoods(scope, input);
        if (existing) {
            throw new ConflictException('管控商品已存在，请勿重复入库');
        }
        return this.controlledGoodsRepository.save(this.controlledGoodsRepository.create({
            ...scopeColumns(scope),
            productName: input.productName.trim(),
            hsCode: input.hsCode,
            keywords: input.keywords,
            controlNote: input.controlNote,
            enabled: input.enabled ?? true,
            sourceFileName: input.sourceFileName,
            sourceLocation: input.sourceLocation
        }));
    }
    async listControlledGoods(scope) {
        return this.controlledGoodsRepository.find({
            where: scopeWhere(scope)
        });
    }
    async updateControlledGoods(scope, id, input) {
        const item = await this.controlledGoodsRepository.findOne({ where: { ...scopeWhere(scope), id } });
        if (!item)
            throw new NotFoundException(`Controlled goods not found: ${id}`);
        Object.assign(item, input);
        return this.controlledGoodsRepository.save(item);
    }
    async deleteControlledGoods(scope, id) {
        const item = await this.controlledGoodsRepository.findOne({ where: { ...scopeWhere(scope), id } });
        if (!item)
            throw new NotFoundException(`Controlled goods not found: ${id}`);
        await this.controlledGoodsRepository.delete({ ...scopeWhere(scope), id });
        return item;
    }
    async saveSupplierProduct(scope, input) {
        const existing = await this.findDuplicateSupplierProduct(scope, input);
        if (existing) {
            throw new ConflictException('供应商商品已存在，请勿重复入库');
        }
        const supplier = await this.findOrCreateSupplier(scope, input);
        return this.productRepository.save(this.productRepository.create({
            ...scopeColumns(scope),
            supplierId: supplier.id,
            supplierName: supplier.name,
            productName: input.productName.trim(),
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
        }));
    }
    async listProducts(scope) {
        return this.productRepository.find({
            where: scopeWhere(scope)
        });
    }
    async updateSupplierProduct(scope, id, input) {
        const item = await this.productRepository.findOne({ where: { ...scopeWhere(scope), id } });
        if (!item)
            throw new NotFoundException(`Supplier product not found: ${id}`);
        Object.assign(item, input);
        return this.productRepository.save(item);
    }
    async deleteSupplierProduct(scope, id) {
        const item = await this.productRepository.findOne({ where: { ...scopeWhere(scope), id } });
        if (!item)
            throw new NotFoundException(`Supplier product not found: ${id}`);
        await this.productRepository.delete({ ...scopeWhere(scope), id });
        return item;
    }
    async recordWorkbookGeneration(scope, input) {
        return this.workbookRepository.save(this.workbookRepository.create({
            ...scopeColumns(scope),
            sourceFileName: input.sourceFileName,
            invoiceNo: input.invoiceNo,
            contractNo: input.contractNo,
            fileName: input.fileName,
            status: 'generated',
            sheetNames: input.sheetNames,
            workbookData: input.workbookData
        }));
    }
    async listWorkbookGenerations(scope) {
        return this.workbookRepository.find({
            where: scopeWhere(scope)
        });
    }
    async getWorkbookGeneration(scope, id) {
        const item = await this.workbookRepository.findOne({ where: { ...scopeWhere(scope), id } });
        if (!item)
            throw new NotFoundException(`Workbook generation not found: ${id}`);
        return item;
    }
    async deleteWorkbookGeneration(scope, id) {
        const item = await this.workbookRepository.findOne({ where: { ...scopeWhere(scope), id } });
        if (!item)
            throw new NotFoundException(`Workbook generation not found: ${id}`);
        await this.workbookRepository.delete({ ...scopeWhere(scope), id });
        return item;
    }
    async findOrCreateSupplier(scope, input) {
        const supplierName = input.supplierName.trim();
        const existing = await this.supplierRepository.findOne({
            where: {
                ...scopeWhere(scope),
                name: supplierName
            }
        });
        if (existing) {
            return existing;
        }
        return this.supplierRepository.save(this.supplierRepository.create({
            ...scopeColumns(scope),
            name: supplierName,
            creditCode: input.supplierCreditCode,
            address: input.supplierAddress
        }));
    }
    async findDuplicateControlledGoods(scope, input) {
        const productName = normalizeComparableText(input.productName);
        const hsCode = normalizeComparableText(input.hsCode);
        const candidates = await this.controlledGoodsRepository.find({
            where: scopeWhere(scope)
        });
        return candidates.find((item) => {
            const sameProduct = normalizeComparableText(item.productName) === productName;
            if (!sameProduct)
                return false;
            return hsCode ? normalizeComparableText(item.hsCode) === hsCode : !normalizeComparableText(item.hsCode);
        });
    }
    async findDuplicateSupplierProduct(scope, input) {
        const supplierName = normalizeComparableText(input.supplierName);
        const productName = normalizeComparableText(input.productName);
        const model = normalizeComparableText(input.model);
        const candidates = await this.productRepository.find({
            where: scopeWhere(scope)
        });
        return candidates.find((item) => {
            const sameSupplier = normalizeComparableText(item.supplierName) === supplierName;
            const sameProduct = normalizeComparableText(item.productName) === productName;
            if (!sameSupplier || !sameProduct)
                return false;
            return model ? normalizeComparableText(item.model) === model : !normalizeComparableText(item.model);
        });
    }
    async deduplicateReviewItems(scope, items) {
        const [existingReviewItems, existingControlledGoods, existingProducts] = await Promise.all([
            this.reviewItemRepository.find({ where: scopeWhere(scope) }),
            this.controlledGoodsRepository.find({ where: scopeWhere(scope) }),
            this.productRepository.find({ where: scopeWhere(scope) })
        ]);
        const existingKeys = new Set([
            ...existingReviewItems.filter(isActiveReviewItemForDedupe).map((item) => reviewItemDedupeKey(item.type, mergedReviewData(item))).filter(Boolean),
            ...existingControlledGoods.map((item) => controlledGoodsDedupeKey(item)).filter(Boolean),
            ...existingProducts.map((item) => supplierProductDedupeKey(item)).filter(Boolean)
        ]);
        const seen = new Set();
        return items.filter((item) => {
            const key = reviewItemDedupeKey(item.type, {
                ...item.defaultData,
                ...item.extractedData
            });
            if (!key)
                return true;
            if (existingKeys.has(key) || seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
    }
};
TradeComplianceWorkbenchService = __decorate([
    Injectable(),
    __param(0, InjectRepository(TradeComplianceImportBatch)),
    __param(1, InjectRepository(TradeComplianceReviewItem)),
    __param(2, InjectRepository(ControlledGoodsRecord)),
    __param(3, InjectRepository(TradeSupplier)),
    __param(4, InjectRepository(TradeProduct)),
    __param(5, InjectRepository(CustomsWorkbookGeneration)),
    __metadata("design:paramtypes", [Function, Function, Function, Function, Function, Function])
], TradeComplianceWorkbenchService);
export { TradeComplianceWorkbenchService };
function scopeColumns(scope) {
    return {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? undefined,
        workspaceId: scope.workspaceId ?? undefined,
        assistantId: scope.assistantId ?? undefined,
        createdById: scope.userId ?? undefined
    };
}
function scopeWhere(scope) {
    return {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? undefined
    };
}
function scopeFromBatch(batch, fallback) {
    return {
        tenantId: batch.tenantId ?? fallback.tenantId,
        organizationId: batch.organizationId ?? fallback.organizationId,
        workspaceId: batch.workspaceId ?? fallback.workspaceId,
        assistantId: batch.assistantId ?? fallback.assistantId,
        projectId: fallback.projectId,
        userId: batch.createdById ?? fallback.userId
    };
}
function normalizeComparableText(value) {
    return String(value ?? '').trim().toLowerCase();
}
function mergedReviewData(item) {
    return {
        ...item.defaultData,
        ...item.extractedData,
        ...item.confirmedData
    };
}
function isActiveReviewItemForDedupe(item) {
    const status = item.reviewStatus ?? 'pending';
    return status !== 'confirmed' && status !== 'rejected';
}
function reviewItemDedupeKey(type, data) {
    if (type === 'controlled_goods') {
        return controlledGoodsDedupeKey({
            productName: stringValue(data['productName']),
            hsCode: stringValue(data['hsCode'])
        });
    }
    if (type === 'supplier_product') {
        return supplierProductDedupeKey({
            supplierName: stringValue(data['supplierName']),
            productName: stringValue(data['productName']),
            model: stringValue(data['model'])
        });
    }
    return undefined;
}
function controlledGoodsDedupeKey(input) {
    const productName = normalizeComparableText(input.productName);
    if (!productName)
        return undefined;
    return ['controlled_goods', productName, normalizeComparableText(input.hsCode)].join('|');
}
function supplierProductDedupeKey(input) {
    const supplierName = normalizeComparableText(input.supplierName);
    const productName = normalizeComparableText(input.productName);
    if (!supplierName || !productName)
        return undefined;
    return ['supplier_product', supplierName, productName, normalizeComparableText(input.model)].join('|');
}
function stringValue(value) {
    return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}
