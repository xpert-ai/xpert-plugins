import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { ModelRetryPlugin } from './lib/model-retry.module.js'
import { ModelRetryIcon } from './lib/types.js'

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
      value: ModelRetryIcon,
      color: '#1565C0',
    },
    displayName: 'Model Retry Middleware',
    description:
      'Retry failed model calls with configurable backoff, bounded jitter, and platform-safe error matching.',
    keywords: ['agent', 'middleware', 'model retry', 'retry'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register model retry middleware plugin')
    return { module: ModelRetryPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('model retry middleware plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('model retry middleware plugin stopped')
  },
}

export default plugin
