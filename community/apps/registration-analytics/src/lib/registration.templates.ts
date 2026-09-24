import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { FEATURE, PLUGIN_NAME, PROVIDER_KEY, TEMPLATE_PROVIDER_KEY } from './constants'

const REGISTRATION_TEMPLATE_KEY = 'registration-analytics-assistant'
const REGISTRATION_TEMPLATE_FILE = 'registration-analytics-assistant.yaml'

function getTemplateCandidates() {
  const runtimeDir = __dirname
  return [
    join(runtimeDir, '..', REGISTRATION_TEMPLATE_FILE),
    join(runtimeDir, REGISTRATION_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/registration-analytics/src', REGISTRATION_TEMPLATE_FILE),
    join(process.cwd(), 'apps/registration-analytics/src', REGISTRATION_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/registration-analytics', REGISTRATION_TEMPLATE_FILE)
  ]
}

function readDsl() {
  const candidates = getTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Registration xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const registrationTemplates: XpertTemplateContribution[] = [
  {
    key: REGISTRATION_TEMPLATE_KEY,
    name: 'Registration Analytics Assistant',
    title: '报名问数助手',
    description: '面向活动报名运营人员的报名数据查询与统计分析助手，支持自然语言问数、常用查询保存。',
    category: 'Registration',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [FEATURE, 'registration-analytics-workbench', 'registration-analytics-agent-tools'],
        requiredPlugins: [PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'registration-analytics',
          managedBy: 'data-xpert',
          viewProvider: PROVIDER_KEY
        }
      }
    },
    dslContent: readDsl(),
    order: 70,
    default: false,
    startPrompts: [
      '本周有多少人报名？',
      '按城市统计报名人数',
      '各渠道的报名人数分布',
      '已确认报名的有多少人？',
      '哪个活动报名人数最多？'
    ],
    releaseNotes: '创建报名智能问数业务助手。',
    xpertName: '报名问数助手',
    providerKey: TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
