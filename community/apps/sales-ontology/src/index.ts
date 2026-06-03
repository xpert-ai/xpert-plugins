import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  SalesOntologyPluginConfigFormSchema,
  SalesOntologyPluginConfigSchema,
  readSalesOntologyPluginEnvDefaults
} from './lib/sales-ontology.config.js'
import {
  SALES_ONTOLOGY_ACTION_GOVERNANCE_MIDDLEWARE_NAME,
  SALES_ONTOLOGY_CONTEXT_MIDDLEWARE_NAME,
  SALES_ONTOLOGY_DECISION_MIDDLEWARE_NAME,
  SALES_ONTOLOGY_FEATURE,
  SALES_ONTOLOGY_ICON,
  SALES_ONTOLOGY_MIDDLEWARE_NAME,
  SALES_ONTOLOGY_PLUGIN_NAME,
  SALES_ONTOLOGY_PROVIDER_KEY,
  SALES_ONTOLOGY_SCENARIO_LEARNING_MIDDLEWARE_NAME,
  SALES_ONTOLOGY_TEMPLATE_PROVIDER_KEY,
  SALES_ONTOLOGY_VIEW_KEY
} from './lib/constants.js'
import { SalesOntologyPlugin } from './lib/sales-ontology.plugin.js'
import { salesOntologyTemplates } from './lib/sales-ontology.templates.js'

const ConfigSchema = SalesOntologyPluginConfigSchema

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: SALES_ONTOLOGY_PLUGIN_NAME,
    version: '0.0.1',
    level: 'system',
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app', 'business-ontology'],
        capabilities: [
          SALES_ONTOLOGY_FEATURE,
          'sales-ontology-business-ontology',
          'sales-ontology-decision-workbench',
          'sales-ontology-business-assistant-template'
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'sales-ontology',
              displayName: 'Sales Ontology Decision App',
              description:
                'Business decision loop for sales perception, reasoning, suggestions, and governed actions on data-xpert ontology.',
              icon: {
                type: 'svg',
                value: SALES_ONTOLOGY_ICON,
                color: '#0f766e'
              },
              operations: [
                {
                  name: 'read-sales-ontology-context',
                  displayName: 'Read Sales Ontology context',
                  description: 'Read customer, target, compliance, perception, and action-proposal context.',
                  access: 'read'
                },
                {
                  name: 'publish-sales-ontology-snapshot',
                  displayName: 'Publish ontology snapshots',
                  description: 'Publish Sales Ontology business objects, relations, insights, suggestions, and action facts.',
                  access: 'write'
                },
                {
                  name: 'govern-sales-ontology-actions',
                  displayName: 'Govern action proposals',
                  description: 'Approve, reject, execute, and record governed Sales Ontology action proposals.',
                  access: 'admin'
                }
              ]
            },
            {
              type: 'view',
              name: SALES_ONTOLOGY_VIEW_KEY,
              displayName: 'Sales Ontology Decision Workbench',
              description: 'Workbench view for perceptions, suggestions, and governed action proposals.'
            },
            {
              type: 'tool',
              name: SALES_ONTOLOGY_MIDDLEWARE_NAME,
              displayName: 'Sales Ontology Core Decision Tools',
              description:
                'Compact default assistant middleware tools for Sales Ontology context reading, perception, reasoning, suggestions, governed proposals, scenario simulation, and outcome recording.'
            },
            {
              type: 'tool',
              name: SALES_ONTOLOGY_CONTEXT_MIDDLEWARE_NAME,
              displayName: 'Sales Ontology Context Tools',
              description:
                'Specialized assistant middleware tools for Sales Ontology ontology publishing, domain schema lookup, customer context, compliance risk, and sales target status.'
            },
            {
              type: 'tool',
              name: SALES_ONTOLOGY_DECISION_MIDDLEWARE_NAME,
              displayName: 'Sales Ontology Decision Intelligence',
              description:
                'Specialized assistant middleware tools for Sales Ontology perception, reasoning, insight generation, and next-best-action suggestions.'
            },
            {
              type: 'tool',
              name: SALES_ONTOLOGY_ACTION_GOVERNANCE_MIDDLEWARE_NAME,
              displayName: 'Sales Ontology Action Governance',
              description:
                'Specialized assistant middleware tools for governed action proposals, execution, notifications, reminders, and action result recording.'
            },
            {
              type: 'tool',
              name: SALES_ONTOLOGY_SCENARIO_LEARNING_MIDDLEWARE_NAME,
              displayName: 'Sales Ontology Scenario & Learning',
              description:
                'Specialized assistant middleware tools for scenario simulation, decision effects, memory recording, and learning summaries.'
            },
            {
              type: 'assistant-template',
              name: 'sales-ontology-business-assistant',
              displayName: 'Sales Ontology Business Assistant Template',
              description: 'Prebuilt assistant workflow template for Sales Ontology business decision loops.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [
            SALES_ONTOLOGY_MIDDLEWARE_NAME,
            SALES_ONTOLOGY_CONTEXT_MIDDLEWARE_NAME,
            SALES_ONTOLOGY_DECISION_MIDDLEWARE_NAME,
            SALES_ONTOLOGY_ACTION_GOVERNANCE_MIDDLEWARE_NAME,
            SALES_ONTOLOGY_SCENARIO_LEARNING_MIDDLEWARE_NAME
          ],
          viewProviders: [SALES_ONTOLOGY_PROVIDER_KEY],
          templateProviders: [SALES_ONTOLOGY_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: SALES_ONTOLOGY_ICON,
      color: '#0f766e'
    },
    displayName: 'Sales Ontology',
    description:
      'Sales Ontology business decision plugin for data-xpert ontology, Assistant tools, and Workbench action governance.',
    keywords: ['sales-ontology', 'middleware', 'view-extension', 'business-ontology', 'decision-loop'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema,
    formSchema: SalesOntologyPluginConfigFormSchema,
    defaults: readSalesOntologyPluginEnvDefaults()
  },
  templates: salesOntologyTemplates,
  register(ctx) {
    ctx.logger.log('register sales-ontology plugin')
    return { module: SalesOntologyPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('sales-ontology plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('sales-ontology plugin stopped')
  }
}

export default plugin
