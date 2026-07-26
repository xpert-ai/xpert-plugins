import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  IMG2THREEJS_ARTIFACT_NAMESPACE,
  IMG2THREEJS_FEATURE,
  IMG2THREEJS_ICON,
  IMG2THREEJS_MIDDLEWARE_NAME,
  IMG2THREEJS_PLUGIN_NAME,
  IMG2THREEJS_PROVIDER_KEY,
  IMG2THREEJS_TEMPLATE_PROVIDER_KEY,
  IMG2THREEJS_VIEW_KEY
} from './lib/constants.js'
import {
  Img2ThreeJsConfigFormSchema,
  Img2ThreeJsConfigSchema,
  type Img2ThreeJsConfig
} from './lib/img2threejs.config.js'
import { Img2ThreeJsPlugin } from './lib/img2threejs.plugin.js'
import { img2ThreeJsTemplates } from './lib/img2threejs.templates.js'
import { IMG2THREEJS_PLUGIN_CONTEXT } from './lib/tokens.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const pluginMeta: XpertPlugin<Img2ThreeJsConfig>['meta'] & {
  artifactNamespace: typeof IMG2THREEJS_ARTIFACT_NAMESPACE
} = {
  name: packageJson.name || IMG2THREEJS_PLUGIN_NAME,
  version: packageJson.version,
  level: 'system',
  artifactNamespace: IMG2THREEJS_ARTIFACT_NAMESPACE,
  category: 'middleware',
  targetApps: ['data-xpert', 'xpert'],
  targetAppMeta: {
    'data-xpert': {
      types: ['business-app', 'workbench-view', 'assistant-tool'],
      capabilities: [
        IMG2THREEJS_FEATURE,
        'img2threejs.review-workbench',
        'img2threejs.typed-sculpt-spec',
        'img2threejs.managed-pipeline'
      ],
      marketplace: {
        contents: [
          {
            type: 'app',
            name: IMG2THREEJS_ARTIFACT_NAMESPACE,
            displayName: 'Image to Three.js',
            description: 'Turn admitted image evidence into quality-gated procedural Three.js TypeScript models.',
            icon: { type: 'svg', value: IMG2THREEJS_ICON, color: '#7c3aed' },
            operations: [
              {
                name: 'create-procedural-models',
                displayName: 'Create procedural models',
                description: 'Build versioned models through strict Sculpt Specs and ordered gates.',
                access: 'write'
              },
              {
                name: 'review-model-evidence',
                displayName: 'Review model evidence',
                description: 'Inspect deterministic and visual evidence and record human decisions.',
                access: 'write'
              }
            ]
          },
          {
            type: 'view',
            name: IMG2THREEJS_VIEW_KEY,
            displayName: 'Image to Three.js Review',
            description: 'Reference-versus-render evidence, pass timeline, approvals, and diagnostics.'
          },
          {
            type: 'tool',
            name: IMG2THREEJS_MIDDLEWARE_NAME,
            displayName: 'Image to Three.js Agent Tools',
            description: 'Ordered Agent middleware tools for image intake, Sculpt Specs, pipeline gates, reviews, and artifacts.'
          },
          {
            type: 'assistant-template',
            name: 'img2threejs-modeling-assistant',
            displayName: 'Image to Three.js Modeling Assistant',
            description: 'Prebuilt bounded-loop Assistant for procedural Three.js modeling.'
          }
        ]
      },
      runtime: {
        middlewareProviders: [IMG2THREEJS_MIDDLEWARE_NAME],
        viewProviders: [IMG2THREEJS_PROVIDER_KEY],
        templateProviders: [IMG2THREEJS_TEMPLATE_PROVIDER_KEY]
      }
    },
    xpert: {
      types: ['assistant-template', 'skill', 'app', 'xpertai-bundle'],
      capabilities: [
        IMG2THREEJS_FEATURE,
        'img2threejs.review-workbench'
      ],
      marketplace: {
        contents: [
          {
            type: 'skill',
            name: 'img2threejs-semantic-modeling',
            displayName: 'Image to Three.js Semantic Modeling',
            description: 'Skill for multimodal evidence analysis, Sculpt Specs, ordered model stages, quality review, and artifact handling.'
          },
          {
            type: 'assistant-template',
            name: 'img2threejs-modeling-assistant',
            displayName: 'Image to Three.js Modeling Assistant',
            description: 'Assistant template with the semantic modeling Skill and middleware tools.'
          }
        ]
      }
    }
  },
  icon: { type: 'svg', value: IMG2THREEJS_ICON, color: '#7c3aed' },
  displayName: 'Image to Three.js',
  description: 'Production Agentic App for quality-gated procedural Three.js TypeScript model generation.',
  keywords: ['threejs', 'typescript', 'procedural-modeling', 'images', '3d', 'agentic-app'],
  author: 'XpertAI Team'
}

const plugin: XpertPlugin<Img2ThreeJsConfig> = {
  meta: pluginMeta,
  config: {
    schema: Img2ThreeJsConfigSchema,
    formSchema: Img2ThreeJsConfigFormSchema,
    defaults: {
      debug: false,
      maximumImageBytes: 25_000_000,
      queueAttempts: 3,
      queueBackoffMs: 5000
    }
  },
  templates: img2ThreeJsTemplates,
  register(ctx) {
    return {
      module: Img2ThreeJsPlugin,
      global: true,
      providers: [{ provide: IMG2THREEJS_PLUGIN_CONTEXT, useValue: ctx }],
      exports: []
    }
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/domain/pipeline.js'
export * from './lib/domain/sculpt-spec.schema.js'
export * from './lib/domain/threejs-generator.js'
export * from './lib/domain/types.js'
export * from './lib/entities/index.js'
export * from './lib/img2threejs.service.js'
