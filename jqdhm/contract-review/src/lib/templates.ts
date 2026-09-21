import { readFileSync } from 'node:fs'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { FEATURE, PLUGIN_NAME, PROVIDER_KEY, TEMPLATE_KEY } from './constants.js'

export const templates: XpertTemplateContribution[] = [{
  key: TEMPLATE_KEY, name: 'Contract information assistant', title: '合同资料整理助手',
  description: '根据合同纯文本提取有原文依据的候选字段，并引导用户在工作台人工核对。',
  category: 'Productivity', type: XpertTypeEnum.Agent, targetApps: ['xpert'],
  targetAppMeta: { xpert: { types: ['business-assistant'], capabilities: [FEATURE], requiredPlugins: [PLUGIN_NAME], defaultConfig: { viewProvider: PROVIDER_KEY } } },
  dslContent: readFileSync(new URL('../assistant.yaml', import.meta.url), 'utf8'),
  source: 'contract-review.templates', order: 30
}]
