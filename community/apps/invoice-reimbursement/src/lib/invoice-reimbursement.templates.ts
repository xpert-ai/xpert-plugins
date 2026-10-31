import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  INVOICE_REIMBURSEMENT_FEATURE,
  INVOICE_REIMBURSEMENT_PLUGIN_NAME,
  INVOICE_REIMBURSEMENT_PROVIDER_KEY,
  INVOICE_REIMBURSEMENT_TEMPLATE_PROVIDER_KEY
} from './constants.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const INVOICE_TEMPLATE_KEY = 'invoice-reimbursement-assistant'
const INVOICE_TEMPLATE_FILE = 'xpert-invoice-reimbursement-assistant.yaml'

function getTemplateCandidates() {
  const runtimeDir = __dirname
  return [
    join(runtimeDir, '..', INVOICE_TEMPLATE_FILE),
    join(runtimeDir, INVOICE_TEMPLATE_FILE),
    join(process.cwd(), 'apps/invoice-reimbursement/src', INVOICE_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/invoice-reimbursement/src', INVOICE_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/invoice-reimbursement', INVOICE_TEMPLATE_FILE)
  ]
}

function readInvoiceDsl(): string {
  const candidates = getTemplateCandidates()
  const templatePath = candidates.find((c) => existsSync(c))
  if (!templatePath) {
    return 'team:\n  name: invoice-reimbursement-assistant\n  type: agent\n  title: 发票报销预审助手\n'
  }
  return readFileSync(templatePath, 'utf8')
}

export const invoiceReimbursementTemplates: XpertTemplateContribution[] = [
  {
    key: INVOICE_TEMPLATE_KEY,
    name: 'Invoice Reimbursement Assistant',
    title: '发票报销预审助手',
    description: '面向发票要素结构化提取、抬头税号比对、品目合规自检与台账管理的企业报销业务助手。',
    category: 'Finance & Reimbursement',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [INVOICE_REIMBURSEMENT_FEATURE],
        requiredPlugins: [INVOICE_REIMBURSEMENT_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'invoice-reimbursement',
          managedBy: 'data-xpert',
          viewProvider: INVOICE_REIMBURSEMENT_PROVIDER_KEY
        }
      }
    },
    dslContent: readInvoiceDsl(),
    order: 30,
    default: false,
    startPrompts: [
      '请帮我解析这张增值税发票，并检查税号是否与公司匹配。',
      '我有一张餐饮发票需要报销，请检查合规性并提醒我需要补充什么材料。',
      '请查询我目前已提交的报销单台账及总报销金额。'
    ],
    agentTemplate: {
      provider: INVOICE_REIMBURSEMENT_TEMPLATE_PROVIDER_KEY,
      features: [INVOICE_REIMBURSEMENT_FEATURE]
    }
  }
]
