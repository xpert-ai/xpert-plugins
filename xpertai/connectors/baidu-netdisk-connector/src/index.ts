import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { BAIDU_NETDISK_ICON } from './lib/branding.js'
import {
  BAIDU_NETDISK_ARTIFACT_NAMESPACE,
  BAIDU_NETDISK_AUTH_METHOD_OAUTH,
  BAIDU_NETDISK_CONNECTOR_PROVIDER,
  BAIDU_NETDISK_PLUGIN_CONTEXT,
  BAIDU_NETDISK_PLUGIN_CONFIG_TOKEN,
  BAIDU_NETDISK_PLUGIN_LEVEL,
  BAIDU_NETDISK_RUNTIME_MIDDLEWARE_NAME,
  BAIDU_NETDISK_SYSTEM_INTEGRATION_PROVIDER
} from './lib/constants.js'
import { BaiduNetdiskPluginConfigFormSchema, BaiduNetdiskPluginConfigSchema } from './lib/plugin-config.js'
import { BaiduNetdiskPluginModule } from './lib/baidu-netdisk-plugin.module.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: XpertPlugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: BAIDU_NETDISK_PLUGIN_LEVEL,
    artifactNamespace: BAIDU_NETDISK_ARTIFACT_NAMESPACE,
    category: 'middleware',
    icon: BAIDU_NETDISK_ICON,
    displayName: 'Baidu Netdisk Connector',
    description: 'Connect Xpert Agents to Baidu Netdisk through platform-managed OAuth.',
    keywords: ['baidu-netdisk', 'baidu-pan', 'netdisk', 'file', 'search', 'oauth', 'connector'],
    author: 'XpertAI Team'
  },
  config: {
    schema: BaiduNetdiskPluginConfigSchema,
    formSchema: BaiduNetdiskPluginConfigFormSchema
  },
  permissions: [
    {
      type: 'integration',
      service: BAIDU_NETDISK_CONNECTOR_PROVIDER,
      operations: ['read', 'write', 'update', 'delete']
    },
    { type: 'integration', service: BAIDU_NETDISK_SYSTEM_INTEGRATION_PROVIDER, operations: ['read'] }
  ],
  register(ctx) {
    const config = BaiduNetdiskPluginConfigSchema.parse(ctx.config)
    ctx.logger.log(`register Baidu Netdisk connector plugin (${BAIDU_NETDISK_RUNTIME_MIDDLEWARE_NAME})`)
    return {
      module: BaiduNetdiskPluginModule,
      global: true,
      providers: [
        { provide: BAIDU_NETDISK_PLUGIN_CONFIG_TOKEN, useValue: config },
        { provide: BAIDU_NETDISK_PLUGIN_CONTEXT, useValue: ctx }
      ]
    }
  }
}

export default plugin
export { BaiduNetdiskPluginModule } from './lib/baidu-netdisk-plugin.module.js'
export { BaiduNetdiskClient } from './lib/client/baidu-netdisk.client.js'
export { BaiduNetdiskConnectorStrategy } from './lib/connector/baidu-netdisk-connector.strategy.js'
export { BaiduNetdiskOAuthClient } from './lib/connector/baidu-netdisk-oauth.client.js'
export { BaiduNetdiskIntegrationStrategy } from './lib/baidu-netdisk-integration.strategy.js'
export { BaiduNetdiskRuntimeMiddleware } from './lib/middlewares/baidu-netdisk-runtime.middleware.js'
export { BaiduNetdiskPluginConfigFormSchema, BaiduNetdiskPluginConfigSchema } from './lib/plugin-config.js'
export {
  BAIDU_NETDISK_ARTIFACT_NAMESPACE,
  BAIDU_NETDISK_AUTH_METHOD_OAUTH,
  BAIDU_NETDISK_CONNECTOR_PROVIDER,
  BAIDU_NETDISK_PLUGIN_CONTEXT,
  BAIDU_NETDISK_PLUGIN_LEVEL,
  BAIDU_NETDISK_RUNTIME_MIDDLEWARE_NAME,
  BAIDU_NETDISK_SYSTEM_INTEGRATION_PROVIDER
} from './lib/constants.js'
