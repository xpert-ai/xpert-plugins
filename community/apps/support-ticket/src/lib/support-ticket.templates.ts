import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  SUPPORT_TICKET_FEATURE,
  SUPPORT_TICKET_PLUGIN_NAME,
  SUPPORT_TICKET_PROVIDER_KEY,
  SUPPORT_TICKET_TEMPLATE_PROVIDER_KEY
} from './constants'

export const SUPPORT_TICKET_TEMPLATE_KEY = 'support-ticket-assistant'
const SUPPORT_TICKET_TEMPLATE_FILE = 'xpert-support-ticket-assistant.yaml'

function getTemplateCandidates() {
  return [
    join(__dirname, '..', SUPPORT_TICKET_TEMPLATE_FILE),
    join(__dirname, SUPPORT_TICKET_TEMPLATE_FILE)
  ]
}

function readSupportTicketDsl() {
  const candidates = getTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Support Ticket xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const supportTicketTemplates: XpertTemplateContribution[] = [
  {
    key: SUPPORT_TICKET_TEMPLATE_KEY,
    name: 'Support Ticket Assistant',
    title: '客服工单助手',
    description: '面向客户消息分类定级、回复草稿生成与人工确认归档的 data-xpert 业务助手模板。',
    category: 'Support',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [SUPPORT_TICKET_FEATURE, 'support-ticket-review-desk'],
        requiredPlugins: [SUPPORT_TICKET_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'support-ticket',
          managedBy: 'data-xpert',
          viewProvider: SUPPORT_TICKET_PROVIDER_KEY
        }
      },
      xpert: {
        types: ['assistant-template'],
        capabilities: [SUPPORT_TICKET_FEATURE, 'support-ticket-review-desk'],
        requiredPlugins: [SUPPORT_TICKET_PLUGIN_NAME],
        defaultConfig: {
          viewProvider: SUPPORT_TICKET_PROVIDER_KEY
        }
      }
    },
    dslContent: readSupportTicketDsl(),
    order: 52,
    default: false,
    startPrompts: [
      '请帮我处理工单 ST-0001：客户反馈付款后订单状态一直没有更新。',
      '本周还有哪些工单没有人工确认？',
      '请查看当前工单的 AI 分类结果和回复草稿。'
    ],
    releaseNotes: '创建客服工单业务助手。',
    xpertName: '客服工单助手',
    providerKey: SUPPORT_TICKET_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
