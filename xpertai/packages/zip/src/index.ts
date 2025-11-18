import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { z } from 'zod'
import { ZipPlugin } from './lib/plugin.js'
import { icon } from './lib/types.js'

const __filename = fileURLToPath(import.meta.url)
const dir_name = dirname(__filename)

const packageJson = JSON.parse(readFileSync(join(dir_name, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'tools',
    icon: {
      type: 'svg',
      value: icon
    },
    displayName: 'Zip',
    description: 'Compress multiple files into a zip file and extract files from zip archives',
    keywords: ['zip', 'compression', 'archive', 'unzip', 'extract'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register zip plugin')
    return { module: ZipPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('zip plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('zip plugin stopped')
  },
}

export default plugin
