import { readFileSync } from 'node:fs'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import { FEATURE, PLUGIN_NAME, PROVIDER_KEY } from './constants.js'

export const TEMPLATE_KEY = 'testcase-design-assistant'
export const templates: XpertTemplateContribution[] = [{
  key: TEMPLATE_KEY,
  name: 'Test Case Design Assistant',
  title: '测试用例设计助手',
  description: '读取工作台引用的需求，生成结构化测试用例草稿，人工确认后保存。',
  category: 'Quality',
  type: XpertTypeEnum.Agent,
  targetApps: ['xpert'],
  targetAppMeta: { xpert: {
    types: ['business-assistant'], capabilities: [FEATURE], requiredPlugins: [PLUGIN_NAME],
    defaultConfig: { viewProvider: PROVIDER_KEY }
  } },
  dslContent: readFileSync(new URL('../testcase-assistant.yaml', import.meta.url), 'utf8'),
  startPrompts: ['在工作台保存一条需求，点“AI 生成用例”把它引用到聊天，再让助手为每条用例写清步骤和预期。'],
  releaseNotes: '0.1.0：需求→AI 草稿→人工确认保存的最小闭环；重试按 requestId 幂等去重。',
  providerKey: 'testcase.templates', order: 30, default: false
}]
