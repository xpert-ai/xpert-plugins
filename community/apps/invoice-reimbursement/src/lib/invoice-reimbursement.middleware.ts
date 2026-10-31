import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import {
  INVOICE_ICON,
  INVOICE_REIMBURSEMENT_FEATURE,
  INVOICE_REIMBURSEMENT_MIDDLEWARE_NAME
} from './constants.js'
import { InvoiceReimbursementService } from './invoice-reimbursement.service.js'
import type { CreateInvoiceRecordDto, ParseInvoiceInput } from './types.js'

const parseInvoiceSchema = z.object({
  text: z.string().describe('发票票面全文、OCR识别文本或二维码解析报文'),
  companyName: z.string().optional().describe('购买方企业名称基准，默认为某某科技有限公司'),
  companyTaxNo: z.string().optional().describe('购买方统一社会信用代码基准')
})

const saveInvoiceSchema = z.object({
  invoiceNumber: z.string().describe('发票号码'),
  invoiceCode: z.string().optional().describe('发票代码'),
  issueDate: z.string().describe('开票日期 YYYY-MM-DD'),
  buyerName: z.string().describe('购买方名称'),
  buyerTaxNo: z.string().describe('购买方纳税人识别号/税号'),
  sellerName: z.string().describe('销售方名称'),
  pretaxAmount: z.number().describe('不含税金额'),
  taxRate: z.string().optional().describe('税率，如 6% 或 13%'),
  taxAmount: z.number().describe('税额'),
  totalAmount: z.number().describe('价税合计总金额'),
  category: z.string().optional().describe('费用品目分类：差旅交通/餐饮招待/办公耗材/云服务等'),
  department: z.string().optional().describe('报销归属部门'),
  remark: z.string().optional().describe('报销事由说明'),
  rawText: z.string().optional().describe('原始发票文本')
})

const queryLedgerSchema = z.object({})

@Injectable()
@AgentMiddlewareStrategy(INVOICE_REIMBURSEMENT_MIDDLEWARE_NAME)
export class InvoiceReimbursementMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  meta: TAgentMiddlewareMeta = {
    name: INVOICE_REIMBURSEMENT_MIDDLEWARE_NAME,
    label: {
      en_US: 'Invoice Reimbursement',
      zh_Hans: '发票报销预审'
    },
    description: {
      en_US: 'AI-assisted invoice parsing, tax compliance check, and reimbursement ledger tools.',
      zh_Hans: 'AI 辅助发票智能识别、税号合规校验及报销台账工具。'
    },
    icon: {
      type: 'svg',
      value: INVOICE_ICON,
      color: '#2563eb'
    },
    features: [INVOICE_REIMBURSEMENT_FEATURE],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  constructor(private readonly service: InvoiceReimbursementService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<any> {
    const tenantId = context.tenantId || 'default'
    const organizationId = context.organizationId || 'default'

    const parseInvoiceTool = tool(
      async (input: z.infer<typeof parseInvoiceSchema>) => {
        const result = this.service.parseInvoiceText(input as ParseInvoiceInput)
        return JSON.stringify(result)
      },
      {
        name: 'parse_and_audit_invoice',
        description: '从发票原始文本中抽取结构化字段（代码、号码、金额、税额、抬头），并比对公司税号执行合规初审。',
        schema: parseInvoiceSchema
      }
    )

    const saveInvoiceTool = tool(
      async (input: z.infer<typeof saveInvoiceSchema>) => {
        const record = await this.service.createInvoiceRecord(input as unknown as CreateInvoiceRecordDto, tenantId, organizationId)
        return JSON.stringify({
          success: true,
          message: `发票 [${record.invoiceNumber}] 已成功存入报销台账。`,
          data: record
        })
      },
      {
        name: 'save_invoice_reimbursement',
        description: '人工核对发票字段无误后，将发票单据与合规审查结果持久化保存到企业报销台账。',
        schema: saveInvoiceSchema
      }
    )

    const queryLedgerTool = tool(
      async () => {
        const records = await this.service.listInvoiceRecords(tenantId, organizationId)
        const totalAmount = records.reduce((sum, r) => sum + Number(r.totalAmount || 0), 0)
        return JSON.stringify({
          success: true,
          count: records.length,
          totalAmount: Math.round(totalAmount * 100) / 100,
          records
        })
      },
      {
        name: 'query_reimbursement_ledger',
        description: '查询当前租户/组织已提交的报销发票台账列表与累计报销金额统计。',
        schema: queryLedgerSchema
      }
    )

    return {
      name: INVOICE_REIMBURSEMENT_MIDDLEWARE_NAME,
      tools: [parseInvoiceTool, saveInvoiceTool, queryLedgerTool]
    }
  }
}
