import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { z } from 'zod/v3'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import type { PluginMarketplaceContribution } from '@xpert-ai/contracts'
import { DockyardPlugin } from './lib/dockyard.plugin.js'
import { FEATURE, MIDDLEWARE_NAME, PLUGIN_NAME, PLUGIN_NAMESPACE, PROVIDER_KEY, VIEW_KEY } from './lib/constants.js'
import { TEMPLATE_KEY, templates } from './lib/templates.js'

const version = z.object({ version: z.string() }).parse(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))).version
const app = {
  type: 'app', name: 'dockyard',
  displayName: { en_US: 'Dockyard AI', zh_Hans: 'Dockyard AI 工作台' },
  description: { en_US: 'A docking workbench with contextual chat references.', zh_Hans: '选中文字或右键文件，选择帮我改、解释一下，引用到聊天。' },
  icon: { type: 'font', value: 'ri-layout-4-line' },
  appConfig: {
    scope: 'organization', assistantTemplateKey: TEMPLATE_KEY,
    workspace: { mode: 'dedicated', name: { en_US: 'Dockyard', zh_Hans: 'Dockyard 工作空间' }, sharing: 'organization' },
    knowledgebases: [], modelRequirements: { primary: true },
    presentation: {
      tagline: { en_US: 'Select text or a file and ask in chat.', zh_Hans: '选中文字或文件，在聊天中解释或讨论修改。' },
      developer: 'yurongk',
      features: [
        { key: 'dockyard', title: { en_US: 'Dockyard workbench', zh_Hans: 'Dockyard 工作台' }, description: { en_US: 'Original panels, presets, themes and docking controls.', zh_Hans: '原面板、预设、主题与布局控件。' } },
        { key: 'content', title: { en_US: 'Chat references', zh_Hans: '聊天引用' }, description: { en_US: 'Explain or discuss changes using selected text or a whole file.', zh_Hans: '通过右键引用选区或文件，解释内容或讨论修改。' } }
      ],
      dataScope: { en_US: 'Layouts, files and notes are private to each user and Assistant in the current workspace.', zh_Hans: '布局、文件和便签按当前工作空间中的用户与 Assistant 隔离。' },
      initializationSummary: { en_US: 'Xpert prepares a dedicated workspace and the content Assistant.', zh_Hans: 'Xpert 创建专用工作空间并初始化内容助手。' }
    }, entry: { type: 'assistant-chat' }
  }
} satisfies PluginMarketplaceContribution
const configSchema = z.object({}).strict()
const plugin: XpertPlugin<z.infer<typeof configSchema>> = {
  meta: {
    name: PLUGIN_NAME, version, level: 'tenant', artifactNamespace: PLUGIN_NAMESPACE,
    displayName: 'Dockyard AI', description: 'Dockyard workbench with selected text and file references in ChatKit.',
    author: 'yurongk', category: 'middleware', targetApps: ['xpert'],
    targetAppMeta: { xpert: {
      types: ['business-app', 'assistant-template', 'workbench-view'], capabilities: [FEATURE],
      marketplace: { contents: [app,
        { type: 'assistant-template', name: TEMPLATE_KEY, displayName: { en_US: 'Dockyard Content Assistant', zh_Hans: 'Dockyard 内容助手' }, description: { en_US: 'Dockyard workbench with native chat references.', zh_Hans: 'Dockyard 工作台与聊天引用。' } },
        { type: 'view', name: VIEW_KEY, displayName: 'Dockyard' }] },
      runtime: { middlewareProviders: [MIDDLEWARE_NAME], viewProviders: [PROVIDER_KEY], templateProviders: ['dockyard.templates'] }
    } }
  },
  config: { schema: configSchema }, templates,
  register() { return { module: DockyardPlugin, global: true } }
}
export default plugin
export { plugin }
