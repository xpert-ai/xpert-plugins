import { readFileSync } from 'node:fs'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { FEATURE, PLUGIN_NAME, PROVIDER_KEY, TEMPLATE_KEY, TEMPLATE_PROVIDER_KEY } from './constants.js'

export const templates: XpertTemplateContribution[] = [
  {
    key: TEMPLATE_KEY,
    name: 'Complaint Triage Assistant',
    title: '客诉分诊助手',
    description: '读取客诉工单，按公司分诊标准给出分类、定级、处理建议和回复草稿，并附原文证据；结果须经人工确认。',
    category: 'Customer Service',
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
    dslContent: readFileSync(new URL('../complaint-triage-assistant.yaml', import.meta.url), 'utf8'),
    startPrompts: ['打开客诉分诊台，新建一条工单后点击“AI 分析”；也可以直接告诉我工单号，例如“请分析客诉工单 TCK-20260917-AB12”。'],
    releaseNotes: '0.1.0：首个版本。',
    providerKey: TEMPLATE_PROVIDER_KEY,
    order: 40,
    default: false
  }
]
