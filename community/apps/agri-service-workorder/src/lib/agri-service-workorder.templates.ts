import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  AGRI_SERVICE_FEATURE,
  AGRI_SERVICE_PLUGIN_NAME,
  AGRI_SERVICE_PROVIDER_KEY,
  AGRI_SERVICE_TEMPLATE_PROVIDER_KEY
} from './constants'

const agri_service_TEMPLATE_KEY = 'agri-service-workorder-assistant'
const agri_service_TEMPLATE_FILE = 'xpert-agri-service-workorder-assistant.yaml'

function getAgriServiceTemplateCandidates() {
  const runtimeDir = __dirname

  return [
    join(runtimeDir, '..', agri_service_TEMPLATE_FILE),
    join(runtimeDir, agri_service_TEMPLATE_FILE),
    join(process.cwd(), 'apps/agri-service-workorder/src', agri_service_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/agri-service-workorder/src', agri_service_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/agri-service-workorder', agri_service_TEMPLATE_FILE)
  ]
}

function readAgriServiceDsl() {
  const candidates = getAgriServiceTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Agri Service Workorder xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const AgriServiceTemplates: XpertTemplateContribution[] = [
  {
    key: agri_service_TEMPLATE_KEY,
    name: 'Agri Service Workorder Assistant',
    title: '农服工单助手',
    description: '面向自然语言农服需求受理、结构化工单填报、候选主数据导入、审核补充和处理闭环的业务助手模板。',
    category: 'Agri Service Workorder',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [AGRI_SERVICE_FEATURE, 'agri-service-review-desk'],
        requiredPlugins: [AGRI_SERVICE_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'agri-service-workorder',
          managedBy: 'data-xpert',
          viewProvider: AGRI_SERVICE_PROVIDER_KEY
        }
      }
    },
    dslContent: readAgriServiceDsl(),
    order: 50,
    default: false,
    startPrompts: [
      '请根据这段农服需求生成一张待人工确认的农服工单。',
      '请读取当前候选主数据，帮我规范作物、病虫害、服务类型和岗位。',
      '请查询需要补充的农服工单，并根据用户补充内容生成补充草稿。'
    ],
    releaseNotes: '创建农服工单智能填报业务助手。',
    xpertName: '农服工单助手',
    providerKey: AGRI_SERVICE_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
