import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { WeComPlugin } from './lib/wecom.plugin.js'
import { iconImage } from './lib/types.js'
import { WECOM_PLUGIN_CONTEXT } from './lib/tokens.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'integration',
    icon: {
      type: 'image',
      value: iconImage
    },
    displayName: 'WeCom Plugin',
    description: 'Enterprise WeCom integration for short callback and long websocket bot modes',
    keywords: ['wecom', 'wechat work', 'integration', 'webhook', 'callback', 'websocket', 'aibot'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  permissions: [
    { type: 'integration', service: 'wecom', operations: ['read'] },
    { type: 'integration', service: 'wecom_long', operations: ['read'] },
    { type: 'handoff', operations: ['enqueue'] }
  ],
  register(ctx) {
    return {
      module: WeComPlugin,
      global: true,
      providers: [{ provide: WECOM_PLUGIN_CONTEXT, useValue: ctx }],
      exports: []
    }
  }
}

export default plugin
