import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { CANVA_ICON } from './lib/branding.js'
import { CANVA_CONNECT_INTEGRATION_PROVIDER } from './lib/canva-connect-integration.strategy.js'
import { CanvaConnectorPluginModule } from './lib/canva-connector.module.js'
import { CANVA_CONNECTOR_PROVIDER, CANVA_ARTIFACT_NAMESPACE, CANVA_PLUGIN_LEVEL } from './lib/constants.js'
import { CANVA_MCP_INTEGRATION_PROVIDER } from './lib/canva-mcp-integration.strategy.js'
import { CanvaPluginConfigFormSchema, CanvaPluginConfigSchema, type CanvaPluginConfig } from './lib/plugin-config.js'
import { CANVA_PLUGIN_CONTEXT } from './lib/tokens.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: XpertPlugin<CanvaPluginConfig> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: CANVA_PLUGIN_LEVEL,
    artifactNamespace: CANVA_ARTIFACT_NAMESPACE,
    category: 'middleware',
    icon: CANVA_ICON,
    displayName: 'Canva 可画 Connector',
    description: 'Connect each Xpert workspace user to Canva through bounded OAuth and MCP tools.',
    keywords: ['canva', 'canva-cn', 'design', 'mcp', 'oauth', 'connector'],
    author: 'XpertAI Team'
  },
  config: {
    schema: CanvaPluginConfigSchema,
    defaults: { mcpRegistration: 'dcr' },
    formSchema: CanvaPluginConfigFormSchema
  },
  permissions: [
    { type: 'integration', service: CANVA_CONNECTOR_PROVIDER, operations: ['read', 'write'] },
    { type: 'integration', service: CANVA_MCP_INTEGRATION_PROVIDER, operations: ['read'] },
    { type: 'integration', service: CANVA_CONNECT_INTEGRATION_PROVIDER, operations: ['read'] }
  ],
  register(ctx) {
    CanvaPluginConfigSchema.parse(ctx.config ?? {})
    ctx.logger.log('register Canva connector plugin')
    return {
      module: CanvaConnectorPluginModule,
      global: true,
      providers: [{ provide: CANVA_PLUGIN_CONTEXT, useValue: ctx }]
    }
  }
}

export default plugin
export { CanvaConnectorPluginModule } from './lib/canva-connector.module.js'
export { CanvaConnectorStrategy } from './lib/canva-connector.strategy.js'
export { CanvaConnectorRuntimeMiddleware } from './lib/middlewares/canva-connector-runtime.middleware.js'
export { CanvaMcpIntegrationStrategy } from './lib/canva-mcp-integration.strategy.js'
export { CanvaConnectIntegrationStrategy } from './lib/canva-connect-integration.strategy.js'
export { CanvaDesignService } from './lib/canva-design.service.js'
export { CanvaMcpClient } from './lib/mcp/canva-mcp.client.js'
export { CanvaOAuthClient } from './lib/oauth/canva-oauth.client.js'
export { CanvaPluginConfigFormSchema, CanvaPluginConfigSchema } from './lib/plugin-config.js'
export {
  CANVA_ARTIFACT_NAMESPACE,
  CANVA_CONNECTOR_PROVIDER,
  CANVA_MCP_CN_AUTH_METHOD,
  CANVA_PLUGIN_LEVEL,
  CANVA_RUNTIME_MIDDLEWARE_NAME
} from './lib/constants.js'
