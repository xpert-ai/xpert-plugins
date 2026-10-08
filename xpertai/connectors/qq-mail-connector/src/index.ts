import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { QQ_MAIL_ICON } from './lib/branding.js'
import { QQ_MAIL_PLUGIN_LEVEL, QQ_MAIL_SYSTEM_INTEGRATION_PROVIDER } from './lib/constants.js'
import { QqMailConnectorPluginModule } from './lib/qq-mail-connector.module.js'
import { QQ_MAIL_PLUGIN_CONTEXT } from './lib/tokens.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: XpertPlugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: QQ_MAIL_PLUGIN_LEVEL,
    category: 'middleware',
    icon: QQ_MAIL_ICON,
    displayName: 'QQ Mail Connector',
    description: 'Connect QQ Mail with QR-code OAuth or an IMAP/SMTP authorization code.',
    keywords: ['qq-mail', 'email', 'connector', 'oauth', 'pkce', 'mcp', 'imap', 'smtp', 'middleware'],
    author: 'XpertAI Team'
  },
  config: {
    schema: z.object({}),
    formSchema: { type: 'object', properties: {} }
  },
  permissions: [
    { type: 'integration', service: 'qq-mail', operations: ['read', 'write'] },
    { type: 'integration', service: QQ_MAIL_SYSTEM_INTEGRATION_PROVIDER, operations: ['read'] }
  ],
  register(ctx) {
    ctx.logger.log('register QQ Mail connector plugin')
    return {
      module: QqMailConnectorPluginModule,
      global: true,
      providers: [{ provide: QQ_MAIL_PLUGIN_CONTEXT, useValue: ctx }]
    }
  }
}

export default plugin
export { QqMailConnectorPluginModule } from './lib/qq-mail-connector.module.js'
export { QqMailConnectorStrategy } from './lib/qq-mail-connector.strategy.js'
export { QqMailConnectorRuntimeMiddleware } from './lib/middlewares/qq-mail-connector-runtime.middleware.js'
export { QqMailIntegrationStrategy } from './lib/qq-mail-integration.strategy.js'
export { QqMailProtocolService } from './lib/protocol/qq-mail-protocol.service.js'
