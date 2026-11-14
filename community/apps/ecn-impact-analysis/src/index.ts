import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod/v3'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { EcnImpactPlugin } from './lib/ecn-impact.plugin'
import {
  ECN_IMPACT_FEATURE,
  ECN_IMPACT_ICON,
  ECN_IMPACT_INSTALL_LEVEL,
  ECN_IMPACT_MIDDLEWARE_NAME,
  ECN_IMPACT_PLUGIN_NAME,
  ECN_IMPACT_PROVIDER_KEY,
  ECN_IMPACT_TEMPLATE_KEY,
  ECN_IMPACT_TEMPLATE_PROVIDER_KEY,
  ECN_IMPACT_WORKBENCH_VIEW_KEY
} from './lib/constants'
import { ecnImpactTemplates } from './lib/ecn-impact.templates'

const moduleDir = __dirname

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z
  .object({
    failureSimulation: z.boolean().optional()
  })
  .strict()

type PluginConfig = z.infer<typeof ConfigSchema>

const plugin: XpertPlugin<PluginConfig> = {
  meta: {
    name: packageJson.name || ECN_IMPACT_PLUGIN_NAME,
    version: packageJson.version,
    level: ECN_IMPACT_INSTALL_LEVEL,
    artifactNamespace: 'ecn_impact',
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [
          ECN_IMPACT_FEATURE,
          'ecn-impact-review-desk',
          'ecn-impact-assistant-template'
        ],
        runtime: {
          middlewareProviders: [ECN_IMPACT_MIDDLEWARE_NAME],
          viewProviders: [ECN_IMPACT_PROVIDER_KEY],
          templateProviders: [ECN_IMPACT_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: ECN_IMPACT_ICON,
      color: '#1d4ed8'
    },
    displayName: 'ECN Impact Analysis',
    description:
      'AI-assisted engineering change (ECN) impact analysis with a governed human review desk across mock PLM/MES/ERP evidence.',
    keywords: ['engineering-change', 'ecn', 'plm', 'impact-analysis', 'view-extension', 'remote-component', 'agent-tool', 'assistant-template'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema,
    defaults: {
      failureSimulation: false
    }
  },
  templates: ecnImpactTemplates,
  register(ctx) {
    ctx.logger.log('register ecn-impact-analysis plugin')
    return { module: EcnImpactPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('ecn-impact-analysis plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('ecn-impact-analysis plugin stopped')
  }
}

export default plugin
