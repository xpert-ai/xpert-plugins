import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { LiveDashboardPlugin } from './lib/plugin'
import { dashboardAssistantTemplate, DASHBOARD_TEMPLATE_KEY } from './lib/assistant-template'
import { dashboardIcon } from './lib/dashboard-icon'
const packageJson: { name: string; version: string; xpert: { plugin: { level: XpertPlugin['meta']['level']; artifactNamespace: string } } } = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'))
const plugin: XpertPlugin = {
  meta: {
    name: packageJson.name, version: packageJson.version, category: 'middleware', displayName: 'Live dashboards', description: 'Live dashboards',
    author: 'XpertAI', level: packageJson.xpert.plugin.level, artifactNamespace: packageJson.xpert.plugin.artifactNamespace, icon: dashboardIcon,
    targetApps: ['xpert'],
    targetAppMeta: { xpert: { types: ['assistant-template'], marketplace: { contents: [
      { type: 'assistant-template', name: DASHBOARD_TEMPLATE_KEY, displayName: dashboardAssistantTemplate.title, description: dashboardAssistantTemplate.description }
    ] } } }
  },
  templates: [dashboardAssistantTemplate],
  register: () => ({ module: LiveDashboardPlugin })
}
export default plugin
