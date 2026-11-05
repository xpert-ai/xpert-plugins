import { DASHBOARD_CONFIG, dashboardConfigSchema } from './lib/capacity'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { LiveDashboardPlugin } from './lib/plugin'
import { dashboardApp } from './lib/project'
import { dashboardTemplates } from './lib/templates'
import { dashboardAssistantTemplate, DASHBOARD_TEMPLATE_KEY } from './lib/assistant-template'
import { dashboardIcon } from './lib/dashboard-icon'
const packageJson: { name: string; version: string; xpert: { plugin: { level: XpertPlugin['meta']['level']; artifactNamespace: string } } } = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'))
const plugin: XpertPlugin = {
  meta: {
    name: packageJson.name, version: packageJson.version, category: 'middleware', displayName: 'Live dashboards', description: 'Live dashboards',
    author: 'XpertAI', level: packageJson.xpert.plugin.level, artifactNamespace: packageJson.xpert.plugin.artifactNamespace, icon: dashboardIcon,
    targetApps: ['xpert', 'data-xpert'],
    targetAppMeta: { xpert: { types: ['business-app', 'workbench-view', 'assistant-template'], capabilities: ['live_dashboard'], marketplace: { contents: [
      dashboardApp,
      { type: 'assistant-template', name: DASHBOARD_TEMPLATE_KEY, displayName: dashboardAssistantTemplate.title, description: dashboardAssistantTemplate.description }
    ] } } }
  },
  config: { schema: dashboardConfigSchema },
  templates: dashboardTemplates,
  register: context => ({ module: LiveDashboardPlugin, providers: [{ provide: DASHBOARD_CONFIG, useValue: dashboardConfigSchema.parse(context.config ?? {}) }] })
}
export default plugin
