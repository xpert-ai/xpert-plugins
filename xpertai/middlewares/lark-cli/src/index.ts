import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { LarkCliPluginModule } from './lib/lark-cli.module.js'
import {
  LarkCliPluginConfigFormSchema,
  LarkCliPluginConfigSchema,
  LarkIcon
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
      type: 'image',
      value: LarkIcon
    },
    displayName: 'Lark CLI',
    description:
      'Bootstraps the Lark CLI tool into the sandbox, downloads AI Agent Skills from GitHub, and teaches the agent how to interact with Lark/Feishu through sandbox_shell. Supports both user-level (OAuth) and bot-level (App ID/Secret) authentication.',
    keywords: ['lark', 'feishu', 'cli', 'middleware', 'sandbox', 'calendar', 'messenger', 'docs', 'sheets', 'base'],
    author: 'XpertAI Team'
  },
  config: {
    schema: LarkCliPluginConfigSchema,
    formSchema: LarkCliPluginConfigFormSchema
  },
  register(ctx) {
    ctx.logger.log('register lark cli plugin')
    return { module: LarkCliPluginModule, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('lark cli plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('lark cli plugin stopped')
  }
}

export default plugin
