import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  SMART_MAINTENANCE_FEATURE,
  SMART_MAINTENANCE_PLUGIN_NAME,
  SMART_MAINTENANCE_PROVIDER_KEY,
  SMART_MAINTENANCE_TEMPLATE_PROVIDER_KEY
} from './constants'

const SMART_MAINTENANCE_TEMPLATE_KEY = 'smart-maintenance-assistant'
const SMART_MAINTENANCE_TEMPLATE_FILE = 'xpert-smart-maintenance-assistant.yaml'

function getSmartMaintenanceTemplateCandidates() {
  const runtimeDir = __dirname

  return [
    join(runtimeDir, '..', SMART_MAINTENANCE_TEMPLATE_FILE),
    join(runtimeDir, SMART_MAINTENANCE_TEMPLATE_FILE),
    join(process.cwd(), 'apps/smart-maintenance/src', SMART_MAINTENANCE_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/smart-maintenance/src', SMART_MAINTENANCE_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/smart-maintenance', SMART_MAINTENANCE_TEMPLATE_FILE)
  ]
}

function readSmartMaintenanceDsl() {
  const candidates = getSmartMaintenanceTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Smart Maintenance xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const smartMaintenanceTemplates: XpertTemplateContribution[] = [
  {
    key: SMART_MAINTENANCE_TEMPLATE_KEY,
    name: 'Smart Maintenance Assistant',
    title: '智能维保助手',
    description: '面向自然语言报修受理、维保工单生成、候选主数据导入、审核补充和处理闭环的 data-xpert 业务助手模板。',
    category: 'Smart Maintenance',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [SMART_MAINTENANCE_FEATURE, 'maintenance-review-desk'],
        requiredPlugins: [SMART_MAINTENANCE_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'smart-maintenance',
          managedBy: 'data-xpert',
          viewProvider: SMART_MAINTENANCE_PROVIDER_KEY
        }
      }
    },
    dslContent: readSmartMaintenanceDsl(),
    order: 50,
    default: false,
    startPrompts: [
      '请根据这段报修描述生成一张待人工确认的智能维保工单。',
      '请读取当前候选主数据，帮我规范设备类型、故障类别、部门和岗位。',
      '请查询需要补充的维保工单，并根据用户补充内容生成补充草稿。'
    ],
    releaseNotes: '创建智能维保业务助手。',
    xpertName: '智能维保助手',
    providerKey: SMART_MAINTENANCE_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
