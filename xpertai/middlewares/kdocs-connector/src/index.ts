import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { KDOCS_PLUGIN_LEVEL } from './lib/constants.js'
import { KdocsConnectorPluginModule } from './lib/kdocs-connector.module.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: XpertPlugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: KDOCS_PLUGIN_LEVEL,
    category: 'middleware',
    icon: { type: 'font', value: 'ri-file-cloud-fill', color: '#e6002d' },
    displayName: 'WPS Docs Connector',
    description: 'Connect WPS Cloud Docs through browser sign-in and bounded SkillHub MCP tools.',
    keywords: ['wps', 'kdocs', 'kingsoft', 'connector', 'oauth', 'mcp', 'documents'],
    author: 'XpertAI Team'
  },
  config: {
    schema: z.object({}),
    formSchema: { type: 'object', properties: {} }
  },
  permissions: [{ type: 'integration', service: 'kdocs', operations: ['read', 'write'] }],
  register(ctx) {
    ctx.logger.log('register WPS Docs connector plugin')
    return { module: KdocsConnectorPluginModule, global: true }
  }
}

export default plugin
export { KdocsConnectorPluginModule } from './lib/kdocs-connector.module.js'
export { KdocsConnectorRuntimeMiddleware } from './lib/kdocs-connector-runtime.middleware.js'
export { KdocsConnectorStrategy } from './lib/kdocs-connector.strategy.js'
export { KdocsSkillHubAuthClient } from './lib/kdocs-skillhub-auth.client.js'
export { KdocsMcpClient } from './lib/mcp/kdocs-mcp.client.js'
export {
  KDOCS_AUTH_METHOD_ID,
  KDOCS_CONNECTOR_PROVIDER,
  KDOCS_PLUGIN_LEVEL,
  KDOCS_RUNTIME_MIDDLEWARE_NAME
} from './lib/constants.js'
