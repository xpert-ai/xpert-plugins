import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { WeComConnectorPluginModule } from './lib/wecom-connector.module.js'
import {
  WECOM_CONNECTOR_ARTIFACT_NAMESPACE,
  WECOM_CONNECTOR_ICON,
  WECOM_CONNECTOR_INSTALL_LEVEL,
  WeComConnectorPluginConfigFormSchema,
  WeComConnectorPluginConfigSchema
} from './lib/types.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: XpertPlugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: WECOM_CONNECTOR_INSTALL_LEVEL,
    artifactNamespace: WECOM_CONNECTOR_ARTIFACT_NAMESPACE,
    category: 'middleware',
    icon: {
      type: 'svg',
      value: WECOM_CONNECTOR_ICON
    },
    displayName: 'WeCom Connector',
    description:
      'Connects a workspace to the official WeCom AI Bot CLI and teaches the agent to use WeCom through sandbox_shell.',
    keywords: ['wecom', 'enterprise wechat', 'cli', 'connector', 'sandbox', 'skills'],
    author: 'XpertAI Team'
  },
  config: {
    schema: WeComConnectorPluginConfigSchema,
    formSchema: WeComConnectorPluginConfigFormSchema
  },
  register(ctx) {
    ctx.logger.log('register wecom connector plugin')
    return {
      module: WeComConnectorPluginModule,
      global: true
    }
  }
}

export default plugin
export { WeComConnectorPluginModule } from './lib/wecom-connector.module.js'
export { WeComCliBootstrapService } from './lib/wecom-cli-bootstrap.service.js'
export { WeComConnectorStrategy } from './lib/wecom-connector.strategy.js'
export { WeComConnectorRuntimeMiddleware } from './lib/wecom-connector-runtime.middleware.js'
