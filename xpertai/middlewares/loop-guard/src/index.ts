import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { LoopGuardPlugin } from './lib/loop-guard.module.js'
import { LoopGuardIcon } from './lib/types.js'

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
      value: LoopGuardIcon,
      color: '#E85D0C',
    },
    displayName: 'Loop Guard Middleware',
    description:
      'Detect repeated or unproductive tool-call loops and stop the run before the agent gets stuck.',
    keywords: ['agent', 'middleware', 'tool loop', 'loop guard', 'tool guard'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register loop guard middleware plugin')
    return { module: LoopGuardPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('loop guard middleware plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('loop guard middleware plugin stopped')
  },
}

export default plugin
