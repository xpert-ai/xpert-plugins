import { readFileSync } from 'node:fs'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { FEATURE, PLUGIN_NAME, PROVIDER_KEY, TEMPLATE_KEY, TEMPLATE_PROVIDER } from './constants.js'

export const templates: XpertTemplateContribution[] = [{
  key: TEMPLATE_KEY,
  name: 'Photo Intake Assistant',
  title: '拍照受理助手',
  description: '看上报的照片，从固定类别表里给出建议，由人确认后保存。',
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
  startPrompts: ['有哪些可选的问题类别？', '识别最新的一条受理单'],
  releaseNotes: '0.2.0：上传照片，由助手查看照片并保存一到三个类别建议；识别失败可重试。',
  providerKey: TEMPLATE_PROVIDER,
  order: 30,
  default: false
}]
