import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { LiveDashboardPlugin } from './lib/plugin'
const packageJson: { name: string; version: string; xpert: { plugin: { level: XpertPlugin['meta']['level']; artifactNamespace: string } } } = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'))
const plugin: XpertPlugin = {
  meta: { name: packageJson.name, version: packageJson.version, category: 'middleware', displayName: 'Live dashboards', description: 'Live dashboards', author: 'XpertAI', level: packageJson.xpert.plugin.level, artifactNamespace: packageJson.xpert.plugin.artifactNamespace },
  register: () => ({ module: LiveDashboardPlugin })
}
export default plugin
