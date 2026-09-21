import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod/v3'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  SUPPORT_TICKET_ICON,
  SUPPORT_TICKET_FEATURE,
  SUPPORT_TICKET_MIDDLEWARE_NAME,
  SUPPORT_TICKET_PROVIDER_KEY,
  SUPPORT_TICKET_TEMPLATE_PROVIDER_KEY,
  SUPPORT_TICKET_WORKBENCH_VIEW_KEY
} from './lib/constants'
import {
  SUPPORT_TICKET_CONFIG,
  SupportTicketPluginConfigFormSchema,
  SupportTicketPluginConfigSchema,
  readSupportTicketPluginEnvDefaults
} from './lib/support-ticket.config'
import { SupportTicketPlugin } from './lib/support-ticket.plugin'
import { SUPPORT_TICKET_TEMPLATE_KEY, supportTicketTemplates } from './lib/support-ticket.templates'

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = SupportTicketPluginConfigSchema

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
          SUPPORT_TICKET_FEATURE,
          'support-ticket-intake',
          'support-ticket-review-desk',
          'support-ticket-assistant-template'
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'support-ticket',
              displayName: 'Support Ticket',
              description:
                'Turn raw customer messages into classified, prioritized and archived service tickets with a human confirmed reply draft.',
              icon: {
                type: 'svg',
                value: SUPPORT_TICKET_ICON,
                color: '#2563eb'
              },
              operations: [
                {
                  name: 'create-support-tickets',
                  displayName: 'Create support tickets',
                  description: 'Create a reviewable support ticket from one customer message.',
                  access: 'write'
                },
                {
                  name: 'confirm-support-replies',
                  displayName: 'Confirm support replies',
                  description: 'Review the AI triage result, edit the reply draft and confirm the ticket.',
                  access: 'write'
                }
              ]
            },
            {
              type: 'view',
              name: SUPPORT_TICKET_WORKBENCH_VIEW_KEY,
              displayName: 'Support Ticket Workbench',
              description: 'Workbench view for ticket intake, AI triage review and archived ticket history.'
            },
            {
              type: 'tool',
              name: SUPPORT_TICKET_MIDDLEWARE_NAME,
              displayName: 'Support Ticket Tools',
              description:
                'Assistant middleware tools for saving triage results, searching tickets and reading ticket details.'
            },
            {
              type: 'assistant-template',
              name: SUPPORT_TICKET_TEMPLATE_KEY,
              displayName: 'Support Ticket Assistant Template',
              description: 'Prebuilt assistant template for customer message triage and reply drafting.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [SUPPORT_TICKET_MIDDLEWARE_NAME],
          viewProviders: [SUPPORT_TICKET_PROVIDER_KEY],
          templateProviders: [SUPPORT_TICKET_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: SUPPORT_TICKET_ICON,
      color: '#2563eb'
    },
    displayName: 'Support Ticket',
    description:
      'Classify customer messages, score urgency, draft replies and archive human confirmed support tickets.',
    keywords: ['support', 'ticket', 'view-extension', 'remote-component', 'agent-tool', 'assistant-template'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema,
    formSchema: SupportTicketPluginConfigFormSchema,
    defaults: readSupportTicketPluginEnvDefaults()
  },
  templates: supportTicketTemplates,
  register(ctx) {
    ctx.logger.log('register support-ticket plugin')
    return {
      module: SupportTicketPlugin,
      global: true,
      providers: [{ provide: SUPPORT_TICKET_CONFIG, useValue: ctx.config }],
      exports: [SUPPORT_TICKET_CONFIG]
    }
  },
  async onStart(ctx) {
    ctx.logger.log('support-ticket plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('support-ticket plugin stopped')
  }
}

export default plugin
