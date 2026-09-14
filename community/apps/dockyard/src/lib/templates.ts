import { readFileSync } from 'node:fs'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import { FEATURE, PLUGIN_NAME, PROVIDER_KEY } from './constants.js'

export const TEMPLATE_KEY = 'dockyard-layout-assistant'
export const templates: XpertTemplateContribution[] = [{
  key: TEMPLATE_KEY, name: 'Dockyard Content Assistant', title: 'Dockyard 内容助手',
  description: '右键选区或文件，引用到聊天中解释或讨论修改。',
  category: 'Workspace', type: XpertTypeEnum.Agent, targetApps: ['xpert'],
  targetAppMeta: { xpert: { types: ['business-assistant'], capabilities: [FEATURE], requiredPlugins: [PLUGIN_NAME],
    defaultConfig: { viewProvider: PROVIDER_KEY } } },
  dslContent: readFileSync(new URL('../dockyard-assistant.yaml', import.meta.url), 'utf8'),
  startPrompts: ['在 Dockyard 选中文字或右键文件，选择“帮我改”或“解释一下”，再到聊天框提问。'],
  releaseNotes: '0.3.0：仅保留选区和文件的两项右键引用操作，移除旧 AI 任务与布局功能。', providerKey: 'dockyard.templates', order: 30, default: false
}]
