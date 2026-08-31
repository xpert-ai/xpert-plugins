import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { DINGTALK_CONNECTOR_ICON } from './lib/branding.js'
import { DingTalkConnectorPluginModule } from './lib/dingtalk-connector.module.js'

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
    icon: DINGTALK_CONNECTOR_ICON,
    displayName: 'DingTalk Connector',
    description: 'Connects a workspace to DingTalk with DWS-managed user OAuth and the dws CLI.',
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
  register(ctx) {
    ctx.logger.log('register DingTalk connector plugin')
    return {
      module: DingTalkConnectorPluginModule,
      global: true
    }
  }
}

export default plugin
export { DingTalkConnectorPluginModule } from './lib/dingtalk-connector.module.js'
export { DingTalkConnectorStrategy } from './lib/dingtalk-connector.strategy.js'
export { DingTalkDwsAuthClient } from './lib/api/dingtalk-dws-auth.client.js'
export {
  DINGTALK_CONNECTOR_AUTH_METHOD_ID,
  DINGTALK_CONNECTOR_AUTHORIZE_URL,
  DINGTALK_CONNECTOR_PROVIDER,
  DINGTALK_CONNECTOR_TOKEN_URL,
  DINGTALK_DWS_MANAGED_OAUTH_APP_ID
} from './lib/dingtalk-connector.strategy.js'
export { DingTalkCliBootstrapService } from './lib/middlewares/dingtalk-cli-bootstrap.service.js'
export { DingTalkConnectorRuntimeMiddleware } from './lib/middlewares/dingtalk-connector-runtime.middleware.js'
