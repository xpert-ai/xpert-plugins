import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { AnalyticsMysqlPlugin } from './lib/plugin'
const packageJson: { name: string; version: string; xpert: { plugin: { level: XpertPlugin['meta']['level']; artifactNamespace: string } } } = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'))
const plugin: XpertPlugin = {
  meta: { name: packageJson.name, version: packageJson.version, category: 'database', displayName: 'MySQL & Doris Analytics', description: 'Scoped MySQL and Apache Doris Dataset/Binding providers', author: 'XpertAI', level: packageJson.xpert.plugin.level, artifactNamespace: packageJson.xpert.plugin.artifactNamespace },
  register: () => ({ module: AnalyticsMysqlPlugin })
}
export default plugin
