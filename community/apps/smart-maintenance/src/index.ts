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
  SMART_MAINTENANCE_PLUGIN_NAME
} from './lib/constants'

const ConfigSchema = SmartMaintenancePluginConfigSchema

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: SMART_MAINTENANCE_PLUGIN_NAME,
    version: '0.0.1',
    level: 'organization',
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [SMART_MAINTENANCE_FEATURE, 'maintenance-report-entry', 'maintenance-review-desk']
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
    keywords: ['maintenance', 'work-order', 'view-extension', 'remote-component', 'agent-tool'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema,
    formSchema: SmartMaintenancePluginConfigFormSchema,
    defaults: readSmartMaintenancePluginEnvDefaults()
  },
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
