import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  WECHAT_FEATURE,
  WECHAT_ICON,
  WECHAT_MIDDLEWARE_NAME,
  WECHAT_PLUGIN_NAME,
  WECHAT_PROVIDER_KEY,
  WECHAT_RUNTIME_FEATURE,
  WECHAT_TEMPLATE_PROVIDER_KEY,
  WECHAT_VIEW_KEY,
  WECHAT_VIEW_PROVIDER_KEY
} from './lib/constants.js'
import { WECHAT_PLUGIN_CONTEXT } from './lib/tokens.js'
import { WechatPlugin } from './lib/wechat.plugin.js'
import { wechatTemplates } from './lib/wechat.templates.js'
import {
  type WechatPluginConfig,
  WechatPluginConfigFormSchema,
  WechatPluginConfigSchema
} from './plugin-config.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: XpertPlugin<WechatPluginConfig> = {
  meta: {
    name: packageJson.name || WECHAT_PLUGIN_NAME,
    version: packageJson.version,
    level: 'system',
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['integration', 'workbench-view', 'assistant-tool', 'assistant-template'],
        capabilities: [
          WECHAT_FEATURE,
          WECHAT_RUNTIME_FEATURE,
          'wechat-workbench',
          'wechat-admin-assistant-template',
          'wechat-user-assistant-template'
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: WECHAT_PROVIDER_KEY,
              displayName: 'WeChat',
              description: 'Bridge wx2.0 WeChat messages with Xpert agents.',
              icon: {
                type: 'svg',
                value: WECHAT_ICON,
                color: '#16a34a'
              },
              operations: [
                {
                  name: 'receive-wechat-messages',
                  displayName: 'Receive WeChat messages',
                  description: 'Receive wx2.0 callbacks and dispatch normalized text messages to an Agent.',
                  access: 'read'
                },
                {
                  name: 'send-wechat-replies',
                  displayName: 'Send WeChat replies',
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
              name: WECHAT_VIEW_KEY,
              displayName: 'WeChat Workbench',
              description: 'Workbench for wx2.0 accounts, conversations, message logs, and callback setup.'
            },
            {
              type: 'tool',
              name: WECHAT_MIDDLEWARE_NAME,
              displayName: 'WeChat Runtime Tools',
              description:
                'Assistant middleware for WeChat runtime discovery, callback setup, account management, conversations, and logs.'
            },
            {
              type: 'assistant-template',
              name: 'wechat-admin-assistant',
              displayName: 'WeChat Admin Assistant Template',
              description: 'Organization-level assistant template for managing WeChat integrations, callbacks, accounts, conversations, and logs.'
            },
            {
              type: 'assistant-template',
              name: 'wechat-user-assistant',
              displayName: 'WeChat User Assistant Template',
              description: 'End-user assistant template with a WeChat trigger and final-text reply behavior.'
            }
          ]
        },
        runtime: {
          integrationProviders: [WECHAT_PROVIDER_KEY],
          channelProviders: [WECHAT_PROVIDER_KEY],
          middlewareProviders: [WECHAT_MIDDLEWARE_NAME],
          viewProviders: [WECHAT_VIEW_PROVIDER_KEY],
          templateProviders: [WECHAT_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'integration',
    icon: {
      type: 'svg',
      value: WECHAT_ICON,
      color: '#16a34a'
    },
    displayName: 'WeChat Plugin',
    description: 'wx2.0 WeChat integration for webhook receiving, Agent dispatch, and sendtext replies.',
    keywords: ['wechat', 'wx2.0', 'integration', 'webhook', 'agent', 'remote-component'],
    author: 'XpertAI Team'
  },
  config: {
    schema: WechatPluginConfigSchema,
    formSchema: WechatPluginConfigFormSchema
  },
  permissions: [
    { type: 'integration', service: WECHAT_PROVIDER_KEY, operations: ['read', 'write'] },
    { type: 'handoff', operations: ['enqueue'] },
    { type: 'speech_to_text', operations: ['transcribe'] }
  ],
  templates: wechatTemplates,
  register(ctx) {
    return {
      module: WechatPlugin,
      global: true,
      providers: [{ provide: WECHAT_PLUGIN_CONTEXT, useValue: ctx }],
      exports: []
    }
  }
}

export default plugin
export * from './plugin-config.js'
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/handoff/index.js'
export * from './lib/workflow/index.js'
export * from './lib/conversation-user-key.js'
export * from './lib/conversation.service.js'
export * from './lib/wechat-channel.strategy.js'
export * from './lib/wechat.client.js'
export * from './lib/wechat-outbound-queue.service.js'
export * from './lib/wechat-outbound-queue.processor.js'
export * from './lib/wechat-redis.js'
export * from './lib/wechat-text-format.js'
export * from './lib/wechat-tunnel-broker.service.js'
export * from './lib/wechat-websocket-tunnel.service.js'
export * from './lib/wechat.controller.js'
export * from './lib/wechat-integration.strategy.js'
export * from './lib/wechat.middleware.js'
export * from './lib/wechat.plugin.js'
export * from './lib/wechat.templates.js'
export * from './lib/views/wechat-view.provider.js'
