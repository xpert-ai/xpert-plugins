import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { TENCENT_MAP_ICON } from './lib/branding.js'
import { TENCENT_MAP_PLUGIN_LEVEL } from './lib/constants.js'
import {
  TencentMapPluginConfigFormSchema,
  TencentMapPluginConfigSchema
} from './lib/plugin-config.js'
import { TencentMapPluginModule } from './lib/tencent-map-plugin.module.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: XpertPlugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: TENCENT_MAP_PLUGIN_LEVEL,
    category: 'middleware',
    icon: TENCENT_MAP_ICON,
    displayName: 'Tencent Maps Connector',
    description: 'Connect Xpert Agents to the official Tencent Maps WebService API.',
    keywords: ['tencent-map', 'tencent-lbs', 'map', 'geocoding', 'route', 'poi', 'connector'],
    author: 'XpertAI Team'
  },
  config: {
    schema: TencentMapPluginConfigSchema,
    formSchema: TencentMapPluginConfigFormSchema
  },
  permissions: [{ type: 'integration', service: 'tencent-map', operations: ['read'] }],
  register(ctx) {
    TencentMapPluginConfigSchema.parse(ctx.config)
    ctx.logger.log('register Tencent Maps connector plugin')
    return { module: TencentMapPluginModule, global: true }
  }
}

export default plugin
export { TencentMapPluginModule } from './lib/tencent-map-plugin.module.js'
export { TencentMapConnectorStrategy } from './lib/connector/tencent-map-connector.strategy.js'
export { TencentMapWebServiceClient } from './lib/client/tencent-map-webservice.client.js'
export { TencentMapConnectorRuntimeMiddleware } from './lib/middlewares/tencent-map-connector-runtime.middleware.js'
export { TencentMapPluginConfigFormSchema, TencentMapPluginConfigSchema } from './lib/plugin-config.js'
export {
  TENCENT_MAP_AUTH_METHOD_ID,
  TENCENT_MAP_CONNECTOR_PROVIDER,
  TENCENT_MAP_PLUGIN_LEVEL,
  TENCENT_MAP_RUNTIME_MIDDLEWARE_NAME
} from './lib/constants.js'
