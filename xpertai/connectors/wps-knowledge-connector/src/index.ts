import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { WPS_KNOWLEDGE_ICON } from './lib/branding.js'
import { WPS_KNOWLEDGE_PLUGIN_LEVEL } from './lib/constants.js'
import {
  WpsKnowledgePluginConfigFormSchema,
  WpsKnowledgePluginConfigSchema
} from './lib/plugin-config.js'
import { WpsKnowledgeConnectorPluginModule } from './lib/wps-knowledge-connector.module.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: XpertPlugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: WPS_KNOWLEDGE_PLUGIN_LEVEL,
    category: 'middleware',
    icon: WPS_KNOWLEDGE_ICON,
    displayName: 'WPS Knowledge Connector',
    description: 'Connect WPS Knowledge through SkillHub web sign-in and bounded read-only tools.',
    keywords: ['wps', 'knowledge', 'kwiki', 'skillhub', 'connector', 'rag', 'documents'],
    author: 'XpertAI Team'
  },
  config: {
    schema: WpsKnowledgePluginConfigSchema,
    formSchema: WpsKnowledgePluginConfigFormSchema
  },
  permissions: [{ type: 'integration', service: 'wps-knowledge', operations: ['read'] }],
  register(ctx) {
    const config = WpsKnowledgePluginConfigSchema.parse(ctx.config)
    ctx.logger.log('register WPS Knowledge SkillHub connector plugin')
    void config
    return {
      module: WpsKnowledgeConnectorPluginModule,
      global: true
    }
  }
}

export default plugin
export { WpsKnowledgeConnectorPluginModule } from './lib/wps-knowledge-connector.module.js'
export { WpsKnowledgeConnectorStrategy } from './lib/wps-knowledge-connector.strategy.js'
export { WpsKnowledgeRuntimeMiddleware } from './lib/wps-knowledge-runtime.middleware.js'
export { WpsKnowledgeService } from './lib/wps-knowledge.service.js'
export { WpsKnowledgeSkillHubClient } from './lib/wps-knowledge-skillhub.client.js'
export { WpsSkillHubAuthClient } from './lib/wps-skillhub-auth.client.js'
export { WPS_KNOWLEDGE_ICON } from './lib/branding.js'
export {
  WpsKnowledgePluginConfigFormSchema,
  WpsKnowledgePluginConfigSchema
} from './lib/plugin-config.js'
export {
  WPS_KNOWLEDGE_AUTH_METHOD_ID,
  WPS_KNOWLEDGE_CONNECTOR_PROVIDER,
  WPS_KNOWLEDGE_PLUGIN_LEVEL,
  WPS_KNOWLEDGE_RUNTIME_MIDDLEWARE_NAME
} from './lib/constants.js'
