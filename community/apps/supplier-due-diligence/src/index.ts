import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { SupplierDueDiligencePlugin } from './lib/supplier-due-diligence.plugin.js'
import {
  PROCUREMENT_ICON,
  SUPPLIER_DUE_DILIGENCE_FEATURE,
  SUPPLIER_DUE_DILIGENCE_MIDDLEWARE_NAME,
  SUPPLIER_DUE_DILIGENCE_PROVIDER_KEY,
  SUPPLIER_DUE_DILIGENCE_TEMPLATE_PROVIDER_KEY,
  SUPPLIER_DUE_DILIGENCE_VIEW_KEY
} from './lib/constants.js'
import { procurementQuoteComparisonTemplates } from './lib/supplier-due-diligence.templates.js'

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
          SUPPLIER_DUE_DILIGENCE_FEATURE,
          'supplier-due-diligence-workbench',
          'procurement-document-parsing',
          'supplier-due-diligence-assistant-template'
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'supplier-due-diligence',
              displayName: 'Supplier Due Diligence',
              description:
                'Create procurement comparison cases, parse requirement and supplier quote documents, and review AI comparison recommendations.',
              icon: {
                type: 'svg',
                value: PROCUREMENT_ICON,
                color: '#0f766e'
              },
              operations: [
                {
                  name: 'create-procurement-cases',
                  displayName: 'Create procurement cases',
                  description: 'Create procurement cases from requirement documents and uploaded quote files.',
                  access: 'write'
                },
                {
                  name: 'parse-procurement-documents',
                  displayName: 'Parse procurement documents',
                  description: 'Use assistant tools to save structured requirement and supplier quote results.',
                  access: 'write'
                },
                {
                  name: 'review-procurement-recommendations',
                  displayName: 'Review procurement recommendations',
                  description: 'Review item matches, risks, and AI-generated supplier recommendations.',
                  access: 'read'
                }
              ]
            },
            {
              type: 'view',
              name: SUPPLIER_DUE_DILIGENCE_VIEW_KEY,
              displayName: 'Supplier Due Diligence Workbench',
              description: 'Workbench view for procurement cases, supplier quotes, risks, and recommendations.'
            },
            {
              type: 'tool',
              name: SUPPLIER_DUE_DILIGENCE_MIDDLEWARE_NAME,
              displayName: 'Supplier Due Diligence Tools',
              description:
                'Assistant middleware tools for saving requirement parsing, supplier quotes, item matches, risks, and recommendations.'
            },
            {
              type: 'assistant-template',
              name: 'supplier-due-diligence-assistant',
              displayName: 'Supplier Due Diligence Assistant Template',
              description:
                'Prebuilt assistant workflow template for procurement requirement parsing, supplier quote comparison, risk review, and recommendation reporting.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [SUPPLIER_DUE_DILIGENCE_MIDDLEWARE_NAME],
          viewProviders: [SUPPLIER_DUE_DILIGENCE_PROVIDER_KEY],
          templateProviders: [SUPPLIER_DUE_DILIGENCE_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: PROCUREMENT_ICON,
      color: '#0f766e'
    },
    displayName: 'Supplier Due Diligence',
    description:
      'Create procurement comparison cases, parse requirements and supplier quotes with an Xpert, and expose a project workbench view.',
    keywords: ['procurement', 'quote-comparison', 'middleware', 'view-extension', 'remote-component', 'assistant-template'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  templates: procurementQuoteComparisonTemplates,
  register(ctx) {
    ctx.logger.log('register procurement quote comparison plugin')
    return { module: SupplierDueDiligencePlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('procurement quote comparison plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('procurement quote comparison plugin stopped')
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/supplier-due-diligence.plugin.js'
export * from './lib/supplier-due-diligence.service.js'
export * from './lib/supplier-due-diligence.middleware.js'
export * from './lib/supplier-due-diligence-view.provider.js'
export * from './lib/supplier-due-diligence.templates.js'
