import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { LarkIdentityPluginModule } from './lib/lark-identity.module.js'
import {
  LarkIdentityPluginConfigFormSchema,
  LarkIdentityPluginConfigSchema
} from './lib/plugin-config.js'
import { larkIdentityIcon } from './lib/types.js'
import {
  LARK_IDENTITY_PLUGIN_CONFIG,
  LARK_IDENTITY_PLUGIN_CONTEXT
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
      value: larkIdentityIcon,
      color: '#0F766E'
    },
    displayName: 'Lark Identity',
    description:
      'Adds Feishu/Lark identity binding and binding-first SSO login for Xpert.',
    keywords: ['lark', 'feishu', 'identity', 'sso', 'account binding'],
    author: 'XpertAI Team'
  },
  config: {
    schema: LarkIdentityPluginConfigSchema,
    formSchema: LarkIdentityPluginConfigFormSchema
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
    ctx.logger.log('register lark identity plugin')
    return {
      module: LarkIdentityPluginModule,
      global: true,
      providers: [
        { provide: LARK_IDENTITY_PLUGIN_CONTEXT, useValue: ctx },
        { provide: LARK_IDENTITY_PLUGIN_CONFIG, useValue: ctx.config }
      ]
    }
  },
  async onStart(ctx) {
    ctx.logger.log('lark identity plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('lark identity plugin stopped')
  }
}

export default plugin
