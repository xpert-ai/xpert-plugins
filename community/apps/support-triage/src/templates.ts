import { readFileSync } from 'node:fs'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import { FEATURE, PLUGIN_NAME, PROVIDER_KEY, TEMPLATE_KEY, TEMPLATE_PROVIDER } from './constants.js'

export const templates: XpertTemplateContribution[] = [{
  key: TEMPLATE_KEY, name: 'Support Triage Assistant', title: '客服工单分流助手',
  description: '分析客户问题，保留原文证据并生成待人工审核的回复草稿。',
  category: 'Customer Support', type: XpertTypeEnum.Agent, targetApps: ['xpert'],
  targetAppMeta: { xpert: { types: ['business-assistant'], capabilities: [FEATURE], requiredPlugins: [PLUGIN_NAME],
    defaultConfig: { viewProvider: PROVIDER_KEY } } },
  dslContent: readFileSync(new URL('./support-triage-assistant.yaml', import.meta.url), 'utf8'),
  startPrompts: ['打开客服工单审核台，新建一张工单并点击“AI 分析”。', '说明工单从 AI 分析到人工确认的操作流程。'],
  releaseNotes: '0.1.0：原文证据、结构化分流、人工确认、失败重试、并发与数据隔离。',
  providerKey: TEMPLATE_PROVIDER, order: 30, default: false
}]
