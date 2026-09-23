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
      'Bootstraps the Lark CLI tool and complete AI Agent Skills into the sandbox, including the lark-slides workflow for planning, creating, validating, and editing native Feishu presentations. Supports workspace connector, user-level (OAuth), and bot-level (App ID/Secret) authentication.',
    keywords: [
      'lark',
      'feishu',
      'cli',
      'middleware',
      'sandbox',
      'calendar',
      'messenger',
      'docs',
      'sheets',
      'slides',
      'ppt',
      'presentations',
      'base'
    ],
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
export { LarkCliPluginModule } from './lib/lark-cli.module.js'
export { LarkBootstrapService } from './lib/lark-bootstrap.service.js'
export { LarkConnectorStrategy } from './lib/lark-connector.strategy.js'
export { LarkConnectorRuntimeMiddleware } from './lib/lark-connector-runtime.middleware.js'
export { LarkCLISkillMiddleware } from './lib/lark.middleware.js'
export { LarkSkillValidator } from './lib/lark.validator.js'
