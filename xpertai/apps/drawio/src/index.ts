import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  DRAWIO_AGENT_DRAWING_CAPABILITY,
  DRAWIO_FEATURE,
  DRAWIO_ICON,
  DRAWIO_MIDDLEWARE_NAME,
  DRAWIO_PLUGIN_NAME,
  DRAWIO_PROVIDER_KEY,
  DRAWIO_TEMPLATE_CAPABILITY,
  DRAWIO_TEMPLATE_PROVIDER_KEY,
  DRAWIO_WORKBENCH_CAPABILITY,
  DRAWIO_WORKBENCH_VIEW_KEY
} from './lib/constants.js'
import { DrawioPlugin } from './lib/drawio.plugin.js'
import { drawioTemplates } from './lib/drawio.templates.js'

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
          DRAWIO_FEATURE,
          DRAWIO_WORKBENCH_CAPABILITY,
          DRAWIO_AGENT_DRAWING_CAPABILITY,
          DRAWIO_TEMPLATE_CAPABILITY
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'drawio',
              displayName: 'draw.io',
              description:
                'Create, update, version, review, import, export, and convert Agent-generated draw.io diagrams.',
              icon: {
                type: 'svg',
                value: DRAWIO_ICON,
                color: '#2563eb'
              },
              operations: [
                {
                  name: 'create-drawio-drawings',
                  displayName: 'Create draw.io diagrams',
                  description: 'Create reviewable diagrams from Agent-generated diagrams.net XML or Mermaid drafts.',
                  access: 'write'
                },
                {
                  name: 'save-drawio-versions',
                  displayName: 'Save diagram versions',
                  description: 'Persist XML scenes, metadata patches, and Mermaid conversions as versioned diagram records.',
                  access: 'write'
                },
                {
                  name: 'review-drawio-workbench',
                  displayName: 'Review draw.io workbench',
                  description: 'Open draw.io to inspect, manually edit, restore, import, and export diagrams.',
                  access: 'read'
                }
              ]
            },
            {
              type: 'view',
              name: DRAWIO_WORKBENCH_VIEW_KEY,
              displayName: 'draw.io Workbench',
              description: 'Workbench view for diagram lists, embedded draw.io editing, Mermaid import, and version history.'
            },
            {
              type: 'tool',
              name: DRAWIO_MIDDLEWARE_NAME,
              displayName: 'draw.io Agent Tools',
              description:
                'Assistant middleware tools for creating diagrams, saving XML versions, patching metadata, saving Mermaid drafts, searching diagrams, and reporting failures.'
            },
            {
              type: 'assistant-template',
              name: 'drawio-assistant',
              displayName: 'draw.io Drawing Assistant Template',
              description: 'Prebuilt assistant template for Agent-managed diagram creation and draw.io review workflows.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [DRAWIO_MIDDLEWARE_NAME],
          viewProviders: [DRAWIO_PROVIDER_KEY],
          templateProviders: [DRAWIO_TEMPLATE_PROVIDER_KEY]
        }
      },
      xpert: {
        types: ['assistant-template', 'skill', 'app', 'xpertai-bundle'],
        capabilities: [
          DRAWIO_FEATURE,
          DRAWIO_WORKBENCH_CAPABILITY,
          DRAWIO_AGENT_DRAWING_CAPABILITY,
          DRAWIO_TEMPLATE_CAPABILITY
        ],
        marketplace: {
          contents: [
            {
              type: 'skill',
              name: 'index',
              displayName: 'draw.io Agent Drawing',
              description:
                'Workflow skill for Agent-managed draw.io diagrams, Mermaid drafts, XML versions, and Workbench review.',
              tags: ['skill', 'drawio', 'agent-drawing']
            },
            {
              type: 'assistant-template',
              name: 'drawio-assistant',
              displayName: 'draw.io Drawing Assistant',
              description: 'Assistant template for draw.io diagram workflows.'
            },
            {
              type: 'app',
              name: 'drawio',
              displayName: 'draw.io',
              description: 'Workbench and Agent middleware tools for draw.io diagrams.'
            }
          ]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: DRAWIO_ICON,
      color: '#2563eb'
    },
    displayName: 'draw.io',
    description: 'Agentic draw.io plugin for structured diagram generation, XML versioning, review, and Mermaid import.',
    keywords: ['drawio', 'diagram', 'whiteboard', 'mermaid', 'middleware', 'view-extension', 'assistant-template'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  templates: drawioTemplates,
  register(ctx) {
    ctx.logger.log('register drawio plugin')
    return { module: DrawioPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('drawio plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('drawio plugin stopped')
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/drawio.plugin.js'
export * from './lib/drawio.service.js'
export * from './lib/drawio.middleware.js'
export * from './lib/drawio-view.provider.js'
export * from './lib/drawio.templates.js'
