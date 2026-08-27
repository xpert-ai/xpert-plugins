import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { WeComConnectorPluginModule } from './lib/wecom-connector.module.js'
import {
  WECOM_AUTH_INTEGRATION_PROVIDER,
  WECOM_CONNECTOR_ARTIFACT_NAMESPACE,
  WECOM_CONNECTOR_ICON_DEFINITION,
  WECOM_CONNECTOR_INSTALL_LEVEL
} from './lib/types.js'
import { WECOM_CONNECTOR_PLUGIN_CONTEXT } from './lib/tokens.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: XpertPlugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: WECOM_CONNECTOR_INSTALL_LEVEL,
    artifactNamespace: WECOM_CONNECTOR_ARTIFACT_NAMESPACE,
    category: 'middleware',
    icon: WECOM_CONNECTOR_ICON_DEFINITION,
    displayName: 'WeCom Connector',
    description:
      'Connects a workspace to WeCom and provides bounded directory and application-messaging tools.',
    keywords: ['wecom', 'enterprise wechat', 'connector', 'oauth', 'qr', 'directory', 'messaging', 'middleware'],
    author: 'XpertAI Team'
  },
  config: {
    schema: z.object({}),
    formSchema: {
      type: 'object',
      properties: {}
    }
  },
  permissions: [{ type: 'integration', service: WECOM_AUTH_INTEGRATION_PROVIDER, operations: ['read'] }],
  register(ctx) {
    ctx.logger.log('register wecom connector plugin')
    return {
      module: WeComConnectorPluginModule,
      global: true,
      providers: [{ provide: WECOM_CONNECTOR_PLUGIN_CONTEXT, useValue: ctx }]
    }
  }
}

export default plugin
export { WeComConnectorPluginModule } from './lib/wecom-connector.module.js'
export { WeComAuthIntegrationStrategy } from './lib/wecom-auth-integration.strategy.js'
export { WeComConnectorStrategy } from './lib/wecom-connector.strategy.js'
export { WeComConnectorRuntimeMiddleware } from './lib/wecom-connector-runtime.middleware.js'
