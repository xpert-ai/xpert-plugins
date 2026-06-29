import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  CANVAS_AGENT_CAPABILITY,
  CANVAS_FEATURE,
  CANVAS_ICON,
  CANVAS_MIDDLEWARE_NAME,
  CANVAS_PLUGIN_NAME,
  CANVAS_PROVIDER_KEY,
  CANVAS_TEMPLATE_CAPABILITY,
  CANVAS_TEMPLATE_PROVIDER_KEY,
  CANVAS_WORKBENCH_CAPABILITY,
  CANVAS_WORKBENCH_VIEW_KEY
} from './lib/constants.js'
import { CanvasPlugin } from './lib/canvas.plugin.js'
import { canvasTemplates } from './lib/canvas.templates.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({
  tldrawLicenseKey: z.string().optional()
})

const canvasMarketplaceOperations = [
  {
    name: 'create-canvas-documents',
    displayName: 'Create Canvas documents',
    description: 'Create reviewable infinite canvases and visual planning boards.',
    access: 'write' as const
  },
  {
    name: 'save-canvas-versions',
    displayName: 'Save Canvas versions',
    description: 'Persist tldraw snapshots, record patches, image insertions, and Workbench edits.',
    access: 'write' as const
  },
  {
    name: 'review-canvas-workbench',
    displayName: 'Review Canvas Workbench',
    description: 'Open the Canvas Workbench to inspect, annotate, import, export, and manually edit canvases.',
    access: 'read' as const
  }
]

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: 'system',
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [CANVAS_FEATURE, CANVAS_WORKBENCH_CAPABILITY, CANVAS_AGENT_CAPABILITY, CANVAS_TEMPLATE_CAPABILITY],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'canvas',
              displayName: 'Canvas',
              description: 'Use Canvas Assistant to create, review, annotate, import, export, and version Agent-managed tldraw canvases.',
              icon: {
                type: 'svg',
                value: CANVAS_ICON,
                color: '#0f766e'
              },
              operations: canvasMarketplaceOperations
            },
            {
              type: 'view',
              name: CANVAS_WORKBENCH_VIEW_KEY,
              displayName: 'Canvas Workbench',
              description: 'Workbench view for tldraw canvas editing, AI image holders, annotations, versions, and logs.',
              metadata: {
                app: 'canvas'
              }
            },
            {
              type: 'middleware',
              name: CANVAS_MIDDLEWARE_NAME,
              displayName: 'Canvas Agent Tools',
              description:
                'Assistant middleware tools for creating canvases, saving snapshots, patching records, inserting images, searching documents, and reporting failures.',
              metadata: {
                app: 'canvas'
              }
            },
            {
              type: 'assistant-template',
              name: 'canvas-assistant',
              displayName: 'Canvas Assistant Template',
              description: 'Prebuilt assistant template for Agent-managed canvas creation, image holder, and annotation workflows.',
              metadata: {
                app: 'canvas'
              }
            }
          ]
        },
        runtime: {
          middlewareProviders: [CANVAS_MIDDLEWARE_NAME],
          viewProviders: [CANVAS_PROVIDER_KEY],
          templateProviders: [CANVAS_TEMPLATE_PROVIDER_KEY]
        }
      },
      xpert: {
        types: ['assistant-template', 'skill', 'app', 'xpertai-bundle'],
        capabilities: [CANVAS_FEATURE, CANVAS_WORKBENCH_CAPABILITY, CANVAS_AGENT_CAPABILITY, CANVAS_TEMPLATE_CAPABILITY],
        marketplace: {
          contents: [
            {
              type: 'skill',
              name: 'canvas-agent-skill',
              displayName: 'Canvas Agent Skill',
              description:
                'Skill for using Canvas middleware tools, Workbench selection context, tldraw snapshot inspection, record patching, image insertion, versioning, and recovery.',
              tags: ['skill', 'canvas', 'tldraw', 'agent-canvas', 'middleware-tools']
            },
            {
              type: 'assistant-template',
              name: 'canvas-assistant',
              displayName: 'Canvas Assistant',
              description: 'Assistant template for Canvas visual workflows.',
              metadata: {
                app: 'canvas'
              }
            },
            {
              type: 'app',
              name: 'canvas',
              displayName: 'Canvas',
              description: 'Use Canvas Assistant with Workbench and Agent middleware tools for tldraw canvases.',
              operations: canvasMarketplaceOperations
            },
            {
              type: 'view',
              name: CANVAS_WORKBENCH_VIEW_KEY,
              displayName: 'Canvas Workbench',
              description: 'Workbench view for tldraw canvas editing, AI image holders, annotations, versions, and logs.',
              metadata: {
                app: 'canvas'
              }
            },
            {
              type: 'middleware',
              name: CANVAS_MIDDLEWARE_NAME,
              displayName: 'Canvas Agent Tools',
              description:
                'Assistant middleware tools for creating canvases, saving snapshots, patching records, inserting images, searching documents, and reporting failures.',
              metadata: {
                app: 'canvas'
              }
            }
          ]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: CANVAS_ICON,
      color: '#0f766e'
    },
    displayName: 'Canvas',
    description: 'Agentic Canvas plugin for tldraw whiteboards, AI image holders, annotation workflows, versioning, and review.',
    keywords: ['canvas', 'tldraw', 'whiteboard', 'image-generation', 'annotation', 'middleware', 'view-extension', 'assistant-template'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  templates: canvasTemplates,
  register(ctx) {
    ctx.logger.log('register canvas plugin')
    return { module: CanvasPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('canvas plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('canvas plugin stopped')
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/canvas.plugin.js'
export * from './lib/canvas.service.js'
export * from './lib/canvas.middleware.js'
export * from './lib/canvas-view.provider.js'
export * from './lib/canvas.templates.js'
export * from './lib/canvas-snapshot.validation.js'
