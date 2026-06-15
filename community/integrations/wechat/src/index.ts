import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  WECHAT_PERSONAL_FEATURE,
  WECHAT_PERSONAL_ICON,
  WECHAT_PERSONAL_MIDDLEWARE_NAME,
  WECHAT_PERSONAL_PLUGIN_NAME,
  WECHAT_PERSONAL_PROVIDER_KEY,
  WECHAT_PERSONAL_RUNTIME_FEATURE,
  WECHAT_PERSONAL_TEMPLATE_PROVIDER_KEY,
  WECHAT_PERSONAL_VIEW_KEY,
  WECHAT_PERSONAL_VIEW_PROVIDER_KEY
} from './lib/constants.js'
import { WECHAT_PERSONAL_PLUGIN_CONTEXT } from './lib/tokens.js'
import { WechatPersonalPlugin } from './lib/wechat-personal.plugin.js'
import { wechatPersonalTemplates } from './lib/wechat-personal.templates.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({
  tunnelWsPath: z.string().default('/api/wechat-personal/tunnel/ws'),
  tunnelHeartbeatIntervalMs: z.number().int().positive().default(30000),
  tunnelClientTimeoutMs: z.number().int().positive().default(90000)
})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name || WECHAT_PERSONAL_PLUGIN_NAME,
    version: packageJson.version,
    level: 'system',
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['integration', 'workbench-view', 'assistant-tool', 'assistant-template'],
        capabilities: [
          WECHAT_PERSONAL_FEATURE,
          WECHAT_PERSONAL_RUNTIME_FEATURE,
          'wechat-personal-workbench',
          'wechat-personal-admin-assistant-template',
          'wechat-personal-user-assistant-template'
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: WECHAT_PERSONAL_PROVIDER_KEY,
              displayName: 'Personal WeChat',
              description: 'Bridge wx2.0 personal WeChat messages with Xpert agents.',
              icon: {
                type: 'svg',
                value: WECHAT_PERSONAL_ICON,
                color: '#16a34a'
              },
              operations: [
                {
                  name: 'receive-wechat-messages',
                  displayName: 'Receive personal WeChat messages',
                  description: 'Receive wx2.0 callbacks and dispatch normalized text messages to an Agent.',
                  access: 'read'
                },
                {
                  name: 'send-wechat-replies',
                  displayName: 'Send personal WeChat replies',
                  description: 'Send final Agent text replies through wx2.0 sendtext.',
                  access: 'write'
                },
                {
                  name: 'manage-wechat-runtime',
                  displayName: 'Manage WeChat runtime',
                  description: 'Review accounts, conversation bindings, message logs, callbacks, and configuration.',
                  access: 'write'
                }
              ]
            },
            {
              type: 'view',
              name: WECHAT_PERSONAL_VIEW_KEY,
              displayName: 'Personal WeChat Workbench',
              description: 'Workbench for wx2.0 accounts, conversations, message logs, and callback setup.'
            },
            {
              type: 'tool',
              name: WECHAT_PERSONAL_MIDDLEWARE_NAME,
              displayName: 'Personal WeChat Runtime Tools',
              description:
                'Assistant middleware for Personal WeChat runtime discovery, callback setup, account management, conversations, and logs.'
            },
            {
              type: 'assistant-template',
              name: 'wechat-personal-admin-assistant',
              displayName: 'Personal WeChat Admin Assistant Template',
              description: 'Organization-level assistant template for managing Personal WeChat integrations, callbacks, accounts, conversations, and logs.'
            },
            {
              type: 'assistant-template',
              name: 'wechat-personal-user-assistant',
              displayName: 'Personal WeChat User Assistant Template',
              description: 'End-user assistant template with a Personal WeChat trigger and final-text reply behavior.'
            }
          ]
        },
        runtime: {
          integrationProviders: [WECHAT_PERSONAL_PROVIDER_KEY],
          channelProviders: [WECHAT_PERSONAL_PROVIDER_KEY],
          middlewareProviders: [WECHAT_PERSONAL_MIDDLEWARE_NAME],
          viewProviders: [WECHAT_PERSONAL_VIEW_PROVIDER_KEY],
          templateProviders: [WECHAT_PERSONAL_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'integration',
    icon: {
      type: 'svg',
      value: WECHAT_PERSONAL_ICON,
      color: '#16a34a'
    },
    displayName: 'Personal WeChat Plugin',
    description: 'wx2.0 personal WeChat integration for webhook receiving, Agent dispatch, and sendtext replies.',
    keywords: ['wechat', 'wx2.0', 'personal-wechat', 'integration', 'webhook', 'agent', 'remote-component'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  permissions: [
    { type: 'integration', service: WECHAT_PERSONAL_PROVIDER_KEY, operations: ['read', 'write'] },
    { type: 'handoff', operations: ['enqueue'] }
  ],
  templates: wechatPersonalTemplates,
  register(ctx) {
    return {
      module: WechatPersonalPlugin,
      global: true,
      providers: [{ provide: WECHAT_PERSONAL_PLUGIN_CONTEXT, useValue: ctx }],
      exports: []
    }
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/handoff/index.js'
export * from './lib/workflow/index.js'
export * from './lib/conversation-user-key.js'
export * from './lib/conversation.service.js'
export * from './lib/wechat-personal-channel.strategy.js'
export * from './lib/wechat-personal.client.js'
export * from './lib/wechat-personal-text-format.js'
export * from './lib/wechat-personal-tunnel-broker.service.js'
export * from './lib/wechat-personal-websocket-tunnel.service.js'
export * from './lib/wechat-personal.controller.js'
export * from './lib/wechat-personal-integration.strategy.js'
export * from './lib/wechat-personal.middleware.js'
export * from './lib/wechat-personal.plugin.js'
export * from './lib/wechat-personal.templates.js'
export * from './lib/views/wechat-personal-view.provider.js'
