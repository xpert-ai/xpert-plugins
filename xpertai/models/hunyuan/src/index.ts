import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { z } from 'zod'
import { SvgIcon } from './types.js'
import { HunyuanModule } from './hunyuan.module.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({})

const plugin: XpertPlugin<any> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'model',
    icon: {
      type: 'svg',
      value: SvgIcon,
    },
    displayName: 'Tencent Hunyuan',
    description: 'Provide Tencent Hunyuan chat models',
    keywords: ['tencent', 'hunyuan', 'model', 'llm'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema as any,
  },
  register(ctx) {
    ctx.logger.log('register Hunyuan plugin')
    return { module: HunyuanModule, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('Hunyuan plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('Hunyuan plugin stopped')
  },
}

export default plugin
