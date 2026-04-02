import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { ClarificationPluginModule } from './lib/clarification.module.js'
import {
  ClarificationPluginConfigFormSchema,
  ClarificationPluginConfigSchema,
  ClarificationPluginIcon
} from './lib/clarification.types.js'

const __filename = fileURLToPath(import.meta.url)
const moduleDir = dirname(__filename)

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: XpertPlugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'middleware',
    icon: {
      type: 'svg',
      value: ClarificationPluginIcon,
      color: '#1D4ED8'
    },
    displayName: 'Clarification Middleware',
    description:
      'Adds an explicit `ask_clarification` tool, rewrites mixed tool batches to clarification-only, and turns clarification requests into readable ToolMessages that end the current run.',
    keywords: ['agent', 'middleware', 'clarification', 'tool message', 'human in the loop'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ClarificationPluginConfigSchema,
    formSchema: ClarificationPluginConfigFormSchema
  },
  register(ctx) {
    ctx.logger.log('register clarification middleware plugin')
    return { module: ClarificationPluginModule, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('clarification middleware plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('clarification middleware plugin stopped')
  }
}

export default plugin
