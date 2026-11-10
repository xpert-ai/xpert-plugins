import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  ONTOAGENT_FEATURE,
  ONTOAGENT_PLUGIN_NAME,
  ONTOAGENT_PROVIDER_KEY,
  ONTOAGENT_TEMPLATE_FILE,
  ONTOAGENT_TEMPLATE_KEY,
  ONTOAGENT_TEMPLATE_PROVIDER_KEY,
  ONTOAGENT_VIEW_KEY
} from './constants.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function readOntoAgentDsl() {
  const candidates = [join(__dirname, '..', ONTOAGENT_TEMPLATE_FILE), join(__dirname, ONTOAGENT_TEMPLATE_FILE)]
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`OntoAgent xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const ontoagentTemplates: XpertTemplateContribution[] = [
  {
    key: ONTOAGENT_TEMPLATE_KEY,
    name: 'OntoAgent Governed Context Assistant',
    title: 'OntoAgent 受治理上下文助手',
    description: '基于 Auto-Ontology 认证资产的版本化上下文注入、只读检索与证据确认业务助手模板。',
    category: 'OntoAgent',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [ONTOAGENT_FEATURE, ONTOAGENT_VIEW_KEY],
        requiredPlugins: [ONTOAGENT_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'ontology-governance',
          managedBy: 'data-xpert',
          viewProvider: ONTOAGENT_PROVIDER_KEY
        }
      }
    },
    dslContent: readOntoAgentDsl(),
    order: 20,
    default: false,
    startPrompts: [
      'Revenue 这个指标在本体里的认证口径是什么？请给出定义、字段和 SQL。',
      '请比较"销售收入"和"开票金额"两个术语的口径差异，并标注使用的镜像版本。',
      '当前镜像是否 stale？哪些术语被排除在认证资产之外？'
    ],
    releaseNotes: '创建 OntoAgent 受治理上下文助手。',
    xpertName: 'OntoAgent 受治理上下文助手',
    providerKey: ONTOAGENT_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
