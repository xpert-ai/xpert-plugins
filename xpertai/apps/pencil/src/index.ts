import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  PENCIL_AGENT_CAPABILITY,
  PENCIL_FEATURE,
  PENCIL_ICON,
  PENCIL_MIDDLEWARE_NAME,
  PENCIL_PLUGIN_NAME,
  PENCIL_PROVIDER_KEY,
  PENCIL_TEMPLATE_CAPABILITY,
  PENCIL_TEMPLATE_PROVIDER_KEY,
  PENCIL_WORKBENCH_CAPABILITY,
  PENCIL_WORKBENCH_VIEW_KEY
} from './lib/constants.js'
import { PencilPlugin } from './lib/pencil.plugin.js'
import { pencilTemplates } from './lib/pencil.templates.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({})

// Marketplace operations describe reviewable user capabilities, not raw middleware tool names.
const pencilMarketplaceOperations = [
  {
    name: 'create-pencil-documents',
    displayName: 'Create Pencil documents',
    description: 'Create persistent Pencil design documents and graph working copies.',
    access: 'write' as const
  },
  {
    name: 'import-export-pencil-files',
    displayName: 'Import and export Pencil files',
    description: 'Import .fig/.pen files and export .fig, PNG, SVG, PDF, and JSX workspace files.',
    access: 'write' as const
  },
  {
    name: 'review-pencil-workbench',
    displayName: 'Review Pencil Workbench',
    description: 'Open the Pencil Workbench to inspect, edit, version, restore, and archive design documents.',
    access: 'read' as const
  }
]

/** Plugin contract shared by the data-xpert and xpert host applications. */
const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: 'system',
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [PENCIL_FEATURE, PENCIL_WORKBENCH_CAPABILITY, PENCIL_AGENT_CAPABILITY, PENCIL_TEMPLATE_CAPABILITY],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'pencil',
              displayName: 'Pencil',
              description: 'Use Pencil Assistant to create, import, inspect, edit, export, and version Agent-managed design documents.',
              icon: {
                type: 'svg',
                value: PENCIL_ICON,
                color: '#2563eb'
              },
              operations: pencilMarketplaceOperations
            },
            {
              type: 'view',
              name: PENCIL_WORKBENCH_VIEW_KEY,
              displayName: 'Pencil Workbench',
              description: 'Workbench view for Pencil graph editing, imports, exports, review status, versions, and logs.',
              metadata: {
                app: 'pencil'
              }
            },
            {
              type: 'middleware',
              name: PENCIL_MIDDLEWARE_NAME,
              displayName: 'Pencil Agent Tools',
              description:
                'Assistant middleware tools for creating Pencil documents, importing files, reading nodes, saving versions, exporting workspace files, and applying selected core tools.',
              metadata: {
                app: 'pencil'
              }
            },
            {
              type: 'assistant-template',
              name: 'pencil-assistant',
              displayName: 'Pencil Assistant Template',
              description: 'Prebuilt assistant template for Pencil Agentic App workflows.',
              metadata: {
                app: 'pencil'
              }
            }
          ]
        },
        runtime: {
          middlewareProviders: [PENCIL_MIDDLEWARE_NAME],
          viewProviders: [PENCIL_PROVIDER_KEY],
          templateProviders: [PENCIL_TEMPLATE_PROVIDER_KEY]
        }
      },
      xpert: {
        types: ['assistant-template', 'skill', 'app', 'xpertai-bundle'],
        capabilities: [PENCIL_FEATURE, PENCIL_WORKBENCH_CAPABILITY, PENCIL_AGENT_CAPABILITY, PENCIL_TEMPLATE_CAPABILITY],
        marketplace: {
          contents: [
            {
              type: 'skill',
              name: 'pencil-agent-skill',
              displayName: 'Pencil Agent Skill',
              description:
                'Skill for using Pencil Workbench context, middleware tools, graph snapshots, node edits, file import/export, versioning, and recovery.',
              tags: ['skill', 'pencil', 'figma', 'design', 'agentic-app', 'middleware-tools']
            },
            {
              type: 'assistant-template',
              name: 'pencil-assistant',
              displayName: 'Pencil Assistant',
              description: 'Assistant template for Pencil design workflows.',
              metadata: {
                app: 'pencil'
              }
            },
            {
              type: 'app',
              name: 'pencil',
              displayName: 'Pencil',
              description: 'Use Pencil Assistant with Workbench and Agent middleware tools for design documents.',
              operations: pencilMarketplaceOperations
            },
            {
              type: 'view',
              name: PENCIL_WORKBENCH_VIEW_KEY,
              displayName: 'Pencil Workbench',
              description: 'Workbench view for Pencil design documents, imports, exports, versions, and logs.',
              metadata: {
                app: 'pencil'
              }
            },
            {
              type: 'middleware',
              name: PENCIL_MIDDLEWARE_NAME,
              displayName: 'Pencil Agent Tools',
              description:
                'Assistant middleware tools for creating, importing, editing, exporting, searching, versioning, and recovering Pencil documents.',
              metadata: {
                app: 'pencil'
              }
            }
          ]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: PENCIL_ICON,
      color: '#2563eb'
    },
    displayName: 'Pencil',
    description: 'Agentic Pencil plugin for persistent design documents, selected core tools, Workbench review, file import/export, and versions.',
    keywords: ['pencil', 'figma', 'design', 'workbench', 'agentic-app', 'middleware', 'view-extension', 'assistant-template'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  templates: pencilTemplates,
  register(ctx) {
    ctx.logger.log('register pencil plugin')
    return { module: PencilPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('pencil plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('pencil plugin stopped')
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/pencil.plugin.js'
export * from './lib/pencil.service.js'
export * from './lib/pencil.middleware.js'
export * from './lib/pencil-view.provider.js'
export * from './lib/pencil.templates.js'
export * from './lib/pencil-graph.js'
