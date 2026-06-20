import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod/v3'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { CrmPluginConfigFormSchema, CrmPluginConfigSchema, readCrmPluginEnvDefaults } from './lib/crm.config'
import {
  CRM_FEATURE,
  CRM_ICON,
  CRM_MIDDLEWARE_NAME,
  CRM_PLUGIN_NAME,
  CRM_PROVIDER_KEY,
  CRM_TEMPLATE_PROVIDER_KEY,
  CRM_WORKBENCH_VIEW_KEY
} from './lib/constants'
import { CrmPlugin } from './lib/crm.plugin'
import { crmTemplates } from './lib/crm.templates'

const moduleDir = __dirname
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = CrmPluginConfigSchema

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name || CRM_PLUGIN_NAME,
    version: packageJson.version,
    level: 'organization',
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-app', 'workbench-view', 'assistant-tool'],
        capabilities: [CRM_FEATURE, 'crm-workbench', 'crm-agent-tools', 'crm-assistant-template'],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'crm',
              displayName: 'CRM',
              description:
                'Use an Xpert-native CRM workspace for companies, people, opportunities, tasks, notes, and Agent-assisted record operations.',
              icon: {
                type: 'svg',
                value: CRM_ICON,
                color: '#0f766e'
              },
              operations: [
                {
                  name: 'manage-crm-records',
                  displayName: 'Manage CRM records',
                  description: 'Create, search, update, and inspect CRM records in a metadata-driven workspace.',
                  access: 'write'
                },
                {
                  name: 'review-crm-workbench',
                  displayName: 'Review CRM workbench',
                  description: 'Use the native CRM Workbench to inspect and edit records.',
                  access: 'read'
                }
              ]
            },
            {
              type: 'view',
              name: CRM_WORKBENCH_VIEW_KEY,
              displayName: 'CRM Workbench',
              description: 'Native CRM Workbench for objects, records, search, details, creation, and editing.'
            },
            {
              type: 'tool',
              name: CRM_MIDDLEWARE_NAME,
              displayName: 'CRM Agent Tools',
              description: 'Assistant middleware tools for listing CRM objects and reading or writing records.'
            },
            {
              type: 'assistant-template',
              name: 'crm-assistant',
              displayName: 'CRM Assistant Template',
              description: 'Prebuilt Assistant template for Xpert-native CRM operations.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [CRM_MIDDLEWARE_NAME],
          viewProviders: [CRM_PROVIDER_KEY],
          templateProviders: [CRM_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: CRM_ICON,
      color: '#0f766e'
    },
    displayName: 'CRM',
    description: 'Xpert-native CRM plugin inspired by Twenty core CRM architecture.',
    keywords: ['crm', 'twenty', 'records', 'workbench', 'agent-tool', 'assistant-template'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema,
    formSchema: CrmPluginConfigFormSchema,
    defaults: readCrmPluginEnvDefaults()
  },
  templates: crmTemplates,
  register(ctx) {
    ctx.logger.log('register crm plugin')
    return { module: CrmPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('crm plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('crm plugin stopped')
  }
}

export default plugin
