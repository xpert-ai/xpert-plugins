import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { VeoSvgIcon } from './types.js'
import { VeoPluginModule } from './veo.module.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf8')
) as { name: string; version: string }

const ConfigSchema = z.object({}).strict()

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'model',
    icon: {
      type: 'svg',
      value: VeoSvgIcon
    },
    displayName: 'Google Veo',
    description:
      'Generate videos with Google Veo through the Gemini Developer API.',
    keywords: ['Veo', 'Google', 'Gemini', 'video', 'generation'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  register(ctx) {
    ctx.logger.log('register Google Veo plugin')
    return { module: VeoPluginModule, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('Google Veo plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('Google Veo plugin stopped')
  }
}

export { GeminiVeoClient } from './client.js'
export { VeoStrategy } from './strategy.js'
export { VeoToolset } from './toolset.js'
export { buildVeoTools } from './tools.js'
export * from './types.js'

export default plugin
