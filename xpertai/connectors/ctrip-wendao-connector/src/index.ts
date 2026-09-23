import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { CTRIP_WENDAO_ICON } from './lib/branding.js'
import { CTRIP_WENDAO_PLUGIN_LEVEL } from './lib/constants.js'
import { CtripWendaoConnectorPluginModule } from './lib/ctrip-wendao-connector.module.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: XpertPlugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: CTRIP_WENDAO_PLUGIN_LEVEL,
    category: 'middleware',
    icon: CTRIP_WENDAO_ICON,
    displayName: 'Ctrip Wendao Connector',
    description: 'Query Ctrip Wendao for hotels, flights, attractions, itineraries, and visa information.',
    keywords: [
      'ctrip',
      'wendao',
      'travel',
      'hotel',
      'flight',
      'attraction',
      'itinerary',
      'visa',
      'recommendation',
      'connector'
    ],
    author: 'XpertAI Team'
  },
  config: {
    schema: z.object({}),
    formSchema: {
      type: 'object',
      properties: {}
    }
  },
  permissions: [{ type: 'integration', service: 'ctrip-wendao', operations: ['read'] }],
  register(ctx) {
    ctx.logger.log('register Ctrip Wendao connector plugin')
    return {
      module: CtripWendaoConnectorPluginModule,
      global: true
    }
  }
}

export default plugin
export { CtripWendaoClient } from './lib/ctrip-wendao.client.js'
export { CtripWendaoConnectorPluginModule } from './lib/ctrip-wendao-connector.module.js'
export { CtripWendaoConnectorStrategy } from './lib/ctrip-wendao-connector.strategy.js'
export { CtripWendaoRuntimeMiddleware } from './lib/ctrip-wendao-runtime.middleware.js'
export {
  CTRIP_WENDAO_AUTH_METHOD_ID,
  CTRIP_WENDAO_CONNECTOR_PROVIDER,
  CTRIP_WENDAO_PLUGIN_LEVEL,
  CTRIP_WENDAO_RUNTIME_MIDDLEWARE_NAME
} from './lib/constants.js'
