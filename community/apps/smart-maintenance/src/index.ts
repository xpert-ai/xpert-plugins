import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod/v3'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  SmartMaintenancePluginConfigFormSchema,
  SmartMaintenancePluginConfigSchema,
  readSmartMaintenancePluginEnvDefaults
} from './lib/smart-maintenance.config'
import { SmartMaintenancePlugin } from './lib/smart-maintenance.plugin'
import {
  SMART_MAINTENANCE_FEATURE,
  SMART_MAINTENANCE_ICON,
  SMART_MAINTENANCE_MIDDLEWARE_NAME,
  SMART_MAINTENANCE_PROVIDER_KEY,
  SMART_MAINTENANCE_TEMPLATE_PROVIDER_KEY,
  SMART_MAINTENANCE_WORKBENCH_VIEW_KEY
} from './lib/constants'
import { smartMaintenanceTemplates } from './lib/smart-maintenance.templates'

const moduleDir = __dirname

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = SmartMaintenancePluginConfigSchema

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: 'organization',
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [
          SMART_MAINTENANCE_FEATURE,
          'maintenance-report-entry',
          'maintenance-review-desk',
          'smart-maintenance-assistant-template'
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'smart-maintenance',
              displayName: 'Smart Maintenance',
              description:
                'Create AI-assisted maintenance work orders from repair reports, import service data, and review processing status.',
              icon: {
                type: 'svg',
                value: SMART_MAINTENANCE_ICON,
                color: '#0f766e'
              },
              operations: [
                {
                  name: 'create-maintenance-work-orders',
                  displayName: 'Create maintenance work orders',
                  description: 'Generate reviewable maintenance work orders from natural-language repair reports.',
                  access: 'write'
                },
                {
                  name: 'import-maintenance-service-data',
                  displayName: 'Import service data',
                  description: 'Import candidate customers, projects, locations, devices, departments, roles and parts.',
                  access: 'write'
                },
                {
                  name: 'review-maintenance-work-orders',
                  displayName: 'Review maintenance work orders',
                  description: 'Review, supplement, confirm processing, close or reject smart maintenance work orders.',
                  access: 'read'
                }
              ]
            },
            {
              type: 'view',
              name: SMART_MAINTENANCE_WORKBENCH_VIEW_KEY,
              displayName: 'Smart Maintenance Workbench',
              description: 'Workbench view for maintenance data import, report intake, work order review and processing status.'
            },
            {
              type: 'tool',
              name: SMART_MAINTENANCE_MIDDLEWARE_NAME,
              displayName: 'Smart Maintenance Tools',
              description:
                'Assistant middleware tools for saving generated work orders, importing service data, searching work orders and preparing supplement drafts.'
            },
            {
              type: 'assistant-template',
              name: 'smart-maintenance-assistant',
              displayName: 'Smart Maintenance Assistant Template',
              description:
                'Prebuilt assistant workflow template for maintenance report intake, work order generation, service data import and review support.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [SMART_MAINTENANCE_MIDDLEWARE_NAME],
          viewProviders: [SMART_MAINTENANCE_PROVIDER_KEY],
          templateProviders: [SMART_MAINTENANCE_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: SMART_MAINTENANCE_ICON,
      color: '#0f766e'
    },
    displayName: 'Smart Maintenance',
    description: 'Create and review AI-generated maintenance work orders from natural-language repair reports.',
    keywords: ['maintenance', 'work-order', 'view-extension', 'remote-component', 'agent-tool', 'assistant-template'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema,
    formSchema: SmartMaintenancePluginConfigFormSchema,
    defaults: readSmartMaintenancePluginEnvDefaults()
  },
  templates: smartMaintenanceTemplates,
  register(ctx) {
    ctx.logger.log('register smart-maintenance plugin')
    return { module: SmartMaintenancePlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('smart-maintenance plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('smart-maintenance plugin stopped')
  }
}

export default plugin
