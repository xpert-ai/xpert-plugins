// @ts-nocheck
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TradeComplianceWorkbenchConfigFormSchema, TradeComplianceWorkbenchConfigSchema, readTradeComplianceEnvDefaults } from './lib/trade-compliance.config.js';
import { TRADE_COMPLIANCE_FEATURE, TRADE_COMPLIANCE_ICON, TRADE_COMPLIANCE_MIDDLEWARE_NAME, TRADE_COMPLIANCE_PROVIDER_KEY, TRADE_COMPLIANCE_TEMPLATE_PROVIDER_KEY, TRADE_COMPLIANCE_VIEW_KEY } from './lib/constants.js';
import { TradeComplianceWorkbenchPlugin } from './lib/trade-compliance-workbench.plugin.js';
import { tradeComplianceWorkbenchTemplates } from './lib/trade-compliance-workbench.templates.js';
const moduleDir = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8'));
const ConfigSchema = TradeComplianceWorkbenchConfigSchema;
const plugin = {
    meta: {
        name: packageJson.name,
        version: packageJson.version,
        level: 'system',
        targetApps: ['data-xpert'],
        targetAppMeta: {
            'data-xpert': {
                types: ['workbench-view', 'assistant-tool', 'business-app', 'customs-document'],
                capabilities: [
                    TRADE_COMPLIANCE_FEATURE,
                    'controlled-goods-management',
                    'supplier-product-management',
                    'customs-workbook-generation',
                    'trade-compliance-assistant-template'
                ],
                marketplace: {
                    contents: [
                        {
                            type: 'app',
                            name: 'trade-compliance-workbench',
                            displayName: 'Trade Compliance Workbench',
                            description: 'Manage controlled goods, supplier products, and generated customs declaration workbooks.',
                            icon: {
                                type: 'svg',
                                value: TRADE_COMPLIANCE_ICON,
                                color: '#0f766e'
                            },
                            operations: [
                                {
                                    name: 'manage-controlled-goods',
                                    displayName: 'Manage controlled goods',
                                    description: 'Upload, review, and manually maintain controlled goods records.',
                                    access: 'write'
                                },
                                {
                                    name: 'manage-supplier-products',
                                    displayName: 'Manage supplier products',
                                    description: 'Extract, enrich, review, and save supplier product records.',
                                    access: 'write'
                                },
                                {
                                    name: 'generate-customs-workbooks',
                                    displayName: 'Generate customs workbooks',
                                    description: 'Generate declaration, commercial invoice, sales contract, and packing list workbooks.',
                                    access: 'write'
                                }
                            ]
                        },
                        {
                            type: 'view',
                            name: TRADE_COMPLIANCE_VIEW_KEY,
                            displayName: 'Trade Compliance Workbench',
                            description: 'Workbench view for controlled goods, products, review batches, and customs workbooks.'
                        },
                        {
                            type: 'tool',
                            name: TRADE_COMPLIANCE_MIDDLEWARE_NAME,
                            displayName: 'Trade Compliance Tools',
                            description: 'Assistant tools for controlled goods extraction, supplier product extraction, product enrichment, matching, and customs workbook generation.'
                        },
                        {
                            type: 'assistant-template',
                            name: 'trade-compliance-workbench-assistant',
                            displayName: 'Trade Compliance Workbench Assistant Template',
                            description: 'Prebuilt assistant template for the Trade Compliance Workbench.'
                        }
                    ]
                },
                runtime: {
                    middlewareProviders: [TRADE_COMPLIANCE_MIDDLEWARE_NAME],
                    viewProviders: [TRADE_COMPLIANCE_PROVIDER_KEY],
                    templateProviders: [TRADE_COMPLIANCE_TEMPLATE_PROVIDER_KEY]
                }
            }
        },
        category: 'middleware',
        icon: {
            type: 'svg',
            value: TRADE_COMPLIANCE_ICON,
            color: '#0f766e'
        },
        displayName: 'Trade Compliance Workbench',
        description: 'Trade Compliance Workbench for controlled goods review, supplier product management, and customs workbook generation.',
        keywords: ['trade-compliance', 'controlled-goods', 'customs', 'workbook', 'assistant-template'],
        author: 'XpertAI Team'
    },
    config: {
        schema: ConfigSchema,
        formSchema: TradeComplianceWorkbenchConfigFormSchema,
        defaults: readTradeComplianceEnvDefaults()
    },
    templates: tradeComplianceWorkbenchTemplates,
    register(ctx) {
        ctx.logger.log('register trade compliance workbench plugin');
        return { module: TradeComplianceWorkbenchPlugin, global: true };
    },
    async onStart(ctx) {
        ctx.logger.log('trade compliance workbench plugin started');
    },
    async onStop(ctx) {
        ctx.logger.log('trade compliance workbench plugin stopped');
    }
};
export default plugin;
export * from './lib/constants.js';
export * from './lib/types.js';
export * from './lib/entities/index.js';
export * from './lib/trade-compliance-workbench.plugin.js';
export * from './lib/trade-compliance-workbench.service.js';
export * from './lib/trade-compliance-workbench.middleware.js';
export * from './lib/trade-compliance-workbench-view.provider.js';
export * from './lib/trade-compliance-workbench.templates.js';
export * from './lib/trade-compliance.matching.js';
export * from './lib/trade-compliance.enrichment.js';
export * from './lib/trade-compliance-workbook.js';
