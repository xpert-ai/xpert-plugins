import { readFileSync } from 'node:fs'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { AnyDocPluginModule } from './lib/plugin.module.js'
import { ConfigSchema, Icon } from './lib/types.js'
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const plugin: XpertPlugin = {
  meta: {
    name: pkg.name,
    version: pkg.version,
    level: 'system',
    artifactNamespace: 'anydoc',
    category: 'integration',
    displayName: 'AnyDoc',
    description: 'Offline knowledge document parsing through platform-managed Sandbox Jobs.',
    icon: Icon,
    keywords: ['document', 'parser', 'pdf', 'anydoc'],
    author: 'XpertAI Team'
  },
  config: { schema: ConfigSchema, formSchema: { type: 'object', properties: {} } },
  register() {
    return { module: AnyDocPluginModule, global: true }
  },
  onStart(ctx) {
    ctx.logger.log('AnyDoc parser started')
  },
  onStop(ctx) {
    ctx.logger.log('AnyDoc parser stopped')
  }
}
export default plugin
