import { readFileSync } from 'node:fs'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { FEATURE, PLUGIN_NAME, PROVIDER_KEY, TEMPLATE_KEY, TEMPLATE_PROVIDER } from './constants.js'

export const templates: XpertTemplateContribution[] = [{
  key: TEMPLATE_KEY,
  name: 'Image Evaluation Assistant',
  title: '图片分类验收助手',
  description: '运行固定样本的提示词 A/B 评测，由人查看差异并保存验收结论。',
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
  startPrompts: ['查看已有验收记录', '解释最近一次验收的实测结果'],
  releaseNotes: '0.3.0：固定样本、提示词 A/B 独立评测、逐项保存、人工评审与失败重试。',
  providerKey: TEMPLATE_PROVIDER,
  order: 30,
  default: false
}]
