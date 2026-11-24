import { readFileSync } from 'node:fs'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import { FEATURE, PLUGIN_NAME, PROVIDER_KEY, TEMPLATE_KEY } from './constants.js'

export const templates: XpertTemplateContribution[] = [
  {
    key: TEMPLATE_KEY,
    name: 'Smart Ticket Operations Assistant',
    title: '智能客诉工单助手',
    description: 'AI 辅助客诉意图分析、情绪判定、拟定专业回复并同步工作台人工核对归档。',
    category: 'Operations',
    type: XpertTypeEnum.Agent,
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['business-assistant'],
        capabilities: [FEATURE],
        requiredPlugins: [PLUGIN_NAME],
        defaultConfig: { viewProvider: PROVIDER_KEY }
      }
    },
    dslContent: readFileSync(
      new URL('../smart-ticket-assistant.yaml', import.meta.url),
      'utf8'
    ),
    startPrompts: [
      '帮我分析这条客户投诉并生成回复草稿：刚充值了 199 元会员但是权益一直没到账，客服也没人理，赶紧给我退款！',
      '查看当前待处理的高优先级客诉工单。'
    ],
    releaseNotes: '0.1.0：智能客诉工作台初始版本，支持意图抽取、情绪分析、回复拟定与人工核验确认。',
    providerKey: 'smart-ticket.templates',
    order: 35,
    default: false
  }
]
