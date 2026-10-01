import { readFileSync } from 'node:fs'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import { FEATURE, PLUGIN_NAME, PROVIDER_KEY } from './constants.js'

export const TEMPLATE_KEY = 'dockyard-layout-assistant'
export const templates: XpertTemplateContribution[] = [{
  key: TEMPLATE_KEY, name: 'Dockyard Content Assistant', title: 'Dockyard 内容助手',
  description: '右键引用已保存的选区或文件，由助手解释或修改并保存。',
  category: 'Workspace', type: XpertTypeEnum.Agent, targetApps: ['xpert'],
  targetAppMeta: { xpert: { types: ['business-assistant'], capabilities: [FEATURE], requiredPlugins: [PLUGIN_NAME],
    defaultConfig: { viewProvider: PROVIDER_KEY } } },
  dslContent: readFileSync(new URL('../dockyard-assistant.yaml', import.meta.url), 'utf8'),
  startPrompts: ['在 Dockyard 选中文字或右键文件，选择“帮我改”或“解释一下”，再到聊天框提问。'],
  releaseNotes: '0.4.1：AI 保存后自动同步无本地修改的编辑器；有本地编辑时保留内容并提示冲突。', providerKey: 'dockyard.templates', order: 30, default: false
}]
