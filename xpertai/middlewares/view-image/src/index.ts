import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { ViewImagePluginModule } from './lib/view-image.module.js'
import {
  ViewImageIcon,
  ViewImagePluginConfigFormSchema,
  ViewImagePluginConfigSchema
} from './lib/types.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: XpertPlugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: 'organization',
    category: 'middleware',
    icon: {
      type: 'svg',
      value: ViewImageIcon
    },
    displayName: 'View Image',
    description:
      'Adds an on-demand `view_image` tool for loading sandbox image files and temporarily attaching them to the next model call.',
    keywords: ['image', 'vision', 'middleware', 'sandbox', 'multimodal'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ViewImagePluginConfigSchema,
    formSchema: ViewImagePluginConfigFormSchema
  },
  register(ctx) {
    ctx.logger.log('register view image plugin')
    return { module: ViewImagePluginModule, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('view image plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('view image plugin stopped')
  }
}

export default plugin
