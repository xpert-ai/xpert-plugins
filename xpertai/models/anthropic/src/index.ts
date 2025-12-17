import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { AnthropicPlugin } from './anthropic.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({})

const svgIcon: string = readFileSync(join(__dirname, '_assets/icon.svg'), 'utf-8')

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'model',
    icon: {
      type: 'svg',
      value: svgIcon
    },
    displayName: 'Anthropic',
    description: 'Provide adapter for Anthropic Claude models',
    keywords: ['Anthropic', 'Claude', 'model'],
    author: 'XpertAI'
  },
  config: {
    schema: ConfigSchema
  },
  register(ctx) {
    ctx.logger.log('register Anthropic plugin')
    return { module: AnthropicPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('Anthropic plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('Anthropic plugin stopped')
  }
}

export default plugin
