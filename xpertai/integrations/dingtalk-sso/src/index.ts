import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { DingTalkSsoPluginModule } from './lib/dingtalk-sso.module.js'
import { DingTalkSsoPluginConfigSchema } from './lib/plugin-config.js'
import { DINGTALK_SSO_PLUGIN_CONTEXT } from './lib/tokens.js'
import {
  DINGTALK_SSO_ARTIFACT_NAMESPACE,
  DINGTALK_SSO_PROVIDER,
  dingtalkSsoIcon
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
    level: 'system',
    artifactNamespace: DINGTALK_SSO_ARTIFACT_NAMESPACE,
    category: 'integration',
    icon: {
      type: 'svg',
      value: dingtalkSsoIcon
    },
    displayName: 'DingTalk SSO',
    description: 'Adds DingTalk OAuth sign-in and account binding flows for Xpert.',
    keywords: ['dingtalk', 'identity', 'oauth', 'sso', 'account binding'],
    author: 'XpertAI Team'
  },
  config: {
    schema: DingTalkSsoPluginConfigSchema,
    defaults: {}
  },
  permissions: [
    {
      type: 'integration',
      service: DINGTALK_SSO_PROVIDER,
      operations: ['read']
    },
    {
      type: 'sso_binding',
      operations: ['create'],
      providers: [DINGTALK_SSO_PROVIDER]
    },
    {
      type: 'bound_identity_login',
      operations: ['create'],
      providers: [DINGTALK_SSO_PROVIDER]
    }
  ] as any,
  register(ctx) {
    ctx.logger.log('register dingtalk sso plugin')
    return {
      module: DingTalkSsoPluginModule,
      global: true,
      providers: [{ provide: DINGTALK_SSO_PLUGIN_CONTEXT, useValue: ctx }]
    }
  },
  async onStart(ctx) {
    ctx.logger.log('dingtalk sso plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('dingtalk sso plugin stopped')
  }
}

export default plugin
