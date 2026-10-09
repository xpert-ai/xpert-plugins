import { readFileSync } from 'node:fs'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  COMPLAINT_TRIAGE_FEATURE,
  COMPLAINT_TRIAGE_PLUGIN_NAME,
  COMPLAINT_TRIAGE_PRIMARY_AGENT_KEY,
  COMPLAINT_TRIAGE_TEMPLATE_KEY,
  COMPLAINT_TRIAGE_TEMPLATE_PROVIDER_KEY
} from './constants.js'

export const complaintTriageTemplates: XpertTemplateContribution[] = [
  {
    key: COMPLAINT_TRIAGE_TEMPLATE_KEY,
    name: COMPLAINT_TRIAGE_TEMPLATE_KEY,
    title: '客诉分诊工作台助手',
    description: '调用结构化客诉分诊工具生成建议，并由客服人员完成最终审核确认。',
    category: 'Customer Service',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [COMPLAINT_TRIAGE_FEATURE],
        requiredPlugins: [COMPLAINT_TRIAGE_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'complaint-triage',
          managedBy: 'data-xpert'
        }
      },
      xpert: {
        types: ['assistant-template'],
        capabilities: [COMPLAINT_TRIAGE_FEATURE],
        requiredPlugins: [COMPLAINT_TRIAGE_PLUGIN_NAME]
      }
    },
    dslContent: readFileSync(new URL('../complaint-triage-assistant.yaml', import.meta.url), 'utf8'),
    order: 30,
    default: false,
    startPrompts: [
      '打开客诉分诊工作台并处理待审核投诉。',
      '查看当前投诉工单的处理状态。'
    ],
    releaseNotes: 'Provides one persisted ComplaintCase workflow with AI triage and human confirmation.',
    xpertName: '客诉分诊工作台助手',
    providerKey: COMPLAINT_TRIAGE_TEMPLATE_PROVIDER_KEY,
    primaryAgentKey: COMPLAINT_TRIAGE_PRIMARY_AGENT_KEY
  }
]
