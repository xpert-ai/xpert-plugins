// @ts-nocheck
import { __decorate, __metadata, __param } from "tslib";
import { Inject, Injectable, Optional } from '@nestjs/common';
import { tool } from '@langchain/core/tools';
import { readFile } from 'fs/promises';
import { dirname, isAbsolute, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { AgentMiddlewareStrategy, PLUGIN_CONFIG_RESOLVER_TOKEN, RequestContext } from '@xpert-ai/plugin-sdk';
import { z } from 'zod/v3';
import { TRADE_COMPLIANCE_FEATURE, TRADE_COMPLIANCE_ICON, TRADE_COMPLIANCE_MIDDLEWARE_NAME, TRADE_COMPLIANCE_PLUGIN_NAME, TRADE_COMPLIANCE_TOOL_NAMES } from './constants.js';
import { readTradeComplianceEnvDefaults, TradeComplianceWorkbenchConfigSchema } from './trade-compliance.config.js';
import { enrichProductWithFallback, searchHsBianmaCodes } from './trade-compliance.enrichment.js';
import { parseControlledGoodsFile } from './controlled-goods-file-parser.js';
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
const controlledGoodsExtractionFileSchema = z.object({
    batchId: z.string().optional(),
    sourceFileName: z.string().optional(),
    workspacePath: z.string().optional(),
    filePath: z.string().optional(),
    jsonPath: z.string().optional()
});
const controlledGoodsSourceFileSchema = z.object({
    batchId: z.string().optional(),
    sourceFileName: z.string().optional(),
    workspacePath: z.string().optional(),
    filePath: z.string().optional(),
    mimeType: z.string().optional()
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
                tool(async (input) => stringify(summarizeReviewBatchResult(await this.service.createReviewBatch(scope, { ...input, type: 'controlled_goods_file' }), input)), {
                    name: TRADE_COMPLIANCE_TOOL_NAMES[0],
                    description: 'Save controlled goods entries extracted from an uploaded control catalog file into a review batch. Prefer one call for small payloads. For large extraction results, write the extracted items to a workspace JSON file and call trade_compliance_save_controlled_goods_extraction_file instead of splitting fixed-size batches.',
                    schema: createReviewBatchSchema
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
                tool(async (input) => stringify(summarizeReviewBatchResult(await this.service.createReviewBatch(scope, { ...input, type: 'sales_contract' }), input)), {
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
                tool(async (input) => stringify(await this.saveControlledGoodsExtractionFile(scope, input)), {
                    name: TRADE_COMPLIANCE_TOOL_NAMES[7],
                    description: 'Save controlled goods extraction results from a workspace JSON file. Use this for large controlled-goods files to avoid large tool-call payloads. The JSON file can be an array of items or an object with an items array.',
                    schema: controlledGoodsExtractionFileSchema
                }),
                tool(async (input) => stringify(await this.parseControlledGoodsSourceFile(scope, input)), {
                    name: TRADE_COMPLIANCE_TOOL_NAMES[8],
                    description: 'Parse an uploaded controlled-goods catalog source file directly in plugin code and save the full extraction for review. Prefer this for large PDF/Excel catalogs so the model does not need to manually extract every row.',
                    schema: controlledGoodsSourceFileSchema
                })
            ]
        };
    }
    async saveControlledGoodsExtractionFile(scope, input) {
        const filePath = resolveWorkspaceJsonPath(input);
        const text = await readFile(filePath, 'utf8');
        const parsed = JSON.parse(text);
        const rawItems = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
        if (!Array.isArray(rawItems) || rawItems.length === 0) {
            throw new Error('JSON 文件中没有可保存的 items 数组');
        }
        const items = rawItems.map(toControlledGoodsReviewItem).filter(Boolean);
        const result = await this.service.createReviewBatch(scope, {
            batchId: input.batchId,
            type: 'controlled_goods_file',
            sourceFileName: input.sourceFileName ?? parsed?.sourceFileName,
            metadata: {
                ...(parsed?.metadata ?? {}),
                extractionFilePath: filePath,
                extractionFileItemCount: rawItems.length
            },
            items
        });
        return summarizeReviewBatchResult(result, { items });
    }
    async parseControlledGoodsSourceFile(scope, input) {
        const filePath = resolveWorkspaceFilePath(input);
        const buffer = await readFile(filePath);
        const parsed = await parseControlledGoodsFile({
            buffer,
            fileName: input.sourceFileName ?? filePath,
            mimeType: input.mimeType
        });
        if (!Array.isArray(parsed.candidates) || parsed.candidates.length === 0) {
            throw new Error('未能从管控商品文件中解析出可审核记录');
        }
        const items = parsed.candidates.map(toControlledGoodsCandidateReviewItem).filter(Boolean);
        const result = await this.service.createReviewBatch(scope, {
            batchId: input.batchId,
            type: 'controlled_goods_file',
            sourceFileName: input.sourceFileName ?? filePath.split('/').pop(),
            metadata: {
                sourceFilePath: filePath,
                parser: 'controlled-goods-file-parser',
                textLength: parsed.textLength,
                parsedCandidateCount: parsed.candidates.length,
                lowConfidenceCount: parsed.candidates.filter((candidate) => Number(candidate.confidence ?? 0) < 0.75).length,
                withoutHsCodeCount: parsed.candidates.filter((candidate) => !Array.isArray(candidate.hsCodes) || candidate.hsCodes.length === 0).length
            },
            items
        });
        return {
            ...summarizeReviewBatchResult(result, { items }),
            parsedCandidateCount: parsed.candidates.length,
            textLength: parsed.textLength,
            withoutHsCodeCount: parsed.candidates.filter((candidate) => !Array.isArray(candidate.hsCodes) || candidate.hsCodes.length === 0).length,
            lowConfidenceCount: parsed.candidates.filter((candidate) => Number(candidate.confidence ?? 0) < 0.75).length
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
function resolveWorkspaceJsonPath(input) {
    const value = stringValue(input?.jsonPath) ?? stringValue(input?.workspacePath) ?? stringValue(input?.filePath);
    if (!value) {
        throw new Error('缺少 JSON 文件路径，请传入 workspacePath、filePath 或 jsonPath');
    }
    return isAbsolute(value) ? value : resolve(value);
}
function resolveWorkspaceFilePath(input) {
    const value = stringValue(input?.workspacePath) ?? stringValue(input?.filePath);
    if (!value) {
        throw new Error('缺少源文件路径，请传入 workspacePath 或 filePath');
    }
    return isAbsolute(value) ? value : resolve(value);
}
function toControlledGoodsCandidateReviewItem(candidate) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
        return null;
    const hsCode = Array.isArray(candidate.hsCodes) ? candidate.hsCodes.join('\n') : stringValue(candidate.hsCode);
    const productName = stringValue(candidate.productName);
    const referenceNameCandidate = stringValue(candidate.referenceNameCandidate);
    const controlCode = stringValue(candidate.controlCode);
    const category = stringValue(candidate.category);
    const parseWarnings = Array.isArray(candidate.parseWarnings) ? candidate.parseWarnings.map((item) => stringValue(item)).filter(Boolean) : [];
    const displayName = productName ?? referenceNameCandidate ?? controlCode ?? stringValue(candidate.rawText)?.slice(0, 80);
    const controlNote = [
        category,
        controlCode ? `管制编码：${controlCode}` : undefined,
        referenceNameCandidate && !productName ? `候选商品名：${referenceNameCandidate}` : undefined,
        parseWarnings.length ? `解析提示：${parseWarnings.join('、')}` : undefined,
        stringValue(candidate.description) ?? stringValue(candidate.rawText)
    ]
        .filter(Boolean)
        .join('\n');
    const title = [controlCode, displayName].filter(Boolean).join(' ') || '管控商品';
    return {
        type: 'controlled_goods',
        title,
        extractedData: {
            productName,
            hsCode,
            keywords: [controlCode, category, productName, referenceNameCandidate].filter(Boolean),
            controlNote,
            enabled: true,
            controlCode,
            category,
            referenceNameCandidate,
            parseWarnings,
            parseStatus: parseWarnings.length ? 'needs_review' : 'parsed',
            description: stringValue(candidate.description),
            unit: stringValue(candidate.unit),
            rawText: stringValue(candidate.rawText)
        },
        fields: [
            { key: '序号', value: stringValue(candidate.sequence) },
            { key: '管制编码', value: controlCode },
            { key: '候选商品名', value: referenceNameCandidate },
            { key: '解析提示', value: parseWarnings.join('、') },
            { key: '海关编码', value: hsCode },
            { key: '单位', value: stringValue(candidate.unit) }
        ].filter((field) => field.value),
        confidence: typeof candidate.confidence === 'number' ? candidate.confidence : undefined,
        sourceLocation: stringValue(candidate.sourceLocation)
    };
}
function toControlledGoodsReviewItem(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return null;
    const extracted = raw.extractedData && typeof raw.extractedData === 'object' && !Array.isArray(raw.extractedData)
        ? raw.extractedData
        : raw;
    const productName = stringValue(extracted.productName) ?? stringValue(raw.productName) ?? stringValue(raw.title);
    const hsCode = stringValue(extracted.hsCode) ?? stringValue(raw.hsCode);
    const keywords = normalizeKeywords(extracted.keywords ?? raw.keywords);
    const controlNote = stringValue(extracted.controlNote) ?? stringValue(raw.controlNote);
    const title = stringValue(raw.title) ?? productName ?? hsCode;
    if (!title)
        return null;
    return {
        type: 'controlled_goods',
        title,
        extractedData: {
            productName,
            hsCode,
            keywords,
            controlNote,
            enabled: typeof extracted.enabled === 'boolean' ? extracted.enabled : typeof raw.enabled === 'boolean' ? raw.enabled : true
        },
        fields: Array.isArray(raw.fields) ? raw.fields : undefined,
        confidence: typeof raw.confidence === 'number' ? raw.confidence : undefined,
        sourceLocation: stringValue(raw.sourceLocation) ?? stringValue(extracted.sourceLocation)
    };
}
function normalizeKeywords(value) {
    if (Array.isArray(value))
        return value.map((item) => stringValue(item)).filter(Boolean);
    const text = stringValue(value);
    if (!text)
        return undefined;
    return text.split(/[,，;；、\n]/).map((item) => item.trim()).filter(Boolean);
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
