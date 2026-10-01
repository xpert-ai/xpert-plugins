import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { ZSXQ_ICON } from './lib/branding.js'
import { ZSXQ_ARTIFACT_NAMESPACE, ZSXQ_PLUGIN_CONFIG_TOKEN, ZSXQ_PLUGIN_LEVEL } from './lib/constants.js'
import { ZsxqConnectorPluginModule } from './lib/zsxq-connector.module.js'
import { ZsxqPluginConfigFormSchema, ZsxqPluginConfigSchema } from './lib/plugin-config.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: XpertPlugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: ZSXQ_PLUGIN_LEVEL,
    artifactNamespace: ZSXQ_ARTIFACT_NAMESPACE,
    category: 'middleware',
    icon: ZSXQ_ICON,
    displayName: 'Knowledge Planet Connector',
    description: 'Connect Xpert Agents to Knowledge Planet through the official zsxq-cli OAuth flow.',
    keywords: ['zsxq', 'knowledge-planet', 'connector', 'oauth', 'topics', 'communities'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ZsxqPluginConfigSchema,
    formSchema: ZsxqPluginConfigFormSchema
  },
  permissions: [{ type: 'integration', service: 'zsxq', operations: ['read', 'write'] }],
  register(ctx) {
    const config = ZsxqPluginConfigSchema.parse(ctx.config ?? {})
    ctx.logger.log('register Knowledge Planet connector plugin')
    return {
      module: ZsxqConnectorPluginModule,
      global: true,
      providers: [{ provide: ZSXQ_PLUGIN_CONFIG_TOKEN, useValue: config }]
    }
  }
}

export default plugin
export { ZSXQ_ICON } from './lib/branding.js'
export { ZsxqCliService } from './lib/cli/zsxq-cli.service.js'
export { ZsxqConnectorStrategy } from './lib/connector/zsxq-connector.strategy.js'
export { ZsxqConnectorRuntimeMiddleware } from './lib/middlewares/zsxq-connector-runtime.middleware.js'
export { ZsxqConnectorPluginModule } from './lib/zsxq-connector.module.js'
export { ZsxqPluginConfigFormSchema, ZsxqPluginConfigSchema } from './lib/plugin-config.js'
export {
  ZSXQ_ARTIFACT_NAMESPACE,
  ZSXQ_AUTH_METHOD_ID,
  ZSXQ_CONNECTOR_PROVIDER,
  ZSXQ_PLUGIN_LEVEL,
  ZSXQ_RUNTIME_MIDDLEWARE_NAME
} from './lib/constants.js'
