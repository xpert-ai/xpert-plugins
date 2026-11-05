import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod/v3'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  COMPLAINT_FEATURE,
  COMPLAINT_ICON,
  COMPLAINT_MIDDLEWARE_NAME,
  COMPLAINT_PLUGIN_NAME,
  COMPLAINT_PROVIDER_KEY,
  COMPLAINT_TEMPLATE_KEY,
  COMPLAINT_TEMPLATE_PROVIDER_KEY,
  COMPLAINT_WORKBENCH_VIEW_KEY,
  PLUGIN_ARTIFACT_NAMESPACE
} from './lib/constants'
import {
  CustomerComplaintPluginConfigFormSchema,
  CustomerComplaintPluginConfigSchema,
  readCustomerComplaintPluginEnvDefaults
} from './lib/customer-complaint.config'
import { CustomerComplaintPlugin } from './lib/customer-complaint.plugin'
import { customerComplaintTemplates } from './lib/customer-complaint.templates'

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: XpertPlugin<z.infer<typeof CustomerComplaintPluginConfigSchema>> = {
  meta: {
    name: packageJson.name || COMPLAINT_PLUGIN_NAME,
    version: packageJson.version,
    level: 'organization',
    artifactNamespace: PLUGIN_ARTIFACT_NAMESPACE,
    category: 'middleware',
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [COMPLAINT_FEATURE, COMPLAINT_WORKBENCH_VIEW_KEY, COMPLAINT_TEMPLATE_KEY],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'customer-complaint-intake',
              displayName: 'Customer Complaint Intake',
              description: 'Turn a customer complaint into a reviewable intake record.',
              icon: { type: 'svg', value: COMPLAINT_ICON, color: '#b45309' }
            },
            {
              type: 'view',
              name: COMPLAINT_WORKBENCH_VIEW_KEY,
              displayName: 'Complaint Intake Desk',
              description: 'Review AI drafts and confirm or return complaint cases.'
            },
            {
              type: 'tool',
              name: COMPLAINT_MIDDLEWARE_NAME,
              displayName: 'Complaint Intake Tools',
              description: 'Save, read, and search complaint intake drafts.'
            },
            {
              type: 'assistant-template',
              name: COMPLAINT_TEMPLATE_KEY,
              displayName: 'Customer Complaint Assistant',
              description: 'Assistant template for complaint intake drafts.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [COMPLAINT_MIDDLEWARE_NAME],
          viewProviders: [COMPLAINT_PROVIDER_KEY],
          templateProviders: [COMPLAINT_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    icon: { type: 'svg', value: COMPLAINT_ICON, color: '#b45309' },
    displayName: 'Customer Complaint Intake',
    description: 'Create a reviewable complaint intake draft from customer text and let an agent confirm it.',
    keywords: ['complaint', 'customer-service', 'workbench', 'assistant-template'],
    author: 'Interview candidate'
  },
  config: {
    schema: CustomerComplaintPluginConfigSchema,
    formSchema: CustomerComplaintPluginConfigFormSchema,
    defaults: readCustomerComplaintPluginEnvDefaults()
  },
  templates: customerComplaintTemplates,
  register(ctx) {
    ctx.logger.log('register customer-complaint-intake plugin')
    return { module: CustomerComplaintPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('customer-complaint-intake plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('customer-complaint-intake plugin stopped')
  }
}

export default plugin
