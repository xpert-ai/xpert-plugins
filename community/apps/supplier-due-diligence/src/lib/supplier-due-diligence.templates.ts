import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  SUPPLIER_DUE_DILIGENCE_FEATURE,
  SUPPLIER_DUE_DILIGENCE_PLUGIN_NAME,
  SUPPLIER_DUE_DILIGENCE_PROVIDER_KEY,
  SUPPLIER_DUE_DILIGENCE_TEMPLATE_PROVIDER_KEY
} from './constants.js'

const PROCUREMENT_TEMPLATE_KEY = 'supplier-due-diligence-assistant'
const PROCUREMENT_TEMPLATE_FILE = 'xpert-supplier-due-diligence-assistant.yaml'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function getProcurementTemplateCandidates() {
  const runtimeDir = __dirname

  return [
    join(runtimeDir, '..', PROCUREMENT_TEMPLATE_FILE),
    join(runtimeDir, PROCUREMENT_TEMPLATE_FILE),
    join(process.cwd(), 'apps/supplier-due-diligence/src', PROCUREMENT_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/supplier-due-diligence/src', PROCUREMENT_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/supplier-due-diligence', PROCUREMENT_TEMPLATE_FILE)
  ]
}

function readProcurementDsl() {
  const candidates = getProcurementTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Supplier Due Diligence xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const procurementQuoteComparisonTemplates: XpertTemplateContribution[] = [
  {
    key: PROCUREMENT_TEMPLATE_KEY,
    name: 'Supplier Due Diligence Assistant',
    title: '供应商尽调助手',
    description: '面向采购需求解析、供应商报价解析、横向比价、风险识别和推荐报告的 data-xpert 业务助手模板。',
    category: 'Procurement',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [SUPPLIER_DUE_DILIGENCE_FEATURE, 'supplier-due-diligence-workbench'],
        requiredPlugins: [SUPPLIER_DUE_DILIGENCE_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'supplier-due-diligence',
          managedBy: 'data-xpert',
          viewProvider: SUPPLIER_DUE_DILIGENCE_PROVIDER_KEY
        }
      }
    },
    dslContent: readProcurementDsl(),
    order: 40,
    default: false,
    startPrompts: [
      '请根据采购需求单创建供应商尽调项目，并提示我上传至少两家供应商报价。',
      '请解析当前采购项目的需求单和供应商报价单，保存结构化结果。',
      '请为当前采购项目生成横向比价、风险项和推荐报告。'
    ],
    releaseNotes: '创建供应商尽调业务助手。',
    xpertName: '供应商尽调助手',
    providerKey: SUPPLIER_DUE_DILIGENCE_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
