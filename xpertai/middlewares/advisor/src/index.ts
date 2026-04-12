import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { AdvisorPluginModule } from './lib/advisor.module.js'
import { ADVISOR_PLUGIN_CONTEXT } from './lib/tokens.js'
import {
  AdvisorPluginConfigFormSchema,
  AdvisorPluginConfigSchema,
  AdvisorPluginIcon,
} from './lib/advisor.types.js'

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
      type: 'svg',
      value: AdvisorPluginIcon
    },
    displayName: 'Advisor Middleware',
    description:
      'Adds a configurable `advisor` tool that lets the executor consult a secondary model for hard debugging, tradeoffs, and planning decisions.',
    keywords: ['advisor', 'middleware', 'agent', 'reasoning', 'model'],
    author: 'XpertAI Team'
  },
  config: {
    schema: AdvisorPluginConfigSchema,
    formSchema: AdvisorPluginConfigFormSchema
  },
  register(ctx) {
    ctx.logger.log('register advisor middleware plugin')
    return {
      module: AdvisorPluginModule,
      global: true,
      providers: [{ provide: ADVISOR_PLUGIN_CONTEXT, useValue: ctx }]
    }
  },
  async onStart(ctx) {
    ctx.logger.log('advisor middleware plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('advisor middleware plugin stopped')
  }
}

export * from './lib/advisor.middleware.js'
export * from './lib/advisor.module.js'
export * from './lib/tokens.js'
export * from './lib/advisor.types.js'
export default plugin
