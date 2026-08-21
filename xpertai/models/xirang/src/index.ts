import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { XirangModule } from './xirang.module.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
  name: string
  version: string
}
const icon = readFileSync(join(__dirname, '_assets/icon.svg'), 'utf8')
const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'model',
    level: 'organization',
    artifactNamespace: 'xirang_model',
    icon: { type: 'svg', value: icon },
    displayName: '天翼云模型',
    description: '通过天翼云星辰 MaaS 接入兼容 OpenAI API 的文本、向量、重排和图片模型',
    keywords: ['天翼云', '星辰', 'Xirang', 'Ctyun', 'model', 'LLM'],
    author: 'XpertAI'
  },
  config: { schema: ConfigSchema },
  register(ctx) {
    ctx.logger.log('register Tianyi Cloud Xirang plugin')
    return { module: XirangModule, global: true }
  },
  onStart(ctx) {
    ctx.logger.log('Tianyi Cloud Xirang plugin started')
  },
  onStop(ctx) {
    ctx.logger.log('Tianyi Cloud Xirang plugin stopped')
  }
}

export default plugin
