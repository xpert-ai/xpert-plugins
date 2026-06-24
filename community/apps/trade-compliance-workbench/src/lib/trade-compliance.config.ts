// @ts-nocheck
import { z } from 'zod';
const text = (en_US, zh_Hans) => ({ en_US, zh_Hans });
export const TradeComplianceWorkbenchConfigSchema = z.object({
    enrichment: z
        .object({
        apiBaseUrl: z.string().optional(),
        timeoutMs: z.number().int().positive().optional()
    })
        .optional(),
    templateDefaults: z
        .object({
        sellerEnglishName: z.string().optional(),
        sellerEnglishAddress: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        bankBeneficiary: z.string().optional(),
        bankName: z.string().optional(),
        bankAddress: z.string().optional(),
        bankAccountNo: z.string().optional(),
        cnapsCode: z.string().optional(),
        swiftCode: z.string().optional(),
        paymentTerm: z.string().optional(),
        tradeTerm: z.string().optional(),
        origin: z.string().optional(),
        destination: z.string().optional(),
        packageType: z.string().optional(),
        supervisionMode: z.string().optional(),
        taxExemptionNature: z.string().optional(),
        domesticSourceLocation: z.string().optional(),
        exchangeRate: z.number().positive().optional()
    })
        .optional()
});
export function readTradeComplianceEnvDefaults() {
    return {
        enrichment: {
            apiBaseUrl: optionalString(process.env['TRADE_COMPLIANCE_ENRICHMENT_API_BASE_URL']),
            timeoutMs: optionalNumber(process.env['TRADE_COMPLIANCE_ENRICHMENT_TIMEOUT_MS'])
        },
        templateDefaults: {
            sellerEnglishName: optionalString(process.env['TRADE_COMPLIANCE_SELLER_ENGLISH_NAME']),
            sellerEnglishAddress: optionalString(process.env['TRADE_COMPLIANCE_SELLER_ENGLISH_ADDRESS']),
            phone: optionalString(process.env['TRADE_COMPLIANCE_PHONE']),
            email: optionalString(process.env['TRADE_COMPLIANCE_EMAIL']),
            bankBeneficiary: optionalString(process.env['TRADE_COMPLIANCE_BANK_BENEFICIARY']),
            bankName: optionalString(process.env['TRADE_COMPLIANCE_BANK_NAME']),
            bankAddress: optionalString(process.env['TRADE_COMPLIANCE_BANK_ADDRESS']),
            bankAccountNo: optionalString(process.env['TRADE_COMPLIANCE_BANK_ACCOUNT_NO']),
            cnapsCode: optionalString(process.env['TRADE_COMPLIANCE_CNAPS_CODE']),
            swiftCode: optionalString(process.env['TRADE_COMPLIANCE_SWIFT_CODE']),
            paymentTerm: optionalString(process.env['TRADE_COMPLIANCE_PAYMENT_TERM']),
            tradeTerm: optionalString(process.env['TRADE_COMPLIANCE_TRADE_TERM']),
            origin: optionalString(process.env['TRADE_COMPLIANCE_ORIGIN']),
            destination: optionalString(process.env['TRADE_COMPLIANCE_DESTINATION']),
            packageType: optionalString(process.env['TRADE_COMPLIANCE_PACKAGE_TYPE']),
            supervisionMode: optionalString(process.env['TRADE_COMPLIANCE_SUPERVISION_MODE']),
            taxExemptionNature: optionalString(process.env['TRADE_COMPLIANCE_TAX_EXEMPTION_NATURE']),
            domesticSourceLocation: optionalString(process.env['TRADE_COMPLIANCE_DOMESTIC_SOURCE_LOCATION']),
            exchangeRate: optionalNumber(process.env['TRADE_COMPLIANCE_EXCHANGE_RATE'])
        }
    };
}
export const TradeComplianceWorkbenchConfigFormSchema = {
    type: 'object',
    properties: {
        enrichment: {
            type: 'object',
            title: text('Product Enrichment', '商品补全'),
            properties: {
                apiBaseUrl: {
                    type: 'string',
                    title: text('HSBianma Base URL', 'HS编码网地址')
                },
                timeoutMs: {
                    type: 'number',
                    title: text('Timeout (ms)', '超时时间（毫秒）')
                }
            }
        },
        templateDefaults: {
            type: 'object',
            title: text('Customs Workbook Defaults', '报关资料默认值'),
            properties: {
                sellerEnglishName: { type: 'string', title: text('Seller English Name', '卖方英文名') },
                sellerEnglishAddress: { type: 'string', title: text('Seller English Address', '卖方英文地址') },
                paymentTerm: { type: 'string', title: text('Payment Term', '付款方式') },
                tradeTerm: { type: 'string', title: text('Trade Term', '成交方式') },
                origin: { type: 'string', title: text('Origin', '起运地') },
                destination: { type: 'string', title: text('Destination', '目的地') },
                exchangeRate: { type: 'number', title: text('Exchange Rate', '汇率') }
            }
        }
    }
};
function optionalString(value) {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
}
function optionalNumber(value) {
    if (!value?.trim()) {
        return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
