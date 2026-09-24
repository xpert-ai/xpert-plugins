import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { SmartTicketDispatchPlugin } from './lib/smart-ticket-dispatch.plugin'
import {
  SMART_TICKET_FEATURE,
  SMART_TICKET_ICON,
  SMART_TICKET_MIDDLEWARE_NAME,
  SMART_TICKET_PLUGIN_NAME,
  SMART_TICKET_PROVIDER_KEY,
  SMART_TICKET_TEMPLATE_PROVIDER_KEY,
  SMART_TICKET_WORKBENCH_VIEW_KEY
} from './lib/constants'
import { smartTicketDispatchTemplates } from './lib/smart-ticket-dispatch.templates'

const moduleDir = __dirname

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: XpertPlugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: 'organization',
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [
          SMART_TICKET_FEATURE,
          'ticket-submit-entry',
          'ticket-review-desk',
          'smart-ticket-dispatch-assistant-template'
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'smart-ticket-dispatch',
              displayName: 'Smart Ticket Dispatch',
              description:
                'Triage customer-support tickets with AI, confirm the dispatch plan with a human, and track resolution.',
              icon: {
                type: 'svg',
                value: SMART_TICKET_ICON,
                color: '#1d4ed8'
              },
              operations: [
                {
                  name: 'triage-support-tickets',
                  displayName: 'Triage support tickets',
                  description: 'Classify customer requests and generate dispatch suggestions with the AI assistant.',
                  access: 'write'
                },
                {
                  name: 'confirm-ticket-dispatch',
                  displayName: 'Confirm ticket dispatch',
                  description: 'Review AI suggestions, confirm or adjust the dispatch plan, reject or resolve tickets.',
                  access: 'write'
                },
                {
                  name: 'track-ticket-progress',
                  displayName: 'Track ticket progress',
                  description: 'Search tickets and review the operation log timeline for every ticket.',
                  access: 'read'
                }
              ]
            },
            {
              type: 'view',
              name: SMART_TICKET_WORKBENCH_VIEW_KEY,
              displayName: 'Smart Ticket Dispatch Workbench',
              description: 'Workbench view for ticket submission, AI triage review, dispatch confirmation and tracking.'
            },
            {
              type: 'tool',
              name: SMART_TICKET_MIDDLEWARE_NAME,
              displayName: 'Smart Ticket Dispatch Tools',
              description:
                'Assistant middleware tools for saving AI-triaged tickets, searching tickets and reading ticket details.'
            },
            {
              type: 'assistant-template',
              name: 'smart-ticket-dispatch-assistant',
              displayName: 'Smart Ticket Dispatch Assistant Template',
              description:
                'Prebuilt assistant template for customer-support ticket triage, dispatch confirmation and tracking.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [SMART_TICKET_MIDDLEWARE_NAME],
          viewProviders: [SMART_TICKET_PROVIDER_KEY],
          templateProviders: [SMART_TICKET_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: SMART_TICKET_ICON,
      color: '#1d4ed8'
    },
    displayName: 'Smart Ticket Dispatch',
    description: 'Triage customer-support tickets with AI, confirm dispatch plans with a human, and track resolution.',
    keywords: ['ticket', 'dispatch', 'customer-support', 'view-extension', 'remote-component', 'agent-tool'],
    author: 'XpertAI Team'
  },
  templates: smartTicketDispatchTemplates,
  register(ctx) {
    ctx.logger.log('register smart-ticket-dispatch plugin')
    return { module: SmartTicketDispatchPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('smart-ticket-dispatch plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('smart-ticket-dispatch plugin stopped')
  }
}

export default plugin
