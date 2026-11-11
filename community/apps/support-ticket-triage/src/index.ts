import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { ARTIFACT_NAMESPACE, FEATURE_KEY, ICON, MIDDLEWARE_NAME, PLUGIN_NAME, TEMPLATE_PROVIDER_KEY, VIEW_KEY, VIEW_PROVIDER_KEY } from './lib/constants.js'
import { SupportTicketPlugin } from './lib/support-ticket.plugin.js'
import { supportTicketTemplates } from './lib/support-ticket.templates.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as { name: string; version: string }
const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name || PLUGIN_NAME,
    version: packageJson.version,
    level: 'system',
    artifactNamespace: ARTIFACT_NAMESPACE,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [FEATURE_KEY, VIEW_KEY],
        marketplace: {
          contents: [
            { type: 'app', name: 'support-ticket-triage', displayName: 'Support Ticket Triage', description: 'AI-assisted ticket classification and human-approved replies.', icon: { type: 'svg', value: ICON, color: '#2563eb' }, operations: [{ name: 'read-tickets', displayName: 'Read tickets', description: 'Read scoped support tickets.', access: 'read' }, { name: 'manage-triage', displayName: 'Manage triage', description: 'Create, analyse, retry, and review tickets.', access: 'write' }] },
            { type: 'view', name: VIEW_KEY, displayName: 'Ticket Triage Workbench', description: 'Review AI results and approve or reject reply drafts.' },
            { type: 'tool', name: MIDDLEWARE_NAME, displayName: 'Ticket Triage Tools', description: 'Persisted tools for AI ticket analysis.' },
            { type: 'assistant-template', name: 'support-ticket-triage-assistant', displayName: 'Support Ticket Triage Assistant', description: 'Prebuilt assistant for the complete triage loop.' }
          ]
        },
        runtime: { middlewareProviders: [MIDDLEWARE_NAME], viewProviders: [VIEW_PROVIDER_KEY], templateProviders: [TEMPLATE_PROVIDER_KEY] }
      }
    },
    category: 'middleware', icon: { type: 'svg', value: ICON, color: '#2563eb' },
    displayName: 'Support Ticket Triage', description: 'Human-reviewed AI support ticket triage Agentic App.',
    keywords: ['support', 'ticket', 'triage', 'agentic-app', 'human-review'], author: 'Candidate'
  },
  config: { schema: ConfigSchema },
  templates: supportTicketTemplates,
  register(ctx) { ctx.logger.log('register support-ticket-triage plugin'); return { module: SupportTicketPlugin, global: true } },
  async onStart(ctx) { ctx.logger.log('support-ticket-triage plugin started') },
  async onStop(ctx) { ctx.logger.log('support-ticket-triage plugin stopped') }
}

export default plugin
