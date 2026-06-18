import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { CRM_FEATURE, CRM_PLUGIN_NAME, CRM_PROVIDER_KEY, CRM_TEMPLATE_PROVIDER_KEY } from './constants'

const CRM_TEMPLATE_KEY = 'crm-assistant'
const CRM_TEMPLATE_FILE = 'xpert-crm-assistant.yaml'

function getCrmTemplateCandidates() {
  const runtimeDir = __dirname
  return [
    join(runtimeDir, '..', CRM_TEMPLATE_FILE),
    join(runtimeDir, CRM_TEMPLATE_FILE),
    join(process.cwd(), 'apps/crm/src', CRM_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/crm/src', CRM_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/crm', CRM_TEMPLATE_FILE)
  ]
}

function readCrmDsl() {
  const candidates = getCrmTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`CRM xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const crmTemplates: XpertTemplateContribution[] = [
  {
    key: CRM_TEMPLATE_KEY,
    name: 'CRM Assistant',
    title: 'CRM 助手',
    description: '面向客户、联系人、商机录入、查询、更新和跟进总结的 Xpert 原生 CRM 助手模板。',
    category: 'CRM',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [CRM_FEATURE, 'crm-workbench', 'crm-agent-tools'],
        requiredPlugins: [CRM_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'crm',
          managedBy: 'data-xpert',
          viewProvider: CRM_PROVIDER_KEY
        }
      }
    },
    dslContent: readCrmDsl(),
    order: 60,
    default: false,
    startPrompts: [
      '请帮我录入一个新客户和联系人，并保存到 CRM。',
      '请查询最近的客户和商机，找出需要跟进的事项。',
      '请把这个商机阶段更新为 proposal，并记录更新结果。',
      '请总结 Acme Robotics 的联系人、商机和下一步跟进建议。'
    ],
    releaseNotes: '创建 Xpert 原生 CRM 业务助手。',
    xpertName: 'CRM 助手',
    providerKey: CRM_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
