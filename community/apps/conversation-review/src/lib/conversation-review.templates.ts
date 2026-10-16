import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  CONVERSATION_REVIEW_FEATURE,
  CONVERSATION_REVIEW_PLUGIN_NAME,
  CONVERSATION_REVIEW_PROVIDER_KEY,
  CONVERSATION_REVIEW_TEMPLATE_KEY,
  CONVERSATION_REVIEW_TEMPLATE_PROVIDER_KEY
} from './constants'

const CONVERSATION_REVIEW_TEMPLATE_FILE = 'xpert-conversation-review-assistant.yaml'

/**
 * The DSL ships as a YAML asset next to the compiled output. Resolve it from a few known
 * locations so the template loads both from `dist` and when running against sources.
 */
function getTemplateCandidates() {
  const runtimeDir = __dirname
  return [
    join(runtimeDir, '..', CONVERSATION_REVIEW_TEMPLATE_FILE),
    join(runtimeDir, CONVERSATION_REVIEW_TEMPLATE_FILE),
    join(process.cwd(), 'apps/conversation-review/src', CONVERSATION_REVIEW_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/conversation-review/src', CONVERSATION_REVIEW_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/conversation-review', CONVERSATION_REVIEW_TEMPLATE_FILE)
  ]
}

function readTemplateDsl() {
  const templatePath = getTemplateCandidates().find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(
      `Conversation review xpert DSL template file not found: ${getTemplateCandidates().join(', ')}`
    )
  }
  return readFileSync(templatePath, 'utf8')
}

export const conversationReviewTemplates: XpertTemplateContribution[] = [
  {
    key: CONVERSATION_REVIEW_TEMPLATE_KEY,
    name: 'Conversation Review Assistant',
    title: '客户沟通质检助手',
    description:
      '面向一线销售的客户沟通质检与跟进决策助手：读取归档的沟通记录，生成结构化质检与跟进建议，交由销售人工确认后保存。',
    category: 'Sales',
    type: XpertTypeEnum.Agent,
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['business-assistant'],
        capabilities: [CONVERSATION_REVIEW_FEATURE],
        requiredPlugins: [CONVERSATION_REVIEW_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'conversation-review',
          viewProvider: CONVERSATION_REVIEW_PROVIDER_KEY
        }
      }
    },
    dslContent: readTemplateDsl(),
    order: 50,
    default: false,
    startPrompts: [
      '我刚归档了一条客户沟通记录，请帮我做一次质检分析。',
      '这条沟通里客户的主要顾虑是什么？下一步该怎么跟进？',
      '帮我看看这次沟通有没有过度承诺或需要提醒的风险表达。',
      '这个客户之前几次沟通里答应过的事，这次还有哪些没落实？'
    ],
    releaseNotes: '首个版本：沟通质检、跟进建议与人工确认闭环；对照该客户历史已确认记录识别遗留事项。',
    xpertName: '客户沟通质检助手',
    providerKey: CONVERSATION_REVIEW_TEMPLATE_PROVIDER_KEY
  }
]
