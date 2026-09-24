import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { InspectionPlugin } from './lib/inspection.plugin.js'
import {
  INSPECTION_AGENT_MIDDLEWARE_STRATEGY,
  INSPECTION_FEATURE,
  INSPECTION_ICON,
  INSPECTION_PROVIDER_KEY,
  INSPECTION_TEMPLATE_PROVIDER_KEY,
  INSPECTION_VIEW_KEY
} from './lib/constants.js'
import { inspectionTemplates } from './lib/inspection.templates.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: 'system',
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [
          INSPECTION_FEATURE,
          'inspection-assistant-workbench',
          'inspection-history-retrieval',
          'inspection-assistant-template'
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'inspection-assistant',
              displayName: 'Inspection & Fault Handling Assistant',
              description:
                'Create telecom site inspection cases from fault descriptions, let AI analyze severity and retrieve historical resolution plans, and confirm resolutions.',
              icon: {
                type: 'svg',
                value: INSPECTION_ICON,
                color: '#0e7490'
              },
              operations: [
                {
                  name: 'create-inspection-cases',
                  displayName: 'Create inspection cases',
                  description: 'Create inspection cases from fault descriptions with device type and severity.',
                  access: 'write'
                },
                {
                  name: 'analyze-faults-and-retrieve-history',
                  displayName: 'Analyze faults and retrieve history',
                  description: 'Use assistant tools to save AI fault analysis and retrieve historical resolution plans.',
                  access: 'write'
                },
                {
                  name: 'confirm-inspection-resolutions',
                  displayName: 'Confirm inspection resolutions',
                  description: 'Review AI recommendations, confirm handling resolutions, and sink them into the history library.',
                  access: 'read'
                }
              ]
            },
            {
              type: 'view',
              name: INSPECTION_VIEW_KEY,
              displayName: 'Inspection Workbench',
              description: 'Workbench view for inspection cases, AI analysis, history references, and resolutions.'
            },
            {
              type: 'tool',
              name: INSPECTION_AGENT_MIDDLEWARE_STRATEGY,
              displayName: 'Inspection Assistant Tools',
              description:
                'Assistant middleware tools for analyzing faults, searching history resolution records, and saving recommendations.'
            },
            {
              type: 'assistant-template',
              name: 'inspection-assistant',
              displayName: 'Inspection & Fault Handling Assistant Template',
              description:
                'Prebuilt assistant workflow template for fault analysis, history retrieval, and resolution recommendation.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [INSPECTION_AGENT_MIDDLEWARE_STRATEGY],
          viewProviders: [INSPECTION_PROVIDER_KEY],
          templateProviders: [INSPECTION_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: INSPECTION_ICON,
      color: '#0e7490'
    },
    displayName: 'Inspection & Fault Handling Assistant',
    description:
      'Create telecom inspection cases, analyze fault descriptions with an Xpert, retrieve historical resolution plans, and expose a workbench view.',
    keywords: ['inspection', 'fault-handling', 'telecom', 'middleware', 'view-extension', 'remote-component', 'assistant-template'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  templates: inspectionTemplates,
  register(ctx) {
    ctx.logger.log('register inspection assistant plugin')
    return { module: InspectionPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('inspection assistant plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('inspection assistant plugin stopped')
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/inspection.plugin.js'
export * from './lib/inspection.service.js'
export * from './lib/inspection.middleware.js'
export * from './lib/inspection-view.provider.js'
export * from './lib/inspection.templates.js'
