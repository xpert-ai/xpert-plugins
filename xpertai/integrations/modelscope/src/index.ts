import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { ModelScopePlugin } from './lib/modelscope.plugin.js'
import { ModelScopeIcon } from './lib/types.js'

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
      type: 'svg',
      value: ModelScopeIcon
    },
    displayName: 'ModelScope',
    description: 'Provide ModelScope skill repository source provider',
    keywords: ['modelscope', 'skills', 'repository', 'integration'],
    author: 'XpertAI Team',
    homepage: 'https://www.modelscope.cn/skills'
  },
  config: {
    schema: ConfigSchema
  },
  register(ctx) {
    ctx.logger.log('register modelscope plugin')
    return { module: ModelScopePlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('modelscope plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('modelscope plugin stopped')
  }
}

export default plugin
