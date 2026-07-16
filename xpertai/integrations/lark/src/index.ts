import { z } from 'zod'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { initI18n } from './lib/i18n.js'
import { iconImage } from './lib/types.js'
import { IntegrationLarkPluginConfigSchema } from './lib/plugin-config.js'
import { IntegrationLarkPlugin } from './lib/integration-lark.module.js'
import { LARK_PLUGIN_CONTEXT } from './lib/tokens.js'
import {
  LARK_ADMIN_TEMPLATE_KEY,
  LARK_ADMIN_VIEW_FEATURE,
  LARK_ASSISTANT_TEMPLATE_FEATURE,
  LARK_CONVERSATION_TEMPLATE_KEY,
  LARK_DOCUMENT_SOURCE_FEATURE,
  LARK_FEATURE,
  LARK_LOCAL_HISTORY_FEATURE,
  LARK_LONG_CONNECTION_FEATURE,
  LARK_MESSAGING_FEATURE,
  LARK_RUNTIME_MIDDLEWARE_NAME,
  LARK_PLUGIN_NAME,
  LARK_PROVIDER_KEY,
  LARK_TEMPLATE_PROVIDER_KEY,
  LARK_VIEW_PROVIDER_KEY
} from './lib/constants.js'
import { larkTemplates } from './lib/lark.templates.js'
import type { LarkXpertPlugin } from './lib/plugin-metadata-compat.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: LarkXpertPlugin<z.infer<typeof IntegrationLarkPluginConfigSchema>> = {
  meta: {
    name: packageJson.name || LARK_PLUGIN_NAME,
    version: packageJson.version,
    level: 'system',
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['integration', 'workbench-view', 'assistant-tool', 'assistant-template', 'document-source'],
        capabilities: [
          LARK_FEATURE,
          LARK_MESSAGING_FEATURE,
          LARK_LONG_CONNECTION_FEATURE,
          LARK_DOCUMENT_SOURCE_FEATURE,
          LARK_ADMIN_VIEW_FEATURE,
          LARK_ASSISTANT_TEMPLATE_FEATURE,
          LARK_LOCAL_HISTORY_FEATURE
        ],
        marketplace: {
          category: 'communication',
          contents: [
            {
              type: 'app',
              name: LARK_PROVIDER_KEY,
              displayName: 'Lark',
              description: 'Connect Lark/Feishu messages, long connections, document sources, and Agent replies.',
              icon: {
                type: 'image',
                value: iconImage
              },
              operations: [
                {
                  name: 'receive-lark-messages',
                  displayName: 'Receive Lark messages',
                  description:
                    'Receive Lark webhook or long-connection events and dispatch normalized chat messages to an Agent.',
                  access: 'read'
                },
                {
                  name: 'send-lark-messages',
                  displayName: 'Send Lark messages',
                  description:
                    'Send text, rich post, interactive card, or workspace file messages through Lark OpenAPI.',
                  access: 'write'
                },
                {
                  name: 'manage-lark-connections',
                  displayName: 'Manage Lark connections',
                  description:
                    'Review and operate webhook or long-connection sessions, users, and conversation bindings.',
                  access: 'admin'
                }
              ]
            },
            {
              type: 'view',
              name: LARK_VIEW_PROVIDER_KEY,
              displayName: 'Lark Integration View',
              description:
                'Extension view for Lark connection status, managed connections, users, conversations, and local messages.'
            },
            {
              type: 'tool',
              name: LARK_RUNTIME_MIDDLEWARE_NAME,
              displayName: 'Lark Runtime',
              description:
                'Unified assistant middleware for local history, Lark message and workspace file sending, and remote message access.'
            },
            {
              type: 'feature',
              name: 'lark-document-source',
              displayName: 'Lark Document Source',
              description: 'Load Lark/Feishu documents and folders into Xpert knowledge workflows.',
              metadata: {
                provider: LARK_PROVIDER_KEY,
                kind: 'document-source'
              }
            },
            {
              type: 'assistant-template',
              name: LARK_ADMIN_TEMPLATE_KEY,
              displayName: 'Lark Admin Assistant Template',
              description:
                'Organization-level assistant template for managing Lark integrations, long connections, users, and conversations.',
              metadata: {
                templateId: LARK_ADMIN_TEMPLATE_KEY
              }
            },
            {
              type: 'assistant-template',
              name: LARK_CONVERSATION_TEMPLATE_KEY,
              displayName: 'Lark Conversation Assistant Template',
              description:
                'End-user assistant template with a Lark trigger, locally stored history and attachments, and message/file tools.',
              metadata: {
                templateId: LARK_CONVERSATION_TEMPLATE_KEY
              }
            }
          ]
        },
        runtime: {
          integrationProviders: [LARK_PROVIDER_KEY],
          channelProviders: [LARK_PROVIDER_KEY],
          middlewareProviders: [LARK_RUNTIME_MIDDLEWARE_NAME],
          viewProviders: [LARK_VIEW_PROVIDER_KEY],
          templateProviders: [LARK_TEMPLATE_PROVIDER_KEY],
          triggerProviders: [LARK_PROVIDER_KEY],
          documentSourceProviders: [LARK_PROVIDER_KEY]
        }
      }
    },
    category: 'integration',
    icon: {
      type: 'image',
      value: iconImage
    },
    displayName: 'Lark/Feishu Plugin',
    description: 'Bidirectional messaging integration with Lark (Feishu) platform',
    keywords: ['lark', 'feishu', 'document source', 'knowledge', 'integration'],
    author: 'XpertAI team'
  },
  config: {
    schema: IntegrationLarkPluginConfigSchema
  },
  permissions: [
    { type: 'integration', service: 'lark', operations: ['read', 'write'] },
    { type: 'user', operations: ['read', 'write'] },
    { type: 'handoff', operations: ['enqueue'] },
    { type: 'analytics', operations: ['model', 'dscore', 'query', 'create_indicator'] }
  ],
  templates: larkTemplates,
  register(ctx) {
    ctx.logger.log('Registering Lark integration plugin')
    initI18n(join(moduleDir, '../src'))
    return {
      module: IntegrationLarkPlugin,
      global: true,
      providers: [{ provide: LARK_PLUGIN_CONTEXT, useValue: ctx }],
      exports: []
    }
  },
  async onStart(ctx) {
    ctx.logger.log('Lark integration plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('Lark integration plugin stopped')
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/plugin-metadata-compat.js'
export * from './lib/lark.templates.js'
