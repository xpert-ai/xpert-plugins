import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { ListingAssistantServerPlugin } from './lib/listing-assistant.plugin.js'
import { listingAssistantTemplates } from './lib/listing-assistant.templates.js'
import {
  LISTING_ASSISTANT_FEATURE,
  LISTING_ASSISTANT_MIDDLEWARE_NAME,
  LISTING_ASSISTANT_PROVIDER_KEY,
  LISTING_ASSISTANT_TEMPLATE_KEY,
  LISTING_ASSISTANT_TEMPLATE_PROVIDER_KEY,
  LISTING_ASSISTANT_VIEW_KEY,
  LISTING_ICON
} from './lib/constants.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
  xpert?: {
    plugin?: {
      level?: 'system' | 'tenant' | 'organization'
      artifactNamespace?: string
    }
  }
}

const pluginMetadata = packageJson.xpert?.plugin
if (!pluginMetadata?.level || !pluginMetadata.artifactNamespace) {
  throw new Error('package.json must declare xpert.plugin.level and xpert.plugin.artifactNamespace')
}

const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: pluginMetadata.level,
    artifactNamespace: pluginMetadata.artifactNamespace,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [
          LISTING_ASSISTANT_FEATURE,
          `${LISTING_ASSISTANT_FEATURE}-workbench`,
          'listing-extraction',
          'listing-assistant-template'
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'listing-assistant',
              displayName: 'Bulk Listing Assistant',
              description:
                'Turn supplier copy into structured, human-reviewed listing drafts with missing-field highlighting and idempotent retry.',
              icon: {
                type: 'svg',
                value: LISTING_ICON,
                color: '#2563eb'
              },
              operations: [
                {
                  name: 'create-listing-tasks',
                  displayName: 'Create listing tasks',
                  description: 'Paste supplier copy and create a listing task awaiting AI extraction.',
                  access: 'write'
                },
                {
                  name: 'extract-listing-fields',
                  displayName: 'Extract listing fields',
                  description: 'Run AI extraction to draft title, description, price, attributes, and specs.',
                  access: 'write'
                },
                {
                  name: 'save-listing-drafts',
                  displayName: 'Save listing drafts',
                  description: 'Save the human-confirmed listing draft after review.',
                  access: 'write'
                }
              ]
            },
            {
              type: 'view',
              name: LISTING_ASSISTANT_VIEW_KEY,
              displayName: 'Bulk Listing Workbench',
              description: 'Workbench view for listing tasks, source copy, structured drafts, and retry state.'
            },
            {
              type: 'tool',
              name: LISTING_ASSISTANT_MIDDLEWARE_NAME,
              displayName: 'Listing Assistant Tools',
              description: 'Assistant middleware tools for creating, parsing, reading, and saving listing tasks.'
            },
            {
              type: 'assistant-template',
              name: LISTING_ASSISTANT_TEMPLATE_KEY,
              displayName: 'Bulk Listing Assistant Template',
              description: 'Prebuilt assistant workflow template for supplier copy extraction and draft review.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [LISTING_ASSISTANT_MIDDLEWARE_NAME],
          viewProviders: [LISTING_ASSISTANT_PROVIDER_KEY],
          templateProviders: [LISTING_ASSISTANT_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: LISTING_ICON,
      color: '#2563eb'
    },
    displayName: 'Bulk Listing Assistant',
    description:
      'Extract structured listing fields from supplier copy, let operators review them in a workbench, and save drafts with idempotent retry.',
    keywords: ['listing', 'commerce', 'extraction', 'workbench-view', 'assistant-tool', 'assistant-template'],
    author: 'XpertAI Community'
  },
  config: {
    schema: ConfigSchema
  },
  templates: listingAssistantTemplates,
  register(ctx) {
    ctx.logger.log('register listing assistant plugin')
    return { module: ListingAssistantServerPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('listing assistant plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('listing assistant plugin stopped')
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/listing-assistant.plugin.js'
export * from './lib/listing-ai.service.js'
export * from './lib/listing-assistant.service.js'
export * from './lib/listing-assistant.middleware.js'
export * from './lib/listing-assistant-view.provider.js'
export * from './lib/listing-assistant.templates.js'
