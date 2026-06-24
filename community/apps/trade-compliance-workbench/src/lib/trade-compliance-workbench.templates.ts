// @ts-nocheck
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { XpertTypeEnum } from '@xpert-ai/contracts';
import { TRADE_COMPLIANCE_FEATURE, TRADE_COMPLIANCE_PLUGIN_NAME, TRADE_COMPLIANCE_PROVIDER_KEY, TRADE_COMPLIANCE_TEMPLATE_PROVIDER_KEY } from './constants.js';
const TEMPLATE_KEY = 'trade-compliance-workbench-assistant';
const TEMPLATE_FILE = 'xpert-trade-compliance-workbench-assistant.yaml';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
function readDsl() {
    const candidates = [
        join(__dirname, '..', TEMPLATE_FILE),
        join(__dirname, TEMPLATE_FILE),
        join(process.cwd(), 'community/apps/trade-compliance-workbench/src', TEMPLATE_FILE),
        join(process.cwd(), 'apps/trade-compliance-workbench/src', TEMPLATE_FILE),
        join(process.cwd(), 'dist/apps/trade-compliance-workbench', TEMPLATE_FILE)
    ];
    const templatePath = candidates.find((candidate) => existsSync(candidate));
    if (!templatePath) {
        throw new Error(`Trade Compliance Workbench assistant template not found: ${candidates.join(', ')}`);
    }
    return readFileSync(templatePath, 'utf8');
}
export const tradeComplianceWorkbenchTemplates = [
    {
        key: TEMPLATE_KEY,
        name: 'Trade Compliance Workbench Assistant',
        title: '外贸合规工作台助手',
        description: '面向管控商品识别、供应商商品管理和报关资料生成的 data-xpert 业务助手模板。',
        category: 'Trade Compliance',
        type: XpertTypeEnum.Agent,
        targetApps: ['data-xpert'],
        targetAppMeta: {
            'data-xpert': {
                types: ['business-assistant'],
                capabilities: [TRADE_COMPLIANCE_FEATURE],
                requiredPlugins: [TRADE_COMPLIANCE_PLUGIN_NAME],
                defaultConfig: {
                    assistantKind: 'business-assistant',
                    businessDomain: 'trade-compliance-workbench',
                    managedBy: 'data-xpert',
                    viewProvider: TRADE_COMPLIANCE_PROVIDER_KEY
                }
            }
        },
        dslContent: readDsl(),
        order: 60,
        default: false,
        startPrompts: [
            '请解析这份管控商品目录，保存待审核的管控商品条目。',
            '请解析这份供应商合同，识别供应商和商品，并补全海关编码、退税率和英文品名。',
            '请解析这份购销合同，准备生成报关单、Commercial Invoice、Sales Contract 和 Packing List。'
        ],
        releaseNotes: '创建外贸合规工作台业务助手。',
        xpertName: '外贸合规工作台助手',
        providerKey: TRADE_COMPLIANCE_TEMPLATE_PROVIDER_KEY
    }
];
