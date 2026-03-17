import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { z } from 'zod'
import { OpenAIModule } from './openai.module.js'
import { SvgIcon } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf8')
) as {
  name: string
  version: string
}

const plugin: XpertPlugin<any> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'model',
    icon: {
      type: 'svg',
      value: SvgIcon,
    },
    displayName: 'OpenAI',
    description: 'Provide OpenAI GPT-5 and GPT-5.4 models via Responses API',
    keywords: ['OpenAI', 'GPT-5', 'GPT-5.4', 'model', 'llm', 'reasoning', 'Responses API'],
    author: 'XpertAI Team',
  },
  config: {
    schema: z.object({}) as any,
  },
  register(ctx) {
    ctx.logger.log('register OpenAI plugin')
    return { module: OpenAIModule, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('OpenAI plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('OpenAI plugin stopped')
  },
}

export default plugin
