import { readFileSync } from 'node:fs'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { RFID_FEATURE, RFID_PLUGIN_NAME, RFID_TEMPLATE_FILE, RFID_TEMPLATE_KEY, RFID_TEMPLATE_PROVIDER_KEY, RFID_PROVIDER_KEY } from './rfid-constants.js'

export const rfidExperimentInsightTemplates: XpertTemplateContribution[] = [{
  key: RFID_TEMPLATE_KEY, name: 'RFID Experiment Insight Assistant', title: '无线感知实验智能分析助手',
  description: '解释确定性实验统计，通过工具保存结果，等待用户复核确认。',
  category: 'Research', type: XpertTypeEnum.Agent, targetApps: ['data-xpert'],
  targetAppMeta: { 'data-xpert': { types: ['business-assistant'], capabilities: [RFID_FEATURE], requiredPlugins: [RFID_PLUGIN_NAME],
    defaultConfig: { assistantKind: 'business-assistant', businessDomain: 'rfid-experiment-insight', managedBy: 'data-xpert', viewProvider: RFID_PROVIDER_KEY } } },
  dslContent: readFileSync(new URL(`../${RFID_TEMPLATE_FILE}`, import.meta.url), 'utf8'),
  order: 40, default: false,
  startPrompts: ['请解释工作台中选中的 RFID 实验统计，并保存分析供我确认。'],
  releaseNotes: 'RFID 实验统计解释与结果复核。', xpertName: '无线感知实验智能分析助手', providerKey: RFID_TEMPLATE_PROVIDER_KEY
}]
