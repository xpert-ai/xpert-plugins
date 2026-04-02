import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { DanglingToolCallPluginModule } from './lib/dangling-tool-call.module.js'
import { DanglingToolCallIcon } from './lib/types.js'

const __filename = fileURLToPath(import.meta.url)
const moduleDir = dirname(__filename)

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'middleware',
    icon: {
      type: 'svg',
      value: DanglingToolCallIcon,
      color: '#0F766E',
    },
    displayName: 'Dangling Tool Call Middleware',
    description:
      'Repair dangling tool calls before model invocation by inserting explicit error ToolMessages for missing tool results.',
    keywords: ['agent', 'middleware', 'tool call', 'tool message', 'history repair'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register dangling tool call middleware plugin')
    return { module: DanglingToolCallPluginModule, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('dangling tool call middleware plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('dangling tool call middleware plugin stopped')
  },
}

export default plugin
