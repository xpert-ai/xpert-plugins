import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { NETEASE_MAIL_ICON } from './lib/branding.js'
import { NETEASE_MAIL_PLUGIN_LEVEL } from './lib/constants.js'
import { NeteaseMailConnectorPluginModule } from './lib/netease-mail-connector.module.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: XpertPlugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: NETEASE_MAIL_PLUGIN_LEVEL,
    category: 'middleware',
    icon: NETEASE_MAIL_ICON,
    displayName: 'NetEase Mail Connector',
    description: 'Connect 163, 126, and yeah.net mailboxes through IMAP and SMTP authorization codes.',
    keywords: ['netease', '163', '126', 'yeah', 'mail', 'imap', 'smtp', 'connector'],
    author: 'XpertAI Team'
  },
  config: {
    schema: z.object({}),
    formSchema: {
      type: 'object',
      properties: {}
    }
  },
  permissions: [{ type: 'integration', service: 'netease-mail', operations: ['read', 'write'] }],
  register(ctx) {
    ctx.logger.log('register NetEase Mail connector plugin')
    return {
      module: NeteaseMailConnectorPluginModule,
      global: true
    }
  }
}

export default plugin
export { NeteaseMailConnectorPluginModule } from './lib/netease-mail-connector.module.js'
export { NeteaseMailConnectorStrategy } from './lib/netease-mail-connector.strategy.js'
export { NeteaseMailRuntimeMiddleware } from './lib/netease-mail-runtime.middleware.js'
export { NeteaseMailService } from './lib/netease-mail.service.js'
export {
  NETEASE_MAIL_AUTH_METHOD_ID,
  NETEASE_MAIL_CONNECTOR_PROVIDER,
  NETEASE_MAIL_PLUGIN_LEVEL,
  NETEASE_MAIL_RUNTIME_MIDDLEWARE_NAME
} from './lib/constants.js'
