import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { feature, icon, middlewareName, packageMeta, providerKey, viewKey } from './lib/constants'
import { IntakePlugin } from './lib/intake.plugin'
import { templates } from './lib/templates'

const plugin: XpertPlugin = {
  meta: {
    name: packageMeta.name, version: packageMeta.version, author: 'YumiCornzheng',
    level: packageMeta.xpert.plugin.level, artifactNamespace: packageMeta.xpert.plugin.artifactNamespace,
    displayName: '智能工单补全助手', description: 'AI 整理问题反馈，追问缺失信息，生成可核对的缺陷工单。', category: 'middleware',
    icon: { type: 'svg', value: icon }, targetApps: ['xpert'],
    targetAppMeta: { xpert: { types: ['business-app', 'workbench-view'], capabilities: [feature], runtime: { middlewareProviders: [middlewareName], viewProviders: [providerKey] }, marketplace: { contents: [{ type: 'view', name: viewKey, displayName: '智能工单补全助手', description: 'AI 整理问题反馈，追问缺失信息，生成可核对的缺陷工单。' }] } } }
  },
  templates,
  register() { return { module: IntakePlugin, global: true } }
}
export default plugin
