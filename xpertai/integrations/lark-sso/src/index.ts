import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { LarkSsoPluginModule } from './lib/lark-sso.module.js'
import {
  LarkSsoPluginConfigFormSchema,
  LarkSsoPluginConfigSchema
} from './lib/plugin-config.js'
import { larkSsoIcon } from './lib/types.js'
import {
  LARK_SSO_PLUGIN_CONFIG,
  LARK_SSO_PLUGIN_CONTEXT
} from './lib/tokens.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: XpertPlugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: 'system',
    category: 'integration',
    icon: {
      type: 'svg',
      value: larkSsoIcon,
      color: '#0F766E'
    },
    displayName: 'Lark SSO',
    description:
      'Adds Feishu/Lark SSO login and account binding flows for Xpert.',
    keywords: ['lark', 'feishu', 'identity', 'sso', 'account binding'],
    author: 'XpertAI Team'
  },
  config: {
    schema: LarkSsoPluginConfigSchema,
    formSchema: LarkSsoPluginConfigFormSchema
  },
  permissions: [
    {
      type: 'sso_binding',
      operations: ['create'],
      providers: ['lark']
    },
    {
      type: 'bound_identity_login',
      operations: ['create'],
      providers: ['lark']
    }
  ] as any,
  register(ctx) {
    ctx.logger.log('register lark sso plugin')
    return {
      module: LarkSsoPluginModule,
      global: true,
      providers: [
        { provide: LARK_SSO_PLUGIN_CONTEXT, useValue: ctx },
        { provide: LARK_SSO_PLUGIN_CONFIG, useValue: ctx.config }
      ]
    }
  },
  async onStart(ctx) {
    ctx.logger.log('lark sso plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('lark sso plugin stopped')
  }
}

export default plugin
