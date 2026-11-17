import { readFileSync } from 'node:fs'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { FEATURE, PLUGIN_NAME, PROVIDER_KEY, TEMPLATE_KEY, TEMPLATE_PROVIDER } from './constants.js'

export const templates: XpertTemplateContribution[] = [{
  key: TEMPLATE_KEY,
  name: 'Photo Intake Assistant',
  title: '拍照受理助手',
  description: '识别受理单照片并给出类别建议，由人确认；提示词改动先在已确认的受理单上验收。',
  category: 'Workspace',
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
  dslContent: readFileSync(new URL('../photo-intake-assistant.yaml', import.meta.url), 'utf8'),
  startPrompts: ['查看还没确认的受理单', '解释最近一次验收的实测结果'],
  releaseNotes: '0.4.0：照片受理、助手类别建议与人工确认；已确认的受理单用于提示词 A/B 验收，采用的版本用于之后的受理。',
  providerKey: TEMPLATE_PROVIDER,
  order: 30,
  default: false
}]
