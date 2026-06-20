import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  LUCIDCHART_AGENT_DRAWING_CAPABILITY,
  LUCIDCHART_FEATURE,
  LUCIDCHART_ICON,
  LUCIDCHART_MIDDLEWARE_NAME,
  LUCIDCHART_PLUGIN_NAME,
  LUCIDCHART_PROVIDER_KEY,
  LUCIDCHART_TEMPLATE_CAPABILITY,
  LUCIDCHART_TEMPLATE_PROVIDER_KEY,
  LUCIDCHART_WORKBENCH_CAPABILITY,
  LUCIDCHART_WORKBENCH_VIEW_KEY
} from './lib/constants.js'
import { LucidchartPlugin } from './lib/lucidchart.plugin.js'
import { lucidchartTemplates } from './lib/lucidchart.templates.js'

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
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [
          LUCIDCHART_FEATURE,
          LUCIDCHART_WORKBENCH_CAPABILITY,
          LUCIDCHART_AGENT_DRAWING_CAPABILITY,
          LUCIDCHART_TEMPLATE_CAPABILITY
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'lucidchart',
              displayName: 'Lucidchart',
              description:
                'Create, version, review, import, export, and register Agent-generated Lucidchart Standard Import drafts.',
              icon: {
                type: 'svg',
                value: LUCIDCHART_ICON,
                color: '#2563eb'
              },
              operations: [
                {
                  name: 'create-lucidchart-drawings',
                  displayName: 'Create Lucidchart documents',
                  description: 'Create reviewable documents from Agent-generated Lucid Standard Import JSON, Mermaid drafts, or external Lucid links.',
                  access: 'write'
                },
                {
                  name: 'save-lucidchart-versions',
                  displayName: 'Save document versions',
                  description: 'Persist Standard Import drafts, Mermaid sources, and Lucid document references as versioned records.',
                  access: 'write'
                },
                {
                  name: 'review-lucidchart-workbench',
                  displayName: 'Review Lucidchart workbench',
                  description: 'Open the Workbench to inspect, restore, import, export, and register Lucidchart documents.',
                  access: 'read'
                }
              ]
            },
            {
              type: 'view',
              name: LUCIDCHART_WORKBENCH_VIEW_KEY,
              displayName: 'Lucidchart Workbench',
              description: 'Workbench view for Standard Import drafts, Mermaid sources, Lucid embeds, and version history.'
            },
            {
              type: 'tool',
              name: LUCIDCHART_MIDDLEWARE_NAME,
              displayName: 'Lucidchart Agent Tools',
              description:
                'Assistant middleware tools for creating documents, saving Standard Import versions, saving Mermaid drafts, registering Lucid links, searching documents, and reporting failures.'
            },
            {
              type: 'assistant-template',
              name: 'lucidchart-assistant',
              displayName: 'Lucidchart Drawing Assistant Template',
              description: 'Prebuilt assistant template for Agent-managed Lucidchart draft creation and review workflows.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [LUCIDCHART_MIDDLEWARE_NAME],
          viewProviders: [LUCIDCHART_PROVIDER_KEY],
          templateProviders: [LUCIDCHART_TEMPLATE_PROVIDER_KEY]
        }
      },
      xpert: {
        types: ['assistant-template', 'skill', 'app', 'xpertai-bundle'],
        capabilities: [
          LUCIDCHART_FEATURE,
          LUCIDCHART_WORKBENCH_CAPABILITY,
          LUCIDCHART_AGENT_DRAWING_CAPABILITY,
          LUCIDCHART_TEMPLATE_CAPABILITY
        ],
        marketplace: {
          contents: [
            {
              type: 'skill',
              name: 'index',
              displayName: 'Lucidchart Agent Drawing',
              description:
                'Workflow skill for Agent-managed Lucidchart Standard Import drafts, Mermaid drafts, Lucid links, and Workbench review.',
              tags: ['skill', 'lucidchart', 'agent-drawing']
            },
            {
              type: 'assistant-template',
              name: 'lucidchart-assistant',
              displayName: 'Lucidchart Drawing Assistant',
              description: 'Assistant template for Lucidchart draft workflows.'
            },
            {
              type: 'app',
              name: 'lucidchart',
              displayName: 'Lucidchart',
              description: 'Workbench and Agent middleware tools for Lucidchart drafts.'
            }
          ]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: LUCIDCHART_ICON,
      color: '#2563eb'
    },
    displayName: 'Lucidchart',
    description: 'Agentic Lucidchart plugin for Standard Import draft generation, versioning, review, and Lucid document registration.',
    keywords: ['lucidchart', 'diagram', 'whiteboard', 'mermaid', 'middleware', 'view-extension', 'assistant-template'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  templates: lucidchartTemplates,
  register(ctx) {
    ctx.logger.log('register lucidchart plugin')
    return { module: LucidchartPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('lucidchart plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('lucidchart plugin stopped')
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/lucidchart.plugin.js'
export * from './lib/lucidchart.service.js'
export * from './lib/lucidchart.middleware.js'
export * from './lib/lucidchart-view.provider.js'
export * from './lib/lucidchart.templates.js'
