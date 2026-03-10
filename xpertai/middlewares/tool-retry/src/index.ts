import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { ToolRetryPlugin } from './lib/tool-retry.module.js'
import { ToolRetryIcon } from './lib/types.js'

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
    category: 'middleware',
    icon: {
      type: 'svg',
      value: ToolRetryIcon,
      color: '#2E7D32',
    },
    displayName: 'Tool Retry Middleware',
    description:
      'Retry failed tool executions with configurable backoff, bounded jitter, and platform-safe error matching.',
    keywords: ['agent', 'middleware', 'tool retry', 'retry'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register tool retry middleware plugin')
    return { module: ToolRetryPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('tool retry middleware plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('tool retry middleware plugin stopped')
  },
}

export default plugin
