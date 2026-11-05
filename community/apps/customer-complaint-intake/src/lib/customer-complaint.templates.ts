import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  COMPLAINT_FEATURE,
  COMPLAINT_PLUGIN_NAME,
  COMPLAINT_PROVIDER_KEY,
  COMPLAINT_TEMPLATE_FILE,
  COMPLAINT_TEMPLATE_KEY,
  COMPLAINT_TEMPLATE_PROVIDER_KEY
} from './constants'

function readDsl() {
  const candidates = [
    join(__dirname, '..', COMPLAINT_TEMPLATE_FILE),
    join(__dirname, COMPLAINT_TEMPLATE_FILE),
    join(process.cwd(), 'apps/customer-complaint-intake/src', COMPLAINT_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/customer-complaint-intake/src', COMPLAINT_TEMPLATE_FILE)
  ]
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) throw new Error(`Complaint assistant template not found: ${candidates.join(', ')}`)
  return readFileSync(templatePath, 'utf8')
}

export const customerComplaintTemplates: XpertTemplateContribution[] = [
  {
    key: COMPLAINT_TEMPLATE_KEY,
    name: 'Customer Complaint Assistant',
    title: '客服投诉受理助手',
    description: '把客户原话整理成可复核的受理草稿，确认和退回由客服在受理台完成。',
    category: 'Customer Service',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [COMPLAINT_FEATURE],
        requiredPlugins: [COMPLAINT_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'customer-complaint',
          managedBy: 'data-xpert',
          viewProvider: COMPLAINT_PROVIDER_KEY
        }
      }
    },
    dslContent: readDsl(),
    order: 40,
    default: false,
    startPrompts: [
      '请根据这段客户原话生成一条待确认的投诉受理草稿。',
      '请查看当前受理单还缺哪些信息，不要编造订单号。',
      '请在同一条受理单上重试刚才失败的草稿。'
    ],
    releaseNotes: '创建客服投诉受理助手。',
    xpertName: '客服投诉受理助手',
    providerKey: COMPLAINT_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
