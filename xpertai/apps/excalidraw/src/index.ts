import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  EXCALIDRAW_AGENT_DRAWING_CAPABILITY,
  EXCALIDRAW_FEATURE,
  EXCALIDRAW_ICON,
  EXCALIDRAW_MIDDLEWARE_NAME,
  EXCALIDRAW_PLUGIN_NAME,
  EXCALIDRAW_PROVIDER_KEY,
  EXCALIDRAW_TEMPLATE_CAPABILITY,
  EXCALIDRAW_TEMPLATE_PROVIDER_KEY,
  EXCALIDRAW_WORKBENCH_CAPABILITY,
  EXCALIDRAW_WORKBENCH_VIEW_KEY
} from './lib/constants.js'
import { ExcalidrawPlugin } from './lib/excalidraw.plugin.js'
import { excalidrawTemplates } from './lib/excalidraw.templates.js'

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
          EXCALIDRAW_FEATURE,
          EXCALIDRAW_WORKBENCH_CAPABILITY,
          EXCALIDRAW_AGENT_DRAWING_CAPABILITY,
          EXCALIDRAW_TEMPLATE_CAPABILITY
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'excalidraw',
              displayName: 'Excalidraw',
              description:
                'Create, update, version, review, import, export, and convert Agent-generated Excalidraw diagrams.',
              icon: {
                type: 'svg',
                value: EXCALIDRAW_ICON,
                color: '#2563eb'
              },
              operations: [
                {
                  name: 'create-excalidraw-drawings',
                  displayName: 'Create Excalidraw drawings',
                  description: 'Create reviewable diagrams from Agent-generated Excalidraw JSON or Mermaid drafts.',
                  access: 'write'
                },
                {
                  name: 'save-excalidraw-versions',
                  displayName: 'Save drawing versions',
                  description: 'Persist complete scenes, patches, and Mermaid conversions as versioned drawing records.',
                  access: 'write'
                },
                {
                  name: 'review-excalidraw-workbench',
                  displayName: 'Review drawing workbench',
                  description: 'Open Excalidraw to inspect, manually edit, restore, import, and export drawings.',
                  access: 'read'
                }
              ]
            },
            {
              type: 'view',
              name: EXCALIDRAW_WORKBENCH_VIEW_KEY,
              displayName: 'Excalidraw Workbench',
              description: 'Workbench view for drawing lists, Excalidraw editing, Mermaid conversion, and version history.'
            },
            {
              type: 'tool',
              name: EXCALIDRAW_MIDDLEWARE_NAME,
              displayName: 'Excalidraw Agent Tools',
              description:
                'Assistant middleware tools for creating drawings, saving scenes, patching elements, saving Mermaid drafts, searching drawings, and reporting failures.'
            },
            {
              type: 'assistant-template',
              name: 'excalidraw-assistant',
              displayName: 'Excalidraw Drawing Assistant Template',
              description: 'Prebuilt assistant template for Agent-managed diagram creation and Excalidraw review workflows.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [EXCALIDRAW_MIDDLEWARE_NAME],
          viewProviders: [EXCALIDRAW_PROVIDER_KEY],
          templateProviders: [EXCALIDRAW_TEMPLATE_PROVIDER_KEY]
        }
      },
      xpert: {
        types: ['assistant-template', 'skill', 'app', 'xpertai-bundle'],
        capabilities: [
          EXCALIDRAW_FEATURE,
          EXCALIDRAW_WORKBENCH_CAPABILITY,
          EXCALIDRAW_AGENT_DRAWING_CAPABILITY,
          EXCALIDRAW_TEMPLATE_CAPABILITY
        ],
        marketplace: {
          contents: [
            {
              type: 'skill',
              name: 'excalidraw-agent-skill',
              displayName: 'Excalidraw Agent Skill',
              description:
                'Skill for using Excalidraw middleware tools, Workbench selection context, scene inspection, patching, versioning, and recovery.',
              tags: ['skill', 'excalidraw', 'agent-drawing', 'middleware-tools']
            },
            {
              type: 'assistant-template',
              name: 'excalidraw-assistant',
              displayName: 'Excalidraw Drawing Assistant',
              description: 'Assistant template for Excalidraw drawing workflows.'
            },
            {
              type: 'app',
              name: 'excalidraw',
              displayName: 'Excalidraw',
              description: 'Workbench and Agent middleware tools for Excalidraw diagrams.'
            }
          ]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: EXCALIDRAW_ICON,
      color: '#2563eb'
    },
    displayName: 'Excalidraw',
    description: 'Agentic Excalidraw plugin for structured diagram generation, versioning, review, and Mermaid conversion.',
    keywords: ['excalidraw', 'diagram', 'whiteboard', 'mermaid', 'middleware', 'view-extension', 'assistant-template'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  templates: excalidrawTemplates,
  register(ctx) {
    ctx.logger.log('register excalidraw plugin')
    return { module: ExcalidrawPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('excalidraw plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('excalidraw plugin stopped')
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/excalidraw.plugin.js'
export * from './lib/excalidraw.service.js'
export * from './lib/excalidraw.middleware.js'
export * from './lib/excalidraw-view.provider.js'
export * from './lib/excalidraw.templates.js'
