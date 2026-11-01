import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { LiveDashboardPlugin } from './lib/plugin'
import { dashboardApp } from './lib/project'
import { dashboardTemplates } from './lib/templates'
const packageJson: { name: string; version: string; xpert: { plugin: { level: XpertPlugin['meta']['level']; artifactNamespace: string } } } = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'))
const plugin: XpertPlugin = {
  meta: { name: packageJson.name, version: packageJson.version, category: 'middleware', displayName: 'Live dashboards', description: 'Live dashboards', author: 'XpertAI', level: packageJson.xpert.plugin.level, artifactNamespace: packageJson.xpert.plugin.artifactNamespace },
  templates: dashboardTemplates,
  register: () => ({ module: LiveDashboardPlugin })
}
plugin.meta.targetApps = ['xpert', 'data-xpert']
plugin.meta.targetAppMeta = { xpert: { types: ['business-app', 'workbench-view'], capabilities: ['live_dashboard'],
  marketplace: { contents: [dashboardApp] } } }
export default plugin
