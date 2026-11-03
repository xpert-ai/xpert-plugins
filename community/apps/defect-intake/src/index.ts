import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { feature, icon, middlewareName, packageMeta, providerKey, viewKey } from './lib/constants'
import { IntakePlugin } from './lib/intake.plugin'
import { templates } from './lib/templates'

const plugin: XpertPlugin = {
  meta: {
    name: packageMeta.name, version: packageMeta.version, author: 'YumiCornzheng',
    level: packageMeta.xpert.plugin.level, artifactNamespace: packageMeta.xpert.plugin.artifactNamespace,
    displayName: '缺陷受理与澄清', description: '保留原始反馈，人工编辑、保存并核对缺陷报告。', category: 'middleware',
    icon: { type: 'svg', value: icon }, targetApps: ['xpert'],
    targetAppMeta: { xpert: { types: ['business-app', 'workbench-view'], capabilities: [feature], runtime: { middlewareProviders: [middlewareName], viewProviders: [providerKey] }, marketplace: { contents: [{ type: 'view', name: viewKey, displayName: '缺陷受理与澄清', description: '缺陷报告录入、编辑和恢复工作台。' }] } } }
  },
  templates,
  register() { return { module: IntakePlugin, global: true } }
}
export default plugin
