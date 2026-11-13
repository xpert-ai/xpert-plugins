import { readFileSync } from 'node:fs'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { PluginTargetAppMeta } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { FEATURE, PLUGIN_NAME, PROVIDER_KEY, TEMPLATE_KEY } from './constants.js'

const targetAppMeta: PluginTargetAppMeta = {
  xpert: {
    types: ['business-assistant'],
    capabilities: [FEATURE],
    requiredPlugins: [PLUGIN_NAME],
    defaultConfig: { viewProvider: PROVIDER_KEY }
  }
}

export const templates: XpertTemplateContribution[] = [
  {
    key: TEMPLATE_KEY,
    name: TEMPLATE_KEY,
    title: { en_US: 'Support ticket triage', zh_Hans: '客服工单分诊' },
    description: {
      en_US: 'An assistant that triages the support backlog and leaves every decision to a human reviewer.',
      zh_Hans: '读取客服待办工单并给出分诊建议，最终决定权留给人工审核。'
    },
    category: 'support',
    type: XpertTypeEnum.Agent,
    targetApps: ['xpert'],
    targetAppMeta,
    dslContent: readFileSync(new URL('../ticket-triage-assistant.yaml', import.meta.url), 'utf8'),
    startPrompts: [
      '给最早的一张待处理工单做分诊。 / Triage the oldest pending ticket.',
      '还有哪些工单等待分诊？ / Which tickets are still waiting for triage?'
    ],
    releaseNotes: 'Initial version: board view, triage tools, human confirmation and retry.',
    order: 30,
    default: false
  }
]
