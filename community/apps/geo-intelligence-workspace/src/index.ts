import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { GEO_FEATURE, GEO_ICON, GEO_MIDDLEWARE, GEO_PROVIDER } from './lib/constants'
import { GeoPlugin } from './lib/geo.plugin'

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({ enabled: z.boolean() })

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: 'organization',
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [GEO_FEATURE, 'geo-monitor', 'geo-evidence-review'],
        marketplace: {
          contents: [
            {
              type: 'app', name: 'geo-intelligence-workspace', displayName: 'GEO Intelligence Workspace',
              description: 'Monitor DeepSeek answers and review evidence-grounded hospital content recommendations.',
              icon: { type: 'svg', value: GEO_ICON, color: '#2563eb' },
              operations: [
                { name: 'monitor-prompts', displayName: 'Monitor prompts', description: 'Run monitored DeepSeek questions.', access: 'write' },
                { name: 'review-results', displayName: 'Review results', description: 'Inspect saved answers and evidence.', access: 'read' }
              ]
            },
            { type: 'view', name: 'workbench', displayName: 'GEO Workbench', description: 'Prompts, monitoring results and content review.' },
            { type: 'tool', name: GEO_MIDDLEWARE, displayName: 'GEO Tools', description: 'Assistant tools for monitored prompts and saved results.' }
          ]
        },
        runtime: { middlewareProviders: [GEO_MIDDLEWARE], viewProviders: [GEO_PROVIDER] }
      }
    },
    category: 'middleware',
    icon: { type: 'svg', value: GEO_ICON, color: '#2563eb' },
    displayName: 'GEO Intelligence Workspace',
    description: 'DeepSeek answer monitoring and governed GEO content review for a simulated hospital.',
    keywords: ['geo', 'monitoring', 'hospital', 'rag', 'workbench', 'langgraph'],
    author: 'Community'
  },
  config: {
    schema: ConfigSchema,
    defaults: { enabled: true }
  },
  register(ctx) {
    ctx.logger.log('register geo-intelligence-workspace plugin')
    return { module: GeoPlugin, global: true }
  }
}

export default plugin
