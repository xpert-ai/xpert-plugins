import { readFileSync } from 'node:fs'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { OpenDataLoaderPluginModule } from './lib/plugin.module.js'
import { ConfigSchema, Icon } from './lib/types.js'
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const plugin: XpertPlugin = {
  meta: {
    name: pkg.name,
    version: pkg.version,
    level: 'system',
    artifactNamespace: 'opendataloader',
    category: 'integration',
    displayName: 'OpenDataLoader PDF',
    description: 'Offline knowledge document parsing through platform-managed Sandbox Jobs.',
    icon: Icon,
    keywords: ['document', 'parser', 'pdf', 'opendataloader'],
    author: 'XpertAI Team'
  },
  config: { schema: ConfigSchema, formSchema: { type: 'object', properties: {} } },
  register() {
    return { module: OpenDataLoaderPluginModule, global: true }
  },
  onStart(ctx) {
    ctx.logger.log('OpenDataLoader PDF parser started')
  },
  onStop(ctx) {
    ctx.logger.log('OpenDataLoader PDF parser stopped')
  }
}
export default plugin
