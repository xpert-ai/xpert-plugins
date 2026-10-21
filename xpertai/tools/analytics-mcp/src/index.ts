import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { AnalyticsMcpPlugin } from './lib/plugin'

const metadata: { name: string; version: string; xpert: { plugin: { level: XpertPlugin['meta']['level']; artifactNamespace: string } } } = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'))
const plugin: XpertPlugin = {
  meta: { name: metadata.name, version: metadata.version, category: 'database', displayName: 'MCP Analytics',
    description: 'Approved MCP tools on existing platform connections as Dataset/Binding sources', author: 'XpertAI',
    level: metadata.xpert.plugin.level, artifactNamespace: metadata.xpert.plugin.artifactNamespace },
  register: () => ({ module: AnalyticsMcpPlugin })
}
export default plugin
