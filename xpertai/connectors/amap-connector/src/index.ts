import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { AMAP_ICON } from './lib/branding.js'
import { AMAP_PLUGIN_LEVEL } from './lib/constants.js'
import { AmapPluginConfigFormSchema, AmapPluginConfigSchema } from './lib/plugin-config.js'
import { AmapPluginModule } from './lib/amap-plugin.module.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: XpertPlugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: AMAP_PLUGIN_LEVEL,
    category: 'middleware',
    icon: AMAP_ICON,
    displayName: 'AMap Connector',
    description: 'Connect Xpert Agents to the official AMap Web Service API.',
    keywords: ['amap', 'gaode-map', 'map', 'geocoding', 'route', 'poi', 'connector'],
    author: 'XpertAI Team'
  },
  config: {
    schema: AmapPluginConfigSchema,
    formSchema: AmapPluginConfigFormSchema
  },
  permissions: [{ type: 'integration', service: 'amap', operations: ['read'] }],
  register(ctx) {
    AmapPluginConfigSchema.parse(ctx.config)
    ctx.logger.log('register AMap connector plugin')
    return { module: AmapPluginModule, global: true }
  }
}

export default plugin
export { AmapPluginModule } from './lib/amap-plugin.module.js'
export { AmapConnectorStrategy } from './lib/connector/amap-connector.strategy.js'
export { AmapWebServiceClient, signAmapParameters } from './lib/client/amap-webservice.client.js'
export { AmapConnectorRuntimeMiddleware } from './lib/middlewares/amap-connector-runtime.middleware.js'
export { AmapPluginConfigFormSchema, AmapPluginConfigSchema } from './lib/plugin-config.js'
export {
  AMAP_AUTH_METHOD_ID,
  AMAP_CONNECTOR_PROVIDER,
  AMAP_PLUGIN_LEVEL,
  AMAP_RUNTIME_MIDDLEWARE_NAME
} from './lib/constants.js'
