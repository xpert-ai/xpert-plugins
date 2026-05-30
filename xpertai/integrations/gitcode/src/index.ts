import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { GitCodePlugin } from './lib/gitcode.plugin.js'
import { GitCodeIcon } from './lib/types.js'

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
      value: GitCodeIcon
    },
    displayName: 'GitCode',
    description: 'Provide GitCode skill repository source provider',
    keywords: ['gitcode', 'skills', 'repository', 'integration'],
    author: 'XpertAI Team',
    homepage: 'https://gitcode.com'
  },
  config: {
    schema: ConfigSchema
  },
  register(ctx) {
    ctx.logger.log('register gitcode plugin')
    return { module: GitCodePlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('gitcode plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('gitcode plugin stopped')
  }
}

export default plugin
