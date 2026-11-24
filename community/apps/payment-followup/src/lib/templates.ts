import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { FEATURE, PLUGIN_NAME, PROVIDER, TEMPLATE } from './constants'
export const templates: XpertTemplateContribution[] = [
  {
    key: TEMPLATE,
    name: 'Payment Follow-up',
    title: '回款承诺跟进助手',
    description: '从沟通原文提取付款承诺，人工核对后保存跟进安排。',
    category: 'Sales',
    type: XpertTypeEnum.Agent,
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['business-assistant'],
        capabilities: [FEATURE],
        requiredPlugins: [PLUGIN_NAME],
        defaultConfig: { viewProvider: PROVIDER }
      }
    },
    dslContent: readFileSync(join(__dirname, '../assistant.yaml'), 'utf8'),
    order: 50,
    default: false,
    startPrompts: ['请分析工作台中选中的客户付款承诺。'],
    releaseNotes: '付款承诺提取、原文核对、人工确认和失败重试。',
    xpertName: '回款承诺跟进助手',
    providerKey: 'payment_followup.templates'
  }
]
