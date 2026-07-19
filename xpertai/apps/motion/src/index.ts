import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  MOTION_AGENT_CAPABILITY,
  MOTION_ARTIFACT_NAMESPACE,
  MOTION_FEATURE,
  MOTION_ICON,
  MOTION_LIBRARY_CAPABILITY,
  MOTION_MIDDLEWARE_NAME,
  MOTION_PLUGIN_NAME,
  MOTION_PROVIDER_KEY,
  MOTION_TEMPLATE_CAPABILITY,
  MOTION_TEMPLATE_PROVIDER_KEY,
  MOTION_WORKBENCH_CAPABILITY,
  MOTION_WORKBENCH_VIEW_KEY
} from './lib/constants.js'
import { MotionPlugin } from './lib/motion.plugin.js'
import { motionTemplates } from './lib/motion.templates.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({})

const motionMarketplaceOperations = [
  {
    name: 'create-motion-projects',
    displayName: 'Create Motion projects',
    description: 'Create reviewable animated HTML and native HyperFrames launch-video Motion projects.',
    access: 'write' as const
  },
  {
    name: 'render-motion-video',
    displayName: 'Render Motion video',
    description: 'Queue native HyperFrames compositions on the isolated production video runtime.',
    access: 'write' as const
  },
  {
    name: 'save-motion-versions',
    displayName: 'Save Motion versions',
    description: 'Persist Motion working copies, recipes, styles, exports, and reviewable versions.',
    access: 'write' as const
  },
  {
    name: 'review-motion-workbench',
    displayName: 'Review Motion Workbench',
    description: 'Open the Motion Workbench to inspect, edit, version, and export Motion artifacts.',
    access: 'read' as const
  }
]

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    artifactNamespace: MOTION_ARTIFACT_NAMESPACE,
    level: 'system',
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [
          MOTION_FEATURE,
          MOTION_WORKBENCH_CAPABILITY,
          MOTION_AGENT_CAPABILITY,
          MOTION_LIBRARY_CAPABILITY,
          MOTION_TEMPLATE_CAPABILITY
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'motion',
              displayName: 'Motion',
              description:
                'Use Motion Assistant to generate animated HTML and native HyperFrames launch videos with production rendering.',
              icon: {
                type: 'svg',
                value: MOTION_ICON,
                color: '#2563eb'
              },
              operations: motionMarketplaceOperations
            },
            {
              type: 'view',
              name: MOTION_WORKBENCH_VIEW_KEY,
              displayName: 'Motion Workbench',
              description: 'Workbench for recipes, animated HTML, HyperFrames SDK + Player composition, legacy compatibility, versions, and production exports.',
              metadata: {
                app: 'motion'
              }
            },
            {
              type: 'middleware',
              name: MOTION_MIDDLEWARE_NAME,
              displayName: 'Motion Agent Tools',
              description:
                'Assistant tools for recipes, HTML and HyperFrames persistence, production rendering, versioning, export, and recovery.',
              metadata: {
                app: 'motion'
              }
            },
            {
              type: 'assistant-template',
              name: 'motion-assistant',
              displayName: 'Motion Assistant Template',
              description: 'Prebuilt assistant template for animated HTML and launch-video Motion workflows.',
              metadata: {
                app: 'motion'
              }
            }
          ]
        },
        runtime: {
          middlewareProviders: [MOTION_MIDDLEWARE_NAME],
          viewProviders: [MOTION_PROVIDER_KEY],
          templateProviders: [MOTION_TEMPLATE_PROVIDER_KEY]
        }
      },
      xpert: {
        types: ['assistant-template', 'skill', 'app', 'xpertai-bundle'],
        capabilities: [
          MOTION_FEATURE,
          MOTION_WORKBENCH_CAPABILITY,
          MOTION_AGENT_CAPABILITY,
          MOTION_LIBRARY_CAPABILITY,
          MOTION_TEMPLATE_CAPABILITY
        ],
        marketplace: {
          contents: [
            {
              type: 'skill',
              name: 'motion-agent-skill',
              displayName: 'Motion Agent Skill',
              description:
                'Skill for Motion Anything-derived recipes, animated HTML, native HyperFrames composition, legacy compatibility, and production exports.',
              tags: ['skill', 'motion', 'animation', 'agent-motion', 'middleware-tools']
            },
            {
              type: 'assistant-template',
              name: 'motion-assistant',
              displayName: 'Motion Assistant',
              description: 'Assistant template for Motion visual workflows.',
              metadata: {
                app: 'motion'
              }
            },
            {
              type: 'app',
              name: 'motion',
              displayName: 'Motion',
              description: 'Use Motion Assistant with Workbench and Agent tools for animated HTML and HyperFrames launch videos.',
              operations: motionMarketplaceOperations
            },
            {
              type: 'view',
              name: MOTION_WORKBENCH_VIEW_KEY,
              displayName: 'Motion Workbench',
              description: 'Workbench view for Motion projects, recipe selection, editing, versions, and exports.',
              metadata: {
                app: 'motion'
              }
            },
            {
              type: 'middleware',
              name: MOTION_MIDDLEWARE_NAME,
              displayName: 'Motion Agent Tools',
              description:
                'Assistant middleware tools for recipe search, artifact persistence, versioning, export, and recovery.',
              metadata: {
                app: 'motion'
              }
            }
          ]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: MOTION_ICON,
      color: '#2563eb'
    },
    displayName: 'Motion',
    description: 'Motion Agentic App with Motion Anything-derived workflows, HyperFrames composition, Player preview, and Producer rendering.',
    keywords: ['motion', 'animation', 'video', 'html', 'hyperframes', 'producer', 'recipe-library', 'middleware', 'view-extension', 'assistant-template'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  templates: motionTemplates,
  register(ctx) {
    ctx.logger.log('register motion plugin')
    return { module: MotionPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('motion plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('motion plugin stopped')
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/motion.plugin.js'
export * from './lib/motion.service.js'
export * from './lib/motion-render.processor.js'
export * from './lib/motion.middleware.js'
export * from './lib/motion-view.provider.js'
export * from './lib/motion.templates.js'
export * from './lib/recipe-library.js'
export * from './lib/html-motion.js'
export * from './lib/video-composition.js'
export * from './lib/hyperframes-composition.js'
