import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { NOTION_ICON } from './lib/branding.js'
import { NOTION_PLUGIN_CONTEXT, NOTION_PLUGIN_LEVEL } from './lib/constants.js'
import { NotionConnectorPluginModule } from './lib/notion-connector.module.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: XpertPlugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: NOTION_PLUGIN_LEVEL,
    category: 'middleware',
    icon: NOTION_ICON,
    displayName: 'Notion Connector',
    description: 'Connect a Notion workspace through Public OAuth and bounded read tools.',
    keywords: ['notion', 'connector', 'oauth', 'workspace', 'pages', 'database'],
    author: 'XpertAI Team'
  },
  config: {
    schema: z.object({}),
    formSchema: { type: 'object', properties: {} }
  },
  permissions: [{ type: 'integration', service: 'notion', operations: ['read'] }],
  register(ctx) {
    ctx.logger.log('register Notion connector plugin')
    return {
      module: NotionConnectorPluginModule,
      global: true,
      providers: [{ provide: NOTION_PLUGIN_CONTEXT, useValue: ctx }]
    }
  }
}

export default plugin
export { NotionConnectorPluginModule } from './lib/notion-connector.module.js'
export { NotionConnectorStrategy } from './lib/notion-connector.strategy.js'
export { NotionConnectorRuntimeMiddleware } from './lib/notion-connector-runtime.middleware.js'
export { NotionApiClient } from './lib/notion-api.client.js'
export { NotionIntegrationStrategy } from './lib/notion-integration.strategy.js'
export { NOTION_ICON } from './lib/branding.js'
export {
  NOTION_ARTIFACT_NAMESPACE,
  NOTION_CONNECTOR_PROVIDER,
  NOTION_PLUGIN_LEVEL,
  NOTION_PUBLIC_OAUTH_AUTH_METHOD,
  NOTION_PLUGIN_CONTEXT,
  NOTION_RUNTIME_MIDDLEWARE_NAME
} from './lib/constants.js'
