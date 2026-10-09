import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  CONTRACT_REVIEW_FEATURE,
  CONTRACT_REVIEW_PLUGIN_NAME,
  CONTRACT_REVIEW_PROVIDER_KEY,
  CONTRACT_REVIEW_TEMPLATE_PROVIDER_KEY,
  CONTRACT_REVIEW_WORKBENCH_VIEW_KEY
} from './constants'

const CONTRACT_REVIEW_TEMPLATE_KEY = 'contract-review-assistant'
const CONTRACT_REVIEW_TEMPLATE_FILE = 'xpert-contract-review-assistant.yaml'

function getTemplateCandidates() {
  const runtimeDir = __dirname
  return [
    join(runtimeDir, '..', CONTRACT_REVIEW_TEMPLATE_FILE),
    join(runtimeDir, CONTRACT_REVIEW_TEMPLATE_FILE),
    join(process.cwd(), 'apps/contract-review/src', CONTRACT_REVIEW_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/contract-review/src', CONTRACT_REVIEW_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/contract-review', CONTRACT_REVIEW_TEMPLATE_FILE)
  ]
}

function readDsl() {
  const candidates = getTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Contract review xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const contractReviewTemplates: XpertTemplateContribution[] = [
  {
    key: CONTRACT_REVIEW_TEMPLATE_KEY,
    name: 'Contract Review Assistant',
    title: '合同条款审查助手',
    description: '抽取合同中的付款、交付、质保、违约四类关键条款，登记为待人工确认的 AI 建议。',
    category: 'Contract',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [CONTRACT_REVIEW_FEATURE, CONTRACT_REVIEW_WORKBENCH_VIEW_KEY, 'contract-review-agent-tools'],
        requiredPlugins: [CONTRACT_REVIEW_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'contract-review',
          managedBy: 'data-xpert',
          viewProvider: CONTRACT_REVIEW_PROVIDER_KEY
        }
      }
    },
    dslContent: readDsl(),
    order: 62,
    default: false,
    startPrompts: [
      '请审查《设备采购合同》，把付款、交付、质保、违约四类条款抽出来登记。',
      '看看我待审查的合同有哪些？',
      '这份合同里违约责任的赔偿上限是多少？依据是哪一段原文？',
      '我上次审查的那份合同，AI 登记了哪几条建议？'
    ],
    releaseNotes: '创建合同关键条款审查台的业务助手。',
    xpertName: '合同条款审查助手',
    providerKey: CONTRACT_REVIEW_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
