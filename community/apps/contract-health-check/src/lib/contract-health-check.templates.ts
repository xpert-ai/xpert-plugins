import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  CONTRACT_HEALTH_CHECK_FEATURE,
  CONTRACT_HEALTH_CHECK_PLUGIN_NAME,
  CONTRACT_HEALTH_CHECK_PROVIDER_KEY,
  CONTRACT_HEALTH_CHECK_TEMPLATE_PROVIDER_KEY
} from './constants.js'

const CONTRACT_TEMPLATE_KEY = 'contract-health-check-assistant'
const CONTRACT_TEMPLATE_FILE = 'xpert-contract-health-check-assistant.yaml'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function getContractTemplateCandidates() {
  const runtimeDir = __dirname

  return [
    join(runtimeDir, '..', CONTRACT_TEMPLATE_FILE),
    join(runtimeDir, CONTRACT_TEMPLATE_FILE),
    join(process.cwd(), 'apps/contract-health-check/src', CONTRACT_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/contract-health-check/src', CONTRACT_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/contract-health-check', CONTRACT_TEMPLATE_FILE)
  ]
}

function readContractDsl() {
  const candidates = getContractTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Contract Health Check xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const contractHealthCheckTemplates: XpertTemplateContribution[] = [
  {
    key: CONTRACT_TEMPLATE_KEY,
    name: 'Contract Health Check Assistant',
    title: '合同智能体检助手',
    description: '面向合同要素抽取、风险审查、条款改写与体检报告摘要的 data-xpert 业务助手模板。',
    category: 'Legal',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [CONTRACT_HEALTH_CHECK_FEATURE, 'contract-health-check-workbench'],
        requiredPlugins: [CONTRACT_HEALTH_CHECK_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'contract-health-check',
          managedBy: 'data-xpert',
          viewProvider: CONTRACT_HEALTH_CHECK_PROVIDER_KEY
        }
      }
    },
    dslContent: readContractDsl(),
    order: 45,
    default: false,
    startPrompts: [
      '请在合同体检工作台新建一份合同体检，并粘贴合同正文。',
      '请对当前合同执行体检：抽取要素、识别风险、给出改写建议和总体评分。',
      '请说明这份合同的高危条款，以及我确认前需要补充的信息。'
    ],
    releaseNotes: '创建合同智能体检业务助手。',
    xpertName: '合同智能体检助手',
    providerKey: CONTRACT_HEALTH_CHECK_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
