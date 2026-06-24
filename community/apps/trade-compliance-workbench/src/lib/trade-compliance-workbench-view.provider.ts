// @ts-nocheck
import { __decorate, __metadata } from "tslib";
import { Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { renderRemoteReactIframeHtml, ViewExtensionProvider } from '@xpert-ai/plugin-sdk';
import { AGENT_WORKBENCH_FIXED_SLOT, AGENT_WORKBENCH_MAIN_SLOT, TRADE_COMPLIANCE_FEATURE, TRADE_COMPLIANCE_ICON, TRADE_COMPLIANCE_PLUGIN_NAME, TRADE_COMPLIANCE_PROVIDER_KEY, TRADE_COMPLIANCE_REMOTE_ENTRY_KEY, TRADE_COMPLIANCE_VIEW_KEY } from './constants.js';
import { TradeComplianceWorkbenchService } from './trade-compliance-workbench.service.js';
import { buildCustomsWorkbookModel, buildCustomsWorkbookTemplateFileName, createCustomsWorkbookFromTemplateBuffer, readCustomsWorkbookTemplateSheetNames } from './trade-compliance-workbook.js';
import { parseControlledGoodsFile } from './controlled-goods-file-parser.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const requireFromHere = createRequire(__filename);
const text = (en_US, zh_Hans) => ({ en_US, zh_Hans });
const CONTROLLED_GOODS_BATCH_SIZE = 40;
let TradeComplianceWorkbenchViewProvider = class TradeComplianceWorkbenchViewProvider {
    constructor(service) {
        this.service = service;
    }
    supports(context) {
        return context.hostType === 'agent';
    }
    getViewManifests(_context, slot) {
        if (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT) {
            return [];
        }
        return [
            {
                key: TRADE_COMPLIANCE_VIEW_KEY,
                title: text('Trade Compliance Workbench', '外贸合规工作台'),
                description: text('Manage controlled goods, supplier products, and generated customs workbooks.', '管理管控商品、供应商商品和生成的报关资料。'),
                icon: {
                    type: 'svg',
                    value: TRADE_COMPLIANCE_ICON
                },
                hostType: 'agent',
                slot,
                order: 40,
                refreshable: true,
                activation: {
                    requiredFeatures: [TRADE_COMPLIANCE_FEATURE]
                },
                source: {
                    provider: TRADE_COMPLIANCE_PROVIDER_KEY,
                    plugin: TRADE_COMPLIANCE_PLUGIN_NAME
                },
                view: {
                    type: 'remote_component',
                    runtime: 'react',
                    protocolVersion: 1,
                    component: {
                        isolation: 'iframe',
                        entry: TRADE_COMPLIANCE_REMOTE_ENTRY_KEY
                    },
                    dataSource: {
                        mode: 'platform'
                    }
                },
                dataSource: {
                    mode: 'platform',
                    querySchema: {
                        supportsPagination: true,
                        supportsSearch: true,
                        supportsParameters: true,
                        defaultPageSize: 20
                    },
                    cache: {
                        enabled: false
                    }
                },
                clientCommands: [
                    {
                        key: 'assistant.chat.send_message',
                        label: text('Send to Assistant Chat', '发送到 Assistant 对话')
                    }
                ],
                actions: [
                    { key: 'refresh', label: text('Refresh', '刷新'), icon: 'ri-refresh-line', placement: 'toolbar', actionType: 'refresh' },
                    {
                        key: 'upload_controlled_goods_file',
                        label: text('Upload Controlled Goods File', '上传管控商品文件'),
                        icon: 'ri-upload-cloud-line',
                        placement: 'toolbar',
                        actionType: 'invoke',
                        transport: 'file'
                    },
                    {
                        key: 'upload_supplier_contract',
                        label: text('Upload Supplier Contract', '上传供应商合同'),
                        icon: 'ri-file-list-3-line',
                        placement: 'toolbar',
                        actionType: 'invoke',
                        transport: 'file'
                    },
                    {
                        key: 'upload_sales_contract',
                        label: text('Upload Sales Contract', '上传购销合同'),
                        icon: 'ri-file-excel-2-line',
                        placement: 'toolbar',
                        actionType: 'invoke',
                        transport: 'file'
                    },
                    { key: 'confirm_review_item', label: text('Confirm Item', '确认单条'), icon: 'ri-check-line', actionType: 'invoke' },
                    { key: 'confirm_review_items', label: text('Confirm Selected', '批量确认'), icon: 'ri-check-double-line', actionType: 'invoke' },
                    { key: 'reject_review_item', label: text('Reject Item', '驳回单条'), icon: 'ri-close-line', actionType: 'invoke' },
                    { key: 'reject_review_items', label: text('Reject Selected', '批量驳回'), icon: 'ri-close-circle-line', actionType: 'invoke' },
                    { key: 'save_controlled_goods', label: text('Save Controlled Goods', '保存管控商品'), icon: 'ri-save-line', actionType: 'invoke' },
                    { key: 'save_supplier_product', label: text('Save Supplier Product', '保存供应商商品'), icon: 'ri-save-line', actionType: 'invoke' },
                    { key: 'update_review_item', label: text('Update Review Item', '更新审核项'), icon: 'ri-edit-line', actionType: 'invoke' },
                    { key: 'delete_review_item', label: text('Delete Review Item', '删除审核项'), icon: 'ri-delete-bin-line', actionType: 'invoke' },
                    { key: 'update_controlled_goods', label: text('Update Controlled Goods', '更新管控商品'), icon: 'ri-edit-line', actionType: 'invoke' },
                    { key: 'delete_controlled_goods', label: text('Delete Controlled Goods', '删除管控商品'), icon: 'ri-delete-bin-line', actionType: 'invoke' },
                    { key: 'update_supplier_product', label: text('Update Supplier Product', '更新供应商商品'), icon: 'ri-edit-line', actionType: 'invoke' },
                    { key: 'delete_supplier_product', label: text('Delete Supplier Product', '删除供应商商品'), icon: 'ri-delete-bin-line', actionType: 'invoke' },
                    { key: 'delete_customs_workbook', label: text('Delete Workbook', '删除销售发票'), icon: 'ri-delete-bin-line', actionType: 'invoke' },
                    { key: 'download_customs_workbook', label: text('Download Workbook', '下载销售发票'), icon: 'ri-download-line', actionType: 'invoke' },
                    { key: 'generate_customs_workbook', label: text('Generate Workbook', '生成报关资料'), icon: 'ri-file-excel-line', actionType: 'invoke' }
                ]
            }
        ];
    }
    async getRemoteComponentEntry(_context, viewKey, component) {
        if (viewKey !== TRADE_COMPLIANCE_VIEW_KEY || component.entry !== TRADE_COMPLIANCE_REMOTE_ENTRY_KEY) {
            return {
                html: '<!doctype html><html><body>Unsupported trade compliance component.</body></html>',
                contentType: 'text/html; charset=utf-8'
            };
        }
        const appScript = await readFile(join(__dirname, 'remote-components', TRADE_COMPLIANCE_REMOTE_ENTRY_KEY, 'app.js'), 'utf8');
        const reactUmd = await readPackageFile('react', 'umd/react.production.min.js');
        const reactDomUmd = await readPackageFile('react-dom', 'umd/react-dom.production.min.js');
        return {
            html: renderRemoteReactIframeHtml({
                title: 'Trade Compliance Workbench',
                lang: 'zh-Hans',
                reactUmd,
                reactDomUmd,
                appScript
            }),
            contentType: 'text/html; charset=utf-8'
        };
    }
    async getViewData(context, _viewKey, _query) {
        const scope = scopeFromContext(context);
        const [reviewItems, controlledGoods, products, workbookGenerations] = await Promise.all([
            this.service.listReviewItems(scope),
            this.service.listControlledGoods(scope),
            this.service.listProducts(scope),
            this.service.listWorkbookGenerations(scope)
        ]);
        return {
            items: reviewItems,
            total: reviewItems.length,
            summary: {
                reviewItems,
                controlledGoods,
                products,
                workbookGenerations
            }
        };
    }
    async executeViewAction(context, _viewKey, actionKey, request) {
        const scope = scopeFromContext(context);
        if (actionKey === 'confirm_review_item') {
            const itemId = readString(request.input, 'itemId');
            if (!itemId) {
                return failure('itemId is required', '缺少 itemId');
            }
            const item = await this.service.confirmReviewItem(scope, itemId, readRecord(request.input, 'confirmedData'));
            return success(await this.materializeConfirmedReviewItem(scope, item));
        }
        if (actionKey === 'confirm_review_items') {
            const itemIds = readStringArray(request.input, 'itemIds');
            const items = await this.service.confirmReviewItems(scope, itemIds);
            return success(await Promise.all(items.map((item) => this.materializeConfirmedReviewItem(scope, item))));
        }
        if (actionKey === 'reject_review_item') {
            const itemId = readString(request.input, 'itemId');
            if (!itemId) {
                return failure('itemId is required', '缺少 itemId');
            }
            return success(await this.service.rejectReviewItem(scope, itemId));
        }
        if (actionKey === 'reject_review_items') {
            const itemIds = readStringArray(request.input, 'itemIds');
            return success(await this.service.rejectReviewItems(scope, itemIds));
        }
        if (actionKey === 'update_review_item') {
            const itemId = readString(request.input, 'itemId');
            const confirmedData = readRecord(request.input, 'confirmedData');
            if (!itemId || !confirmedData)
                return failure('itemId and confirmedData are required', '缺少 itemId 或更新数据');
            return success(await this.service.updateReviewItem(scope, itemId, confirmedData));
        }
        if (actionKey === 'delete_review_item') {
            const itemId = readString(request.input, 'itemId');
            if (!itemId)
                return failure('itemId is required', '缺少 itemId');
            return success(await this.service.deleteReviewItem(scope, itemId));
        }
        if (actionKey === 'refresh') {
            return { success: true, message: text('Refreshed', '已刷新'), refresh: true };
        }
        if (actionKey === 'save_controlled_goods') {
            const productName = readString(request.input, 'productName');
            if (!productName) {
                return failure('productName is required', '缺少商品名称');
            }
            return success(await this.service.saveControlledGoods(scope, {
                productName,
                hsCode: readString(request.input, 'hsCode'),
                keywords: readStringArray(request.input, 'keywords'),
                controlNote: readString(request.input, 'controlNote'),
                enabled: readBoolean(request.input, 'enabled') ?? true,
                sourceFileName: readString(request.input, 'sourceFileName'),
                sourceLocation: readString(request.input, 'sourceLocation')
            }));
        }
        if (actionKey === 'save_supplier_product') {
            const supplierName = readString(request.input, 'supplierName');
            const productName = readString(request.input, 'productName');
            if (!supplierName || !productName) {
                return failure('supplierName and productName are required', '缺少供应商或商品名称');
            }
            return success(await this.service.saveSupplierProduct(scope, {
                supplierName,
                supplierCreditCode: readString(request.input, 'supplierCreditCode'),
                supplierAddress: readString(request.input, 'supplierAddress'),
                productName,
                model: readString(request.input, 'model'),
                description: readString(request.input, 'description'),
                quantity: readNumber(request.input, 'quantity'),
                unit: readString(request.input, 'unit'),
                taxInclusiveUnitPrice: readNumber(request.input, 'taxInclusiveUnitPrice'),
                taxInclusiveTotalAmount: readNumber(request.input, 'taxInclusiveTotalAmount'),
                contractHsCode: readString(request.input, 'contractHsCode'),
                enrichedHsCode: readString(request.input, 'enrichedHsCode'),
                taxRefundRate: readString(request.input, 'taxRefundRate'),
                englishName: readString(request.input, 'englishName'),
                controlledStatus: readControlledGoodsStatus(request.input, 'controlledStatus'),
                controlNote: readString(request.input, 'controlNote')
            }));
        }
        if (actionKey === 'update_controlled_goods') {
            const id = readString(request.input, 'id');
            if (!id)
                return failure('id is required', '缺少 id');
            return success(await this.service.updateControlledGoods(scope, id, {
                productName: readString(request.input, 'productName'),
                hsCode: readString(request.input, 'hsCode'),
                keywords: readStringArray(request.input, 'keywords'),
                controlNote: readString(request.input, 'controlNote'),
                enabled: readBoolean(request.input, 'enabled'),
                sourceFileName: readString(request.input, 'sourceFileName'),
                sourceLocation: readString(request.input, 'sourceLocation')
            }));
        }
        if (actionKey === 'delete_controlled_goods') {
            const id = readString(request.input, 'id');
            if (!id)
                return failure('id is required', '缺少 id');
            return success(await this.service.deleteControlledGoods(scope, id));
        }
        if (actionKey === 'update_supplier_product') {
            const id = readString(request.input, 'id');
            if (!id)
                return failure('id is required', '缺少 id');
            return success(await this.service.updateSupplierProduct(scope, id, {
                supplierName: readString(request.input, 'supplierName'),
                productName: readString(request.input, 'productName'),
                model: readString(request.input, 'model'),
                description: readString(request.input, 'description'),
                quantity: readNumber(request.input, 'quantity'),
                unit: readString(request.input, 'unit'),
                contractHsCode: readString(request.input, 'contractHsCode'),
                enrichedHsCode: readString(request.input, 'enrichedHsCode'),
                taxRefundRate: readString(request.input, 'taxRefundRate'),
                englishName: readString(request.input, 'englishName'),
                controlledStatus: readControlledGoodsStatus(request.input, 'controlledStatus'),
                controlNote: readString(request.input, 'controlNote')
            }));
        }
        if (actionKey === 'delete_supplier_product') {
            const id = readString(request.input, 'id');
            if (!id)
                return failure('id is required', '缺少 id');
            return success(await this.service.deleteSupplierProduct(scope, id));
        }
        if (actionKey === 'delete_customs_workbook') {
            const id = readString(request.input, 'id');
            if (!id)
                return failure('id is required', '缺少 id');
            return success(await this.service.deleteWorkbookGeneration(scope, id));
        }
        if (actionKey === 'download_customs_workbook') {
            const id = readString(request.input, 'id');
            if (!id)
                return failure('id is required', '缺少 id');
            const item = await this.service.getWorkbookGeneration(scope, id);
            const template = await readFile(join(__dirname, '..', 'assets', 'customs-workbook-template.xls'));
            const source = normalizeWorkbookSource({
                ...(item.workbookData || {}),
                invoiceNo: item.invoiceNo,
                contractNo: item.contractNo,
                sourceFileName: item.sourceFileName
            });
            const workbook = await createCustomsWorkbookFromTemplateBuffer(buildCustomsWorkbookModel(source, {}), template);
            return success({
                fileName: workbook.fileName || item.fileName,
                mimeType: workbook.mimeType,
                bookType: workbook.bookType,
                base64: workbook.buffer.toString('base64')
            });
        }
        if (actionKey === 'generate_customs_workbook') {
            const now = new Date();
            const invoiceNo = readString(request.input, 'invoiceNo') ?? `INV-${now.toISOString().slice(0, 10).replace(/-/g, '')}`;
            const template = await readFile(join(__dirname, '..', 'assets', 'customs-workbook-template.xls'));
            const result = await this.service.recordWorkbookGeneration(scope, {
                sourceFileName: readString(request.input, 'sourceFileName') ?? readString(request.input, 'contractName'),
                invoiceNo,
                contractNo: readString(request.input, 'contractNo'),
                fileName: buildCustomsWorkbookTemplateFileName(invoiceNo),
                sheetNames: readCustomsWorkbookTemplateSheetNames(template),
                workbookData: readRecord(request.input, 'workbookData') ?? {
                    invoiceNo,
                    contractNo: readString(request.input, 'contractNo'),
                    generatedFrom: 'trade-compliance-workbench'
                }
            });
            return success(result);
        }
        return {
            success: true,
            message: text('Action accepted', '操作已接收'),
            refresh: true
        };
    }
    async executeViewFileAction(context, viewKey, actionKey, request, file) {
        if (viewKey !== TRADE_COMPLIANCE_VIEW_KEY) {
            return failure('Unsupported view', '不支持的视图');
        }
        const scope = scopeFromContext(context);
        const fileName = getFileDisplayName(file, request.input);
        const assistantFile = viewFileToAssistantFile(file, fileName, roleForUploadAction(actionKey) ?? 'source_file', request.input);
        if (!hasAssistantReadableFileHandle(assistantFile)) {
            return failure('Uploaded file was not registered as an assistant-readable workspace file.', '文件未写入智能体工作空间，请重新上传后再解析。');
        }
        if (actionKey === 'upload_controlled_goods_file') {
            const parsed = await parseControlledGoodsFile({
                buffer: getFileBuffer(file),
                fileName,
                mimeType: getFileMimeType(file)
            });
            const result = await this.service.createReviewBatch(scope, {
                type: 'controlled_goods_file',
                sourceFileName: fileName,
                metadata: {
                    fileName,
                    size: getFileSize(file),
                    mimeType: getFileMimeType(file),
                    candidateCount: parsed.candidates.length,
                    textLength: parsed.textLength
                },
                items: []
            });
            if (parsed.candidates.length > 0) {
                const chunks = chunkArray(parsed.candidates, CONTROLLED_GOODS_BATCH_SIZE);
                return parsingStarted({
                    messages: chunks.map((candidates, index) => buildAssistantCommand({
                        action: 'parse_controlled_goods_file',
                        file: assistantFile,
                        fileName,
                        role: 'controlled_goods_file',
                        batchId: result.batch.id,
                        messageId: `trade-compliance:parse_controlled_goods_file:${result.batch.id}:${index + 1}`,
                        text: buildControlledGoodsCandidateBatchPrompt(fileName, result.batch.id, candidates, index, chunks.length, parsed.candidates.length)
                    })),
                    batchId: result.batch.id,
                    role: 'controlled_goods_file',
                    expectedCount: parsed.candidates.length
                });
            }
            return parsingStarted({
                ...buildAssistantCommand({
                    action: 'parse_controlled_goods_file',
                    file: assistantFile,
                    fileName,
                    role: 'controlled_goods_file',
                    batchId: result.batch.id,
                    text: buildControlledGoodsParsePrompt(fileName, result.batch.id)
                }),
                expectedCount: 0
            });
        }
        if (actionKey === 'upload_supplier_contract') {
            const result = await this.service.createReviewBatch(scope, {
                type: 'supplier_contract',
                sourceFileName: fileName,
                metadata: { fileName, size: getFileSize(file), mimeType: getFileMimeType(file) },
                items: []
            });
            return parsingStarted(buildAssistantCommand({
                action: 'parse_supplier_contract',
                file: assistantFile,
                fileName,
                role: 'supplier_contract',
                batchId: result.batch.id,
                text: buildSupplierContractParsePrompt(fileName, result.batch.id)
            }));
        }
        if (actionKey === 'upload_sales_contract') {
            const result = await this.service.createReviewBatch(scope, {
                type: 'sales_contract',
                sourceFileName: fileName,
                metadata: { fileName, size: getFileSize(file), mimeType: getFileMimeType(file) },
                items: []
            });
            return parsingStarted(buildAssistantCommand({
                action: 'parse_sales_contract',
                file: assistantFile,
                fileName,
                role: 'sales_contract',
                batchId: result.batch.id,
                text: buildSalesContractParsePrompt(fileName, result.batch.id)
            }));
        }
        return failure('Unsupported file action', '不支持的文件操作');
    }
    async materializeConfirmedReviewItem(scope, item) {
        const data = mergeReviewData(item.defaultData, item.extractedData, item.confirmedData);
        if (item.type === 'controlled_goods') {
            const productName = readString(data, 'productName') ?? item.title;
            return {
                item,
                materialized: await this.service.saveControlledGoods(scope, {
                    productName,
                    hsCode: readString(data, 'hsCode'),
                    keywords: readStringArray(data, 'keywords'),
                    controlNote: readString(data, 'controlNote'),
                    enabled: readBoolean(data, 'enabled') ?? true,
                    sourceFileName: readString(data, 'sourceFileName'),
                    sourceLocation: item.sourceLocation ?? readString(data, 'sourceLocation')
                })
            };
        }
        if (item.type === 'supplier_product') {
            const supplierName = readString(data, 'supplierName') ?? '未识别供应商';
            const productName = readString(data, 'productName') ?? item.title;
            return {
                item,
                materialized: await this.service.saveSupplierProduct(scope, {
                    supplierName,
                    supplierCreditCode: readString(data, 'supplierCreditCode'),
                    supplierAddress: readString(data, 'supplierAddress'),
                    productName,
                    model: readString(data, 'model'),
                    description: readString(data, 'description'),
                    quantity: readNumber(data, 'quantity'),
                    unit: readString(data, 'unit'),
                    taxInclusiveUnitPrice: readNumber(data, 'taxInclusiveUnitPrice'),
                    taxInclusiveTotalAmount: readNumber(data, 'taxInclusiveTotalAmount'),
                    contractHsCode: readString(data, 'contractHsCode'),
                    enrichedHsCode: readString(data, 'enrichedHsCode'),
                    taxRefundRate: readString(data, 'taxRefundRate'),
                    englishName: readString(data, 'englishName'),
                    controlledStatus: readControlledGoodsStatus(data, 'controlledStatus'),
                    controlNote: readString(data, 'controlNote'),
                    matchedControlledGoods: readRecordArray(data, 'matchedControlledGoods')
                })
            };
        }
        return { item, materialized: null };
    }
};
TradeComplianceWorkbenchViewProvider = __decorate([
    Injectable(),
    ViewExtensionProvider(TRADE_COMPLIANCE_PROVIDER_KEY),
    __metadata("design:paramtypes", [TradeComplianceWorkbenchService])
], TradeComplianceWorkbenchViewProvider);
export { TradeComplianceWorkbenchViewProvider };
async function readPackageFile(packageName, filePath) {
    const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`));
    return readFile(join(packageRoot, filePath), 'utf8');
}
function scopeFromContext(context) {
    return {
        tenantId: context.tenantId,
        organizationId: context.organizationId,
        workspaceId: context.workspaceId ?? null,
        assistantId: context.hostType === 'agent' ? context.hostId : null,
        userId: context.userId
    };
}
function success(data) {
    return {
        success: true,
        message: text('Saved', '已保存'),
        data,
        refresh: true
    };
}
function parsingStarted(data) {
    return {
        success: true,
        message: text('Parsing request sent to assistant', '已发送给智能体解析'),
        data,
        refresh: false
    };
}
function failure(en_US, zh_Hans) {
    return {
        success: false,
        message: text(en_US, zh_Hans),
        refresh: false
    };
}
function readString(input, key) {
    return typeof input === 'object' && input != null && typeof Reflect.get(input, key) === 'string'
        ? String(Reflect.get(input, key))
        : undefined;
}
function readRecord(input, key) {
    const value = typeof input === 'object' && input != null ? Reflect.get(input, key) : undefined;
    return typeof value === 'object' && value != null && !Array.isArray(value) ? value : undefined;
}
function readStringArray(input, key) {
    const value = typeof input === 'object' && input != null ? Reflect.get(input, key) : undefined;
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}
function readBoolean(input, key) {
    const value = typeof input === 'object' && input != null ? Reflect.get(input, key) : undefined;
    return typeof value === 'boolean' ? value : undefined;
}
function readNumber(input, key) {
    const value = typeof input === 'object' && input != null ? Reflect.get(input, key) : undefined;
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value.replace(/,/g, ''));
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}
function readRecordArray(input, key) {
    const value = typeof input === 'object' && input != null ? Reflect.get(input, key) : undefined;
    return Array.isArray(value)
        ? value.filter((item) => typeof item === 'object' && item != null && !Array.isArray(item))
        : undefined;
}
function readControlledGoodsStatus(input, key) {
    const value = readString(input, key);
    return value === 'unchecked' || value === 'not_controlled' || value === 'suspected' || value === 'controlled'
        ? value
        : undefined;
}
function roleForUploadAction(actionKey) {
    if (actionKey === 'upload_controlled_goods_file')
        return 'controlled_goods_file';
    if (actionKey === 'upload_supplier_contract')
        return 'supplier_contract';
    if (actionKey === 'upload_sales_contract')
        return 'sales_contract';
    return null;
}
function normalizeWorkbookSource(input) {
    const itemsValue = Array.isArray(input.items) ? input.items : [];
    return {
        invoiceNo: stringValue(input.invoiceNo),
        contractNo: stringValue(input.contractNo),
        date: stringValue(input.date),
        buyerName: stringValue(input.buyerName),
        buyerAddress: stringValue(input.buyerAddress),
        sellerName: stringValue(input.sellerName),
        sellerEnglishName: stringValue(input.sellerEnglishName) ?? stringValue(input.sellerName),
        sellerEnglishAddress: stringValue(input.sellerEnglishAddress),
        paymentTerm: stringValue(input.paymentTerm),
        tradeTerm: stringValue(input.tradeTerm),
        origin: stringValue(input.origin),
        destination: stringValue(input.destination),
        currency: stringValue(input.currency) ?? '人民币',
        exchangeRate: numberValue(input.exchangeRate),
        packageType: stringValue(input.packageType),
        supervisionMode: stringValue(input.supervisionMode),
        taxExemptionNature: stringValue(input.taxExemptionNature ?? input.taxNature),
        domesticSourceLocation: stringValue(input.domesticSourceLocation),
        bankBeneficiary: stringValue(input.bankBeneficiary),
        bankName: stringValue(input.bankName),
        bankAddress: stringValue(input.bankAddress),
        bankAccountNo: stringValue(input.bankAccountNo),
        cnapsCode: stringValue(input.cnapsCode),
        swiftCode: stringValue(input.swiftCode),
        items: itemsValue
            .filter((item) => typeof item === 'object' && item != null && !Array.isArray(item))
            .map((item) => ({
            productName: stringValue(item.productName),
            englishName: stringValue(item.englishName),
            model: stringValue(item.model),
            description: stringValue(item.description),
            quantity: numberValue(item.quantity),
            unit: stringValue(item.unit),
            unitPrice: numberValue(item.unitPrice ?? item.taxInclusiveUnitPrice),
            amount: numberValue(item.amount ?? item.taxInclusiveTotalAmount),
            hsCode: stringValue(item.hsCode ?? item.contractHsCode ?? item.enrichedHsCode),
            cartonNo: stringValue(item.cartonNo),
            dimension: stringValue(item.dimension),
            netWeight: numberValue(item.netWeight),
            grossWeight: numberValue(item.grossWeight)
        }))
    };
}
function stringValue(value) {
    return value === undefined || value === null || value === '' ? undefined : String(value);
}
function numberValue(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value.replace(/,/g, ''));
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}
function mergeReviewData(...records) {
    return Object.assign({}, ...records.filter(Boolean));
}
function getFileDisplayName(file, input) {
    return readString(input, 'name') ?? readString(input, 'fileName') ?? getFileName(file) ?? 'uploaded-document';
}
function getFileName(file) {
    const record = file;
    return typeof record.name === 'string'
        ? record.name
        : typeof record.originalname === 'string'
            ? record.originalname
            : typeof record.originalName === 'string'
                ? record.originalName
                : undefined;
}
function getFileMimeType(file) {
    const record = file;
    return typeof record.mimetype === 'string'
        ? record.mimetype
        : typeof record.type === 'string'
            ? record.type
            : undefined;
}
function getFileSize(file) {
    const record = file;
    return typeof record.size === 'number' ? record.size : undefined;
}
function getFileBuffer(file) {
    const record = file;
    const buffer = record.buffer;
    if (Buffer.isBuffer(buffer))
        return buffer;
    if (buffer instanceof ArrayBuffer)
        return Buffer.from(buffer);
    if (ArrayBuffer.isView(buffer))
        return Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    return undefined;
}
function chunkArray(items, size) {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}
function buildAssistantCommand(input) {
    const files = [input.file];
    const workspacePath = input.file.workspacePath ?? input.file.filePath;
    const references = files
        .map((file) => toChatReference(file, input.fileName, input.role))
        .filter((item) => Boolean(item));
    return {
        commandKey: 'assistant.chat.send_message',
        payload: {
            text: input.text,
            clientMessageId: input.messageId ?? `trade-compliance:${input.action}:${input.batchId ?? Date.now()}`,
            files,
            attachments: files.map(toChatAttachment).filter((item) => Boolean(item)),
            references,
            followUpMode: 'queue',
            state: {
                tradeComplianceWorkbench: {
                    action: input.action,
                    batchId: input.batchId,
                    sourceFileName: input.fileName,
                    workspacePath
                }
            }
        },
        batchId: input.batchId,
        role: input.role
    };
}
function hasAssistantReadableFileHandle(file) {
    return Boolean(file.fileAssetId || file.fileId || file.workspacePath || file.filePath);
}
function viewFileToAssistantFile(file, fileName, role, input) {
    const record = file;
    const inputRecord = typeof input === 'object' && input != null ? input : {};
    const workspaceFile = readRecord(inputRecord, 'workspaceFile') ?? {};
    const workspacePath = readOptionalFileString(workspaceFile, 'workspacePath') ??
        readOptionalFileString(workspaceFile, 'filePath') ??
        readOptionalFileString(inputRecord, 'workspacePath') ??
        readOptionalFileString(inputRecord, 'filePath');
    const fileAssetId = readOptionalFileString(inputRecord, 'fileAssetId') ??
        readOptionalFileString(inputRecord, 'fileId') ??
        readOptionalFileString(record, 'fileAssetId') ??
        readOptionalFileString(record, 'fileId');
    const fileId = fileAssetId;
    const storageFileId = readOptionalFileString(inputRecord, 'storageFileId') ?? readOptionalFileString(record, 'storageFileId');
    return {
        id: fileAssetId ?? storageFileId,
        fileId,
        fileAssetId,
        storageFileId,
        workspacePath,
        filePath: workspacePath,
        fileUrl: readOptionalFileString(workspaceFile, 'fileUrl') ?? readOptionalFileString(workspaceFile, 'url'),
        url: readOptionalFileString(workspaceFile, 'fileUrl') ?? readOptionalFileString(workspaceFile, 'url'),
        name: readOptionalFileString(workspaceFile, 'name') ?? readOptionalFileString(inputRecord, 'name') ?? fileName,
        originalName: readOptionalFileString(workspaceFile, 'originalName') ?? readOptionalFileString(inputRecord, 'originalName') ?? fileName,
        mimeType: readOptionalFileString(workspaceFile, 'mimeType') ?? readOptionalFileString(inputRecord, 'mimeType') ?? getFileMimeType(file),
        mimetype: readOptionalFileString(workspaceFile, 'mimeType') ?? readOptionalFileString(inputRecord, 'mimeType') ?? getFileMimeType(file),
        size: readNumber(workspaceFile, 'size') ?? readNumber(inputRecord, 'size') ?? getFileSize(file),
        role
    };
}
function readOptionalFileString(record, key) {
    const value = record[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function toChatAttachment(file) {
    const id = file.fileAssetId ?? file.fileId ?? file.id ?? file.storageFileId ?? file.workspacePath;
    if (!id)
        return null;
    return {
        type: 'file',
        id,
        name: file.name,
        mime_type: file.mimeType ?? 'application/octet-stream',
        workspacePath: file.workspacePath,
        filePath: file.filePath
    };
}
function toChatReference(file, fileName, role) {
    const fileId = file.fileAssetId ?? file.fileId;
    const workspacePath = file.workspacePath ?? file.filePath;
    if (!fileId && !workspacePath)
        return null;
    return {
        type: 'quote',
        label: fileName,
        source: 'Trade Compliance Workbench uploaded document',
        text: [
            `role=${role}`,
            `name=${fileName}`,
            `fileId=${fileId}`,
            `workspacePath=${workspacePath ?? '-'}`,
            `mimeType=${file.mimeType ?? '-'}`,
            `size=${file.size ?? '-'}`
        ].join('\n')
    };
}
function buildControlledGoodsParsePrompt(fileName, batchId) {
    return [
        `请解析我刚上传的管控商品文件《${fileName}》。`,
        '文件已写入智能体工作空间，请优先根据 state.tradeComplianceWorkbench.workspacePath 使用 SandboxFile 等沙箱文件工具按路径读取；如果同时存在附件能力，也可以使用 file_preview、file_search、file_read 等文件理解工具读取。',
        '目标：识别文件中的管控商品、关键词、海关编码、管控说明、来源页码或条款。',
        `请调用工具 trade_compliance_save_controlled_goods_extraction 保存待审核结果，batchId 必须传 ${batchId ?? '-'}。如果内容很多需要分批调用工具，每次都必须使用同一个 batchId。`,
        '每个 items 条目的 type 必须是 controlled_goods；extractedData 中请包含 productName、hsCode、keywords、controlNote；sourceLocation 记录证据位置。',
        '不要只回复文字，必须调用工具把识别结果写入插件。回复中的识别数量必须等于工具实际保存的 items 总数。'
    ].join('\n');
}
function buildControlledGoodsCandidateBatchPrompt(fileName, batchId, candidates, batchIndex, batchTotal, totalCount) {
    const start = batchIndex * CONTROLLED_GOODS_BATCH_SIZE + 1;
    const lines = candidates.map((candidate, index) => {
        const number = start + index;
        const parts = [
            `候选行 ${number}/${totalCount}`,
            `序号：${candidate.sequence}`,
            candidate.category ? `分类：${candidate.category}` : undefined,
            candidate.sourceLocation ? `来源：${candidate.sourceLocation}` : undefined,
            candidate.hsCodes.length ? `HS Code：${candidate.hsCodes.join(', ')}` : undefined,
            `原文：${candidate.rawText}`
        ].filter(Boolean);
        return parts.join('\n');
    });
    return [
        `请处理管控商品文件《${fileName}》的候选行批次 ${batchIndex + 1}/${batchTotal}。`,
        '插件已经从原始文件中预提取出候选行；原始文件已写入智能体工作空间，请优先根据 state.tradeComplianceWorkbench.workspacePath 使用 SandboxFile 等沙箱文件工具按路径核对来源，不要重新从整份文件自由扩展识别范围。',
        `本批必须只处理下面 ${candidates.length} 条候选行，保存数量应等于候选行数量；除非某一行明确不是商品或管控条目，否则不要丢弃。`,
        `请调用 trade_compliance_save_controlled_goods_extraction 保存待审核结果，batchId 必须传 ${batchId}。`,
        '每个 items 条目的 type 必须是 controlled_goods；title 使用商品名称或 HS Code。',
        'extractedData 必须包含 productName、hsCode、keywords、controlNote、enabled；enabled 默认 true。',
        'sourceLocation 使用候选行的来源页码/工作表/行号；confidence 使用 0 到 1 的数字。',
        '所有外语都翻译成中文，除非 HS Code、CAS、型号、标准号等特定语义必须保留外语或代码。',
        '不要只回复文字，必须调用工具写入工作台；回复中的识别数量必须等于本批工具实际保存的 items 数量。',
        '',
        lines.join('\n\n')
    ].join('\n');
}
function buildSupplierContractParsePrompt(fileName, batchId) {
    return [
        `请解析我刚上传的供应商合同《${fileName}》。`,
        '文件已写入智能体工作空间，请优先根据 state.tradeComplianceWorkbench.workspacePath 使用 SandboxFile 等沙箱文件工具按路径读取；如果同时存在附件能力，也可以使用 file_preview、file_search、file_read 等文件理解工具读取。',
        '目标：识别供应商信息和商品信息，商品信息包括商品名称、型号、描述、数量、单位、含税单价、含税金额、合同里的海关编码。',
        '对每个商品必须调用 trade_compliance_enrich_product 获取海关编码、退税率、英文品名；该工具会请求 https://hsbianma.com/search?keywords=...&filterFailureCode=true&displayenname=true 并从返回 HTML 的结果表格读取数据。',
        '不要调用其他海关编码接口，也不要只根据模型知识生成编码；如果 trade_compliance_enrich_product 返回 error，请把 error 写入 controlNote 并继续保存待审核记录。',
        '再结合已有管控商品记录调用 trade_compliance_match_controlled_goods 判断是否为管控商品。',
        `最后必须调用 trade_compliance_save_supplier_contract_extraction 保存待审核结果，batchId 必须传 ${batchId ?? '-'}；只有调用该保存工具后，工作台左侧供应商商品列表才会出现记录。`,
        '每个 items 条目的 type 必须是 supplier_product；extractedData/defaultData 中请包含 supplierName、supplierCreditCode、supplierAddress、productName、model、description、quantity、unit、taxInclusiveUnitPrice、taxInclusiveTotalAmount、contractHsCode、enrichedHsCode、taxRefundRate、englishName、controlledStatus、controlNote。',
        '不要只回复文字，必须调用工具把识别结果写入插件；回复中的识别数量必须等于本次工具实际保存的 items 数量。'
    ].join('\n');
}
function buildSalesContractParsePrompt(fileName, batchId) {
    return [
        `请解析我刚上传的购销合同《${fileName}》。`,
        '文件已写入智能体工作空间，请优先根据 state.tradeComplianceWorkbench.workspacePath 使用 SandboxFile 等沙箱文件工具按路径读取；如果同时存在附件能力，也可以使用 file_preview、file_search、file_read 等文件理解工具读取。',
        '目标：识别销售发票和报关资料所需字段，包括发票号、合同号、买方、卖方、币种、贸易术语、付款方式、商品明细、数量、单价、金额、包装、毛重、净重等。',
        `请调用 trade_compliance_save_sales_contract_extraction 保存待审核结果，batchId 可记录为 ${batchId ?? '-'}。`,
        '每个 items 条目的 type 必须是 customs_workbook；extractedData 中请包含 invoiceNo、contractNo、buyerName、sellerName、currency、items 等字段。',
        '不要只回复文字，必须调用工具把识别结果写入插件。'
    ].join('\n');
}
