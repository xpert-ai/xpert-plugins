// @ts-nocheck
import { __decorate, __metadata, __param } from "tslib";
import { Inject, Injectable, Optional } from '@nestjs/common';
import { tool } from '@langchain/core/tools';
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { AgentMiddlewareStrategy, PLUGIN_CONFIG_RESOLVER_TOKEN, RequestContext } from '@xpert-ai/plugin-sdk';
import { z } from 'zod/v3';
import { TRADE_COMPLIANCE_FEATURE, TRADE_COMPLIANCE_ICON, TRADE_COMPLIANCE_MIDDLEWARE_NAME, TRADE_COMPLIANCE_PLUGIN_NAME, TRADE_COMPLIANCE_TOOL_NAMES } from './constants.js';
import { readTradeComplianceEnvDefaults, TradeComplianceWorkbenchConfigSchema } from './trade-compliance.config.js';
import { enrichProductWithFallback, searchHsBianmaCodes } from './trade-compliance.enrichment.js';
import { matchControlledGoods } from './trade-compliance.matching.js';
import { buildCustomsWorkbookModel, createCustomsWorkbookFromTemplateBuffer } from './trade-compliance-workbook.js';
import { TradeComplianceWorkbenchService } from './trade-compliance-workbench.service.js';
import { getControlledGoodsExtractedTextChunk } from './controlled-goods-extracted-text-store.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const reviewItemSchema = z.object({
    type: z.enum(['controlled_goods', 'supplier_product', 'customs_workbook']),
    title: z.string().min(1),
    extractedData: z.record(z.unknown()).optional(),
    defaultData: z.record(z.unknown()).optional(),
    fields: z.array(z.record(z.unknown())).optional(),
    confidence: z.number().min(0).max(1).optional(),
    sourceLocation: z.string().optional()
});
const createReviewBatchSchema = z.object({
    batchId: z.string().optional(),
    sourceFileName: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
    items: z.array(reviewItemSchema).default([])
});
const controlledGoodsRowsSchema = z.object({
    batchId: z.string().optional(),
    sourceFileName: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
    items: z.array(reviewItemSchema).optional(),
    rows: z.array(z.object({
        productName: z.string().optional(),
        hsCode: z.string().optional(),
        keywords: z.array(z.string()).optional(),
        controlNote: z.string().optional().describe('Only fill when the source row explicitly states a control basis, license requirement, prohibition, restriction, or compliance note. Leave empty for generic chapter/category labels; do not invent text.'),
        enabled: z.boolean().optional(),
        sequence: z.string().optional(),
        controlCode: z.string().optional(),
        sectionPath: z.string().optional().describe('Source chapter, sheet, or section path. Do not copy this into controlNote.'),
        rawText: z.string().optional().describe('Original row text from the source. Do not copy this into controlNote unless it explicitly is a control note.'),
        sourcePage: z.string().optional(),
        sourceLocation: z.string().optional(),
        confidence: z.number().min(0).max(1).optional()
    })).optional()
});
const controlledGoodsTextChunkSchema = z.object({
    batchId: z.string().min(1),
    chunkIndex: z.number().int().min(1).default(1)
});
const productSchema = z.object({
    productName: z.string().optional(),
    model: z.string().optional(),
    description: z.string().optional(),
    hsCode: z.string().optional()
});
const controlledGoodsCandidateSchema = z.object({
    id: z.string(),
    productName: z.string().optional(),
    hsCode: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    controlNote: z.string().optional(),
    enabled: z.boolean().optional()
});
const workbookSchema = z.object({
    source: z.record(z.unknown()),
    defaults: z.record(z.unknown()).optional()
});
const generatedWorkbookSchema = z.object({
    sourceFileName: z.string().optional(),
    invoiceNo: z.string().optional(),
    contractNo: z.string().optional(),
    fileName: z.string().min(1),
    sheetNames: z.array(z.string()).default(['报关单', 'CI', 'Contract', 'PL']),
    workbookData: z.record(z.unknown()).optional()
});
let TradeComplianceWorkbenchMiddleware = class TradeComplianceWorkbenchMiddleware {
    constructor(service, pluginConfigResolver) {
        this.service = service;
        this.pluginConfigResolver = pluginConfigResolver;
        this.meta = {
            name: TRADE_COMPLIANCE_MIDDLEWARE_NAME,
            label: {
                en_US: 'Trade Compliance Workbench',
                zh_Hans: '外贸合规工作台'
            },
            description: {
                en_US: 'Tools for controlled goods review, supplier product extraction, enrichment, and customs workbook generation.',
                zh_Hans: '提供管控商品识别、供应商商品抽取、商品补全和报关资料生成工具。'
            },
            icon: {
                type: 'svg',
                value: TRADE_COMPLIANCE_ICON,
                color: '#0f766e'
            },
            features: [TRADE_COMPLIANCE_FEATURE],
            configSchema: {
                type: 'object',
                properties: {}
            }
        };
    }
    createMiddleware(_options, context) {
        const scope = scopeFromContext(context);
        const config = this.resolveConfig();
        return {
            name: TRADE_COMPLIANCE_MIDDLEWARE_NAME,
            tools: [
                tool(async (input) => {
                    const normalizedInput = normalizeControlledGoodsExtractionInput(input);
                    return stringify(summarizeReviewBatchResult(await this.service.createReviewBatch(scope, { ...normalizedInput, type: 'controlled_goods_file' }), normalizedInput));
                }, {
                    name: TRADE_COMPLIANCE_TOOL_NAMES[0],
                    description: 'Save controlled goods entries extracted from an uploaded control catalog file into a review batch. Prefer the compact rows field for hundreds or thousands of records; the plugin converts rows into review items. Use one call with the same batchId whenever possible.',
                    schema: controlledGoodsRowsSchema
                }),
                tool(async (input) => stringify(summarizeReviewBatchResult(await this.service.createReviewBatch(scope, {
                    ...input,
                    type: 'supplier_contract',
                    items: await enrichSupplierReviewItemsWithHsCandidates(input.items, config)
                }), input)), {
                    name: TRADE_COMPLIANCE_TOOL_NAMES[1],
                    description: 'Save supplier and product information extracted from a supplier contract into a review batch.',
                    schema: createReviewBatchSchema
                }),
                tool(async (input) => stringify(await enrichProductWithFallback(input, {
                    hsbianma: {
                        baseUrl: config.enrichment?.apiBaseUrl,
                        timeoutMs: config.enrichment?.timeoutMs
                    }
                })), {
                    name: TRADE_COMPLIANCE_TOOL_NAMES[2],
                    description: 'Enrich a product with HS code, tax refund rate, and English product name by querying HS编码网 HTML search results and parsing the result table.',
                    schema: productSchema
                }),
                tool(async (input) => stringify(matchControlledGoods(input.product, input.candidates.map((candidate) => ({
                    id: candidate.id ?? '',
                    productName: candidate.productName,
                    hsCode: candidate.hsCode,
                    keywords: candidate.keywords,
                    controlNote: candidate.controlNote,
                    enabled: candidate.enabled
                })))), {
                    name: TRADE_COMPLIANCE_TOOL_NAMES[3],
                    description: 'Match product information against explicit controlled goods records using HS code, product name, description, and keywords.',
                    schema: z.object({
                        product: productSchema,
                        candidates: z.array(controlledGoodsCandidateSchema)
                    })
                }),
                tool(async (input) => {
                    const normalizedInput = normalizeSalesContractExtractionInput(input);
                    return stringify(summarizeReviewBatchResult(await this.service.createReviewBatch(scope, { ...normalizedInput, type: 'sales_contract' }), normalizedInput));
                }, {
                    name: TRADE_COMPLIANCE_TOOL_NAMES[4],
                    description: 'Save sales contract extraction results for review before customs workbook generation.',
                    schema: createReviewBatchSchema
                }),
                tool(async (input) => {
                    const model = buildCustomsWorkbookModel(input.source, input.defaults ?? {});
                    const template = await readFile(join(__dirname, '..', 'assets', 'customs-workbook-template.xls'));
                    const workbook = await createCustomsWorkbookFromTemplateBuffer(model, template);
                    return stringify({
                        model,
                        fileName: workbook.fileName,
                        sheetNames: workbook.sheetNames,
                        mimeType: workbook.mimeType,
                        bookType: workbook.bookType,
                        byteLength: workbook.buffer.length
                    });
                }, {
                    name: TRADE_COMPLIANCE_TOOL_NAMES[5],
                    description: 'Prepare customs workbook preview data by merging extracted sales contract fields with template defaults.',
                    schema: workbookSchema
                }),
                tool(async (input) => stringify(await this.service.recordWorkbookGeneration(scope, input)), {
                    name: TRADE_COMPLIANCE_TOOL_NAMES[6],
                    description: 'Record a generated customs workbook after human review confirmation.',
                    schema: generatedWorkbookSchema
                }),
                tool(async (input) => stringify(getControlledGoodsExtractedTextChunk(input.batchId, input.chunkIndex)), {
                    name: TRADE_COMPLIANCE_TOOL_NAMES[7],
                    description: 'Read the next lossless text chunk converted from the uploaded controlled goods file. Use this when the initial prompt says the converted text has multiple chunks; process and save each chunk with the same batchId until hasMore is false.',
                    schema: controlledGoodsTextChunkSchema
                })
            ]
        };
    }
    resolveConfig() {
        const defaults = readTradeComplianceEnvDefaults();
        const pluginConfig = this.pluginConfigResolver?.resolve(TRADE_COMPLIANCE_PLUGIN_NAME, {
            defaults
        }) ?? defaults;
        return TradeComplianceWorkbenchConfigSchema.parse(pluginConfig);
    }
};
TradeComplianceWorkbenchMiddleware = __decorate([
    Injectable(),
    AgentMiddlewareStrategy(TRADE_COMPLIANCE_MIDDLEWARE_NAME),
    __param(1, Optional()),
    __param(1, Inject(PLUGIN_CONFIG_RESOLVER_TOKEN)),
    __metadata("design:paramtypes", [TradeComplianceWorkbenchService, Object])
], TradeComplianceWorkbenchMiddleware);
export { TradeComplianceWorkbenchMiddleware };
function scopeFromContext(context) {
    return {
        tenantId: context.tenantId ?? RequestContext.currentTenantId(),
        organizationId: context.organizationId === undefined ? RequestContext.getOrganizationId() : context.organizationId,
        workspaceId: context.workspaceId ?? null,
        assistantId: context.xpertId ?? null,
        projectId: context.projectId ?? null,
        userId: context.userId ?? RequestContext.currentUserId()
    };
}
function stringify(value) {
    return JSON.stringify(value, null, 2);
}
function summarizeReviewBatchResult(result, input) {
    const attemptedCount = Array.isArray(input?.items) ? input.items.length : undefined;
    const savedCount = Array.isArray(result?.items) ? result.items.length : 0;
    return {
        batchId: result?.batch?.id,
        type: result?.batch?.type,
        status: result?.batch?.status,
        sourceFileName: result?.batch?.sourceFileName,
        attemptedCount,
        savedCount,
        skippedDuplicateCount: typeof attemptedCount === 'number' ? Math.max(0, attemptedCount - savedCount) : undefined
    };
}
function normalizeControlledGoodsExtractionInput(input) {
    const items = Array.isArray(input?.items) && input.items.length > 0
        ? input.items
        : Array.isArray(input?.rows)
            ? input.rows.map(toControlledGoodsReviewItemFromRow).filter(Boolean)
            : [];
    return {
        batchId: input?.batchId,
        sourceFileName: input?.sourceFileName,
        metadata: {
            ...(input?.metadata ?? {}),
            inputMode: Array.isArray(input?.rows) && (!Array.isArray(input?.items) || input.items.length === 0) ? 'compact_rows' : 'items',
            rowCount: Array.isArray(input?.rows) ? input.rows.length : undefined
        },
        items
    };
}
function normalizeSalesContractExtractionInput(input) {
    const sourceItems = Array.isArray(input?.items) ? input.items : [];
    const workbookItems = sourceItems.filter((item) => item?.type === 'customs_workbook');
    if (workbookItems.length <= 1) {
        return { ...input, items: workbookItems.length ? workbookItems : sourceItems };
    }
    const mainItem = workbookItems.find((item) => isSalesContractHeaderData(mergeReviewData(item))) ?? workbookItems[0];
    const mainData = mergeReviewData(mainItem);
    const detailRows = workbookItems
        .filter((item) => item !== mainItem)
        .map((item) => toSalesContractLineItem(mergeReviewData(item)))
        .filter(Boolean);
    const existingLines = Array.isArray(mainData.items) ? mainData.items : [];
    const mergedData = {
        ...mainData,
        items: dedupeSalesContractLineItems([...existingLines, ...detailRows])
    };
    return {
        ...input,
        items: [{
                ...mainItem,
                title: mainItem.title || buildSalesContractTitle(mergedData),
                extractedData: mergedData,
                defaultData: mainItem.defaultData,
                fields: mainItem.fields,
                sourceLocation: mainItem.sourceLocation
            }]
    };
}
function mergeReviewData(item) {
    return {
        ...(item?.defaultData ?? {}),
        ...(item?.extractedData ?? {})
    };
}
function isSalesContractHeaderData(data) {
    return Boolean(stringValue(data.invoiceNo) || stringValue(data.contractNo) || stringValue(data.buyerName) || stringValue(data.sellerName));
}
function toSalesContractLineItem(data) {
    const productName = stringValue(data.productName) ?? stringValue(data.name) ?? stringValue(data.description);
    const description = stringValue(data.description) ?? productName;
    const hasLineData = productName || stringValue(data.model) || stringValue(data.hsCode) || data.quantity != null || data.unitPrice != null || data.amount != null;
    if (!hasLineData)
        return null;
    return {
        productName,
        englishName: stringValue(data.englishName),
        model: stringValue(data.model),
        description,
        quantity: data.quantity,
        unit: stringValue(data.unit),
        unitPrice: data.unitPrice ?? data.taxInclusiveUnitPrice,
        amount: data.amount ?? data.taxInclusiveTotalAmount,
        hsCode: stringValue(data.hsCode ?? data.contractHsCode ?? data.enrichedHsCode),
        netWeight: data.netWeight,
        grossWeight: data.grossWeight
    };
}
function dedupeSalesContractLineItems(items) {
    const seen = new Set();
    return items.filter((item) => {
        const key = [item.productName, item.model, item.hsCode, item.quantity, item.unitPrice, item.amount].map((value) => String(value ?? '').trim()).join('|');
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
function buildSalesContractTitle(data) {
    return ['购销合同', data.contractNo].filter(Boolean).join(' ') || '购销合同';
}
function toControlledGoodsReviewItemFromRow(row) {
    if (!row || typeof row !== 'object' || Array.isArray(row))
        return null;
    const productName = stringValue(row.productName) ?? stringValue(row.rawText)?.slice(0, 80);
    const hsCode = stringValue(row.hsCode);
    const controlCode = stringValue(row.controlCode);
    const sectionPath = stringValue(row.sectionPath);
    const rawText = stringValue(row.rawText);
    const keywords = normalizeControlledGoodsKeywords(row.keywords, [controlCode, sectionPath, productName, hsCode]);
    const title = [controlCode, productName].filter(Boolean).join(' ') || hsCode || '管控商品';
    const controlNote = stringValue(row.controlNote);
    return {
        type: 'controlled_goods',
        title,
        extractedData: {
            productName,
            hsCode,
            keywords,
            controlNote,
            enabled: typeof row.enabled === 'boolean' ? row.enabled : true,
            sequence: stringValue(row.sequence),
            controlCode,
            sectionPath,
            rawText,
            sourcePage: stringValue(row.sourcePage)
        },
        fields: [
            { key: '序号', value: stringValue(row.sequence) },
            { key: '管制编码', value: controlCode },
            { key: '海关编码', value: hsCode },
            { key: '来源', value: stringValue(row.sourceLocation) }
        ].filter((field) => field.value),
        confidence: typeof row.confidence === 'number' ? row.confidence : undefined,
        sourceLocation: stringValue(row.sourceLocation)
    };
}
function normalizeControlledGoodsKeywords(value, fallback) {
    const values = Array.isArray(value) ? value : fallback;
    return [...new Set(values.map((item) => stringValue(item)).filter(Boolean))];
}
async function enrichSupplierReviewItemsWithHsCandidates(items, config) {
    const list = Array.isArray(items) ? items : [];
    const enriched = [];
    for (const item of list) {
        if (item?.type !== 'supplier_product') {
            enriched.push(item);
            continue;
        }
        const sanitizedItem = sanitizeSupplierReviewItem(item);
        const defaultData = { ...(sanitizedItem.defaultData || {}) };
        if (Array.isArray(defaultData.hsCodeCandidates) && defaultData.hsCodeCandidates.length > 0) {
            enriched.push(sanitizedItem);
            continue;
        }
        const data = { ...defaultData, ...(sanitizedItem.extractedData || {}) };
        const keyword = buildSupplierHsCandidateKeyword(data);
        if (!keyword) {
            enriched.push({
                ...sanitizedItem,
                defaultData: {
                    ...defaultData,
                    hsCodeLookupStatus: 'not_ready',
                    hsCodeLookupNote: '缺少商品名称、型号或合同海关编码，无法自动查询候选编码'
                }
            });
            continue;
        }
        try {
            const candidates = await searchSupplierHsCandidatesForDefault(keyword, config);
            const contractHsCode = resolveSupplierContractHsCode(data.contractHsCode);
            const suggestion = resolveSupplierHsSuggestion(candidates, contractHsCode);
            enriched.push({
                ...sanitizedItem,
                defaultData: {
                    ...defaultData,
                    hsCodeLookupKeyword: keyword,
                    hsCodeLookupStatus: candidates.length > 0 ? 'pending_confirmation' : 'not_found',
                    hsCodeCandidateCount: candidates.length,
                    suggestedHsCode: suggestion?.code,
                    suggestedHsCodeName: suggestion?.name,
                    suggestedHsCodeEnglishName: suggestion?.englishName,
                    suggestedTaxRefundRate: suggestion?.taxRefundRate,
                    enrichedHsCode: contractHsCode ?? suggestion?.code,
                    taxRefundRate: suggestion?.taxRefundRate,
                    englishName: suggestion?.englishName,
                    hsCodeCandidates: candidates
                }
            });
        }
        catch (error) {
            enriched.push({
                ...sanitizedItem,
                defaultData: {
                    ...defaultData,
                    hsCodeLookupKeyword: keyword,
                    hsCodeLookupStatus: 'failed',
                    hsCodeLookupError: summarizeHsLookupError(error),
                    hsCodeCandidates: []
                }
            });
        }
    }
    return enriched;
}
async function searchSupplierHsCandidatesForDefault(keyword, config) {
    const result = await searchHsBianmaCodes({
        keywords: keyword,
        page: 1,
        filterFailureCode: true,
        displayChapter: false,
        displayEnName: true
    }, {
        baseUrl: config?.enrichment?.apiBaseUrl,
        timeoutMs: config?.enrichment?.timeoutMs
    });
    return result.results ?? [];
}
function resolveSupplierHsSuggestion(candidates, contractHsCode) {
    const normalizedContractHsCode = normalizeHsCode(contractHsCode);
    if (normalizedContractHsCode) {
        const exact = candidates.find((candidate) => normalizeHsCode(candidate?.code) === normalizedContractHsCode);
        if (exact)
            return exact;
    }
    return candidates[0];
}
function normalizeHsCode(value) {
    const text = stringValue(value);
    if (!text)
        return undefined;
    const digits = text.replace(/\D/g, '');
    return digits || text;
}
function sanitizeSupplierReviewItem(item) {
    return {
        ...item,
        extractedData: item.extractedData,
        defaultData: item.defaultData
    };
}
function buildSupplierHsCandidateKeyword(data) {
    const contractHsCode = resolveSupplierContractHsCode(data.contractHsCode);
    if (contractHsCode)
        return contractHsCode;
    const productName = stringValue(data.productName);
    const model = stringValue(data.model);
    const description = stringValue(data.description);
    const keyword = [productName, model].filter(Boolean).join(' ').trim();
    if (keyword)
        return keyword.slice(0, 100);
    return description ? description.slice(0, 100) : undefined;
}
function resolveSupplierContractHsCode(value) {
    const text = stringValue(value);
    if (!text)
        return undefined;
    const digits = text.replace(/\D/g, '');
    return /^\d{8,10}$/.test(digits) ? digits : undefined;
}
function stringValue(value) {
    const text = String(value ?? '').trim();
    return text ? text : undefined;
}
function summarizeHsLookupError(error) {
    if (error instanceof Error)
        return error.message.slice(0, 300);
    return String(error).slice(0, 300);
}
