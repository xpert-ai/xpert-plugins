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
                tool(async (input) => stringify(await this.service.createReviewBatch(scope, { ...input, type: 'controlled_goods_file' })), {
                    name: TRADE_COMPLIANCE_TOOL_NAMES[0],
                    description: 'Save controlled goods entries extracted from an uploaded control catalog file into a review batch.',
                    schema: createReviewBatchSchema
                }),
                tool(async (input) => stringify(await this.service.createReviewBatch(scope, {
                    ...input,
                    type: 'supplier_contract',
                    items: await enrichSupplierReviewItemsWithHsCandidates(input.items, config)
                })), {
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
                tool(async (input) => stringify(await this.service.createReviewBatch(scope, { ...input, type: 'sales_contract' })), {
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
