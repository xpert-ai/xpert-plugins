import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { DINGTALK_CONNECTOR_ICON } from './lib/branding.js'
import { DingTalkConnectorPluginModule } from './lib/dingtalk-connector.module.js'
import { DINGTALK_CONNECTOR_PLUGIN_CONTEXT } from './lib/tokens.js'

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
      value: DINGTALK_CONNECTOR_ICON
    },
    displayName: 'DingTalk Connector',
    description: 'Connects a workspace to DingTalk with OAuth using the configured system integration.',
    keywords: ['dingtalk', 'connector', 'oauth', 'middleware'],
    author: 'XpertAI Team'
  },
  config: {
    schema: z.object({}),
    formSchema: {
      type: 'object',
      properties: {}
    }
  },
  permissions: [
    { type: 'integration', service: 'dingtalk', operations: ['read'] },
    { type: 'integration', service: 'dingtalk_long', operations: ['read'] }
  ],
  register(ctx) {
    ctx.logger.log('register DingTalk connector plugin')
    return {
      module: DingTalkConnectorPluginModule,
      global: true,
      providers: [{ provide: DINGTALK_CONNECTOR_PLUGIN_CONTEXT, useValue: ctx }]
    }
  }
}

export default plugin
export { DingTalkConnectorPluginModule } from './lib/dingtalk-connector.module.js'
export { DingTalkConnectorStrategy } from './lib/dingtalk-connector.strategy.js'
export { DingTalkConnectorRuntimeMiddleware } from './lib/middlewares/dingtalk-connector-runtime.middleware.js'
