import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  SMART_TICKET_FEATURE,
  SMART_TICKET_PLUGIN_NAME,
  SMART_TICKET_PROVIDER_KEY,
  SMART_TICKET_TEMPLATE_PROVIDER_KEY
} from './constants'

const SMART_TICKET_TEMPLATE_KEY = 'smart-ticket-dispatch-assistant'
const SMART_TICKET_TEMPLATE_FILE = 'xpert-smart-ticket-dispatch-assistant.yaml'

function getSmartTicketTemplateCandidates() {
  const runtimeDir = __dirname

  return [
    join(runtimeDir, '..', SMART_TICKET_TEMPLATE_FILE),
    join(runtimeDir, SMART_TICKET_TEMPLATE_FILE),
    join(process.cwd(), 'apps/smart-ticket-dispatch/src', SMART_TICKET_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/smart-ticket-dispatch/src', SMART_TICKET_TEMPLATE_FILE)
  ]
}

function readSmartTicketDsl() {
  const candidates = getSmartTicketTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Smart Ticket Dispatch DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const smartTicketDispatchTemplates: XpertTemplateContribution[] = [
  {
    key: SMART_TICKET_TEMPLATE_KEY,
    name: 'Smart Ticket Dispatch Assistant',
    title: '智能工单分派助手',
    description: '面向客服工单受理、AI 分诊分类、人工确认分派和处理跟踪的 data-xpert 业务助手模板。',
    category: 'Smart Ticket Dispatch',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [SMART_TICKET_FEATURE, 'ticket-review-desk'],
        requiredPlugins: [SMART_TICKET_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'smart-ticket-dispatch',
          managedBy: 'data-xpert',
          viewProvider: SMART_TICKET_PROVIDER_KEY
        }
      }
    },
    dslContent: readSmartTicketDsl(),
    order: 51,
    default: false,
    startPrompts: [
      '请根据这段客户问题生成一张待人工确认的智能工单。',
      '请查询当前待确认的工单，并说明 AI 分诊建议和需要人工确认的内容。',
      '请统计今天新增的工单数量和各状态的分布情况。'
    ],
    releaseNotes: '创建智能工单分派业务助手。',
    xpertName: '智能工单分派助手',
    providerKey: SMART_TICKET_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
