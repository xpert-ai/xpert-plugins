import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  SALES_ONTOLOGY_FEATURE,
  SALES_ONTOLOGY_PLUGIN_NAME,
  SALES_ONTOLOGY_PROVIDER_KEY,
  SALES_ONTOLOGY_TEMPLATE_PROVIDER_KEY,
  SALES_ONTOLOGY_VIEW_KEY
} from './constants.js'

const SALES_ONTOLOGY_TEMPLATE_KEY = 'sales-ontology-business-assistant'
const SALES_ONTOLOGY_TEMPLATE_FILE = 'xpert-sales-ontology-assistant.yaml'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function getSalesOntologyTemplateCandidates() {
  const runtimeDir = __dirname

  return [
    join(runtimeDir, '..', SALES_ONTOLOGY_TEMPLATE_FILE),
    join(runtimeDir, SALES_ONTOLOGY_TEMPLATE_FILE),
    join(process.cwd(), 'packages/plugins/sales-ontology/src', SALES_ONTOLOGY_TEMPLATE_FILE),
    join(process.cwd(), 'dist/packages/plugins/sales-ontology', SALES_ONTOLOGY_TEMPLATE_FILE)
  ]
}

function readSalesOntologyDsl() {
  const candidates = getSalesOntologyTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Sales Ontology xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const salesOntologyTemplates: XpertTemplateContribution[] = [
  {
    key: SALES_ONTOLOGY_TEMPLATE_KEY,
    name: 'Sales Ontology Business Assistant',
    title: 'Sales Ontology 业务决策助手',
    description: '面向销售业务对象感知、推理、建议生成和动作治理的 data-xpert 业务助手模板。',
    category: 'Sales Ontology',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [SALES_ONTOLOGY_FEATURE, SALES_ONTOLOGY_VIEW_KEY],
        requiredPlugins: [SALES_ONTOLOGY_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'sales-ontology',
          managedBy: 'data-xpert',
          viewProvider: SALES_ONTOLOGY_PROVIDER_KEY
        }
      }
    },
    dslContent: readSalesOntologyDsl(),
    order: 20,
    default: false,
    startPrompts: [
      '请读取 Sales Ontology 本体中的客户和销售目标，运行感知并生成风险摘要。',
      '请针对高影响力但低转化的医生生成下一步建议。',
      '请为这些建议创建需要人工审批的动作草案。'
    ],
    releaseNotes: '创建 Sales Ontology 业务决策助手。',
    xpertName: 'Sales Ontology 决策助手',
    providerKey: SALES_ONTOLOGY_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
