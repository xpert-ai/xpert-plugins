import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  PROCUREMENT_QUOTE_COMPARISON_FEATURE,
  PROCUREMENT_QUOTE_COMPARISON_PLUGIN_NAME,
  PROCUREMENT_QUOTE_COMPARISON_PROVIDER_KEY,
  PROCUREMENT_QUOTE_COMPARISON_TEMPLATE_PROVIDER_KEY
} from './constants.js'

const PROCUREMENT_TEMPLATE_KEY = 'procurement-quote-comparison-assistant'
const PROCUREMENT_TEMPLATE_FILE = 'xpert-procurement-quote-comparison-assistant.yaml'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function getProcurementTemplateCandidates() {
  const runtimeDir = __dirname

  return [
    join(runtimeDir, '..', PROCUREMENT_TEMPLATE_FILE),
    join(runtimeDir, PROCUREMENT_TEMPLATE_FILE),
    join(process.cwd(), 'apps/procurement-quote-comparison/src', PROCUREMENT_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/procurement-quote-comparison/src', PROCUREMENT_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/procurement-quote-comparison', PROCUREMENT_TEMPLATE_FILE)
  ]
}

function readProcurementDsl() {
  const candidates = getProcurementTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Procurement Quote Comparison xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const procurementQuoteComparisonTemplates: XpertTemplateContribution[] = [
  {
    key: PROCUREMENT_TEMPLATE_KEY,
    name: 'Procurement Quote Comparison Assistant',
    title: '采购比价助手',
    description: '面向采购需求解析、供应商报价解析、横向比价、风险识别和推荐报告的 data-xpert 业务助手模板。',
    category: 'Procurement',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [PROCUREMENT_QUOTE_COMPARISON_FEATURE, 'procurement-quote-comparison-workbench'],
        requiredPlugins: [PROCUREMENT_QUOTE_COMPARISON_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'procurement-quote-comparison',
          managedBy: 'data-xpert',
          viewProvider: PROCUREMENT_QUOTE_COMPARISON_PROVIDER_KEY
        }
      }
    },
    dslContent: readProcurementDsl(),
    order: 40,
    default: false,
    startPrompts: [
      '请根据采购需求单创建采购比价项目，并提示我上传至少两家供应商报价。',
      '请解析当前采购项目的需求单和供应商报价单，保存结构化结果。',
      '请为当前采购项目生成横向比价、风险项和推荐报告。'
    ],
    releaseNotes: '创建采购比价业务助手。',
    xpertName: '采购比价助手',
    providerKey: PROCUREMENT_QUOTE_COMPARISON_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
