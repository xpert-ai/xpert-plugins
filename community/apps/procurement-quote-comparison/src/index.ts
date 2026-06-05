import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { ProcurementQuoteComparisonPlugin } from './lib/procurement-quote-comparison.plugin.js'
import {
  PROCUREMENT_ICON,
  PROCUREMENT_QUOTE_COMPARISON_FEATURE,
  PROCUREMENT_QUOTE_COMPARISON_MIDDLEWARE_NAME,
  PROCUREMENT_QUOTE_COMPARISON_PLUGIN_NAME,
  PROCUREMENT_QUOTE_COMPARISON_PROVIDER_KEY,
  PROCUREMENT_QUOTE_COMPARISON_VIEW_KEY
} from './lib/constants.js'

const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: PROCUREMENT_QUOTE_COMPARISON_PLUGIN_NAME,
    version: '0.0.1',
    level: 'system',
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [
          PROCUREMENT_QUOTE_COMPARISON_FEATURE,
          'procurement-quote-comparison-workbench',
          'procurement-document-parsing'
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'procurement-quote-comparison',
              displayName: 'Procurement Quote Comparison',
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
              name: PROCUREMENT_QUOTE_COMPARISON_VIEW_KEY,
              displayName: 'Procurement Quote Comparison Workbench',
              description: 'Workbench view for procurement cases, supplier quotes, risks, and recommendations.'
            },
            {
              type: 'tool',
              name: PROCUREMENT_QUOTE_COMPARISON_MIDDLEWARE_NAME,
              displayName: 'Procurement Quote Comparison Tools',
              description:
                'Assistant middleware tools for saving requirement parsing, supplier quotes, item matches, risks, and recommendations.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [PROCUREMENT_QUOTE_COMPARISON_MIDDLEWARE_NAME],
          viewProviders: [PROCUREMENT_QUOTE_COMPARISON_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: PROCUREMENT_ICON,
      color: '#0f766e'
    },
    displayName: 'Procurement Quote Comparison',
    description:
      'Create procurement comparison cases, parse requirements and supplier quotes with an Xpert, and expose a project workbench view.',
    keywords: ['procurement', 'quote-comparison', 'middleware', 'view-extension', 'remote-component'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  register(ctx) {
    ctx.logger.log('register procurement quote comparison plugin')
    return { module: ProcurementQuoteComparisonPlugin, global: true }
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
export * from './lib/procurement-quote-comparison.plugin.js'
export * from './lib/procurement-quote-comparison.service.js'
export * from './lib/procurement-quote-comparison.middleware.js'
export * from './lib/procurement-quote-comparison-view.provider.js'
