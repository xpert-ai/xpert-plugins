import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { GitHubConnectorPluginModule } from './lib/github-connector.module.js'
import { GITHUB_CONNECTOR_PLUGIN_CONTEXT } from './lib/tokens.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: XpertPlugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: 'organization',
    category: 'middleware',
    icon: {
      type: 'font',
      value: 'ri-github-fill'
    },
    displayName: 'GitHub Connector',
    description: 'Connects a workspace to GitHub with GitHub App OAuth or a personal access token.',
    keywords: ['github', 'connector', 'oauth', 'pat', 'middleware'],
    author: 'XpertAI Team'
  },
  config: {
    schema: z.object({}),
    formSchema: {
      type: 'object',
      properties: {}
    }
  },
  permissions: [{ type: 'integration', service: 'github', operations: ['read'] }],
  register(ctx) {
    ctx.logger.log('register github connector plugin')
    return {
      module: GitHubConnectorPluginModule,
      global: true,
      providers: [{ provide: GITHUB_CONNECTOR_PLUGIN_CONTEXT, useValue: ctx }]
    }
  }
}

export default plugin
export { GitHubConnectorPluginModule } from './lib/github-connector.module.js'
export { GitHubConnectorStrategy } from './lib/github-connector.strategy.js'
export { GitHubConnectorRuntimeMiddleware } from './lib/github-connector-runtime.middleware.js'
