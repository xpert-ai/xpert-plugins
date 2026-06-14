import { IIntegration, TIntegrationProvider } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { IntegrationStrategy, IntegrationStrategyKey, TIntegrationStrategyParams } from '@xpert-ai/plugin-sdk'
import {
  WECHAT_PERSONAL_FEATURE,
  WECHAT_PERSONAL_ICON,
  WECHAT_PERSONAL_PLUGIN_NAME,
  WECHAT_PERSONAL_PROVIDER_KEY,
  WECHAT_PERSONAL_REMOTE_ENTRY_KEY,
  WECHAT_PERSONAL_RUNTIME_FEATURE,
  WECHAT_PERSONAL_VIEW_KEY,
  WECHAT_PERSONAL_VIEW_PROVIDER_KEY,
  WECHAT_PERSONAL_WORKBENCH_FEATURE
} from './constants.js'
import {
  normalizeApiVersion,
  normalizeBaseUrl,
  normalizeGroupTriggerMode,
  normalizeKeywords,
  normalizeTimeoutMs,
  TIntegrationWechatPersonalOptions
} from './types.js'

export const WECHAT_PERSONAL_CALLBACK_HINTS = [
  '推荐：wx2.0 config webhook.allMessagePushUrl / AllMsgPushUrl 指向 Xpert webhook URL',
  '兼容：对单个账号调用 /message/SetCallback?key=<uuid> 设置 CallbackURL',
  '消息回复：Xpert 插件调用 wx2.0 /v1/message/sendtext，失败时可回退旧接口'
] as const

type WechatPersonalIntegrationViewExtensionMeta = {
  key: string
  provider: string
  plugin: string
  hostType: 'integration'
  slot: 'detail.main_tabs'
  viewType: 'remote_component'
  runtime: 'react'
  entry: string
}

type WechatPersonalIntegrationProviderMeta = TIntegrationProvider & {
  targetApps?: string[]
  targetAppMeta?: {
    'data-xpert'?: {
      types?: string[]
      capabilities?: string[]
      runtime?: {
        viewProviders?: string[]
      }
      extensions?: {
        views?: WechatPersonalIntegrationViewExtensionMeta[]
      }
    }
  }
  extensions?: {
    views?: WechatPersonalIntegrationViewExtensionMeta[]
  }
  extensionViews?: WechatPersonalIntegrationViewExtensionMeta[]
}

const WECHAT_PERSONAL_INTEGRATION_VIEW_EXTENSION: WechatPersonalIntegrationViewExtensionMeta = {
  key: WECHAT_PERSONAL_VIEW_KEY,
  provider: WECHAT_PERSONAL_VIEW_PROVIDER_KEY,
  plugin: WECHAT_PERSONAL_PLUGIN_NAME,
  hostType: 'integration',
  slot: 'detail.main_tabs',
  viewType: 'remote_component',
  runtime: 'react',
  entry: WECHAT_PERSONAL_REMOTE_ENTRY_KEY
}

@Injectable()
@IntegrationStrategyKey(WECHAT_PERSONAL_PROVIDER_KEY)
export class WechatPersonalIntegrationStrategy implements IntegrationStrategy<TIntegrationWechatPersonalOptions> {
  readonly meta: WechatPersonalIntegrationProviderMeta = {
    name: WECHAT_PERSONAL_PROVIDER_KEY,
    label: {
      en_US: 'Personal WeChat (wx2.0)',
      zh_Hans: '个人微信 wx2.0'
    },
    icon: {
      type: 'svg',
      value: WECHAT_PERSONAL_ICON
    },
    description: {
      en_US: 'Bridge wx2.0 personal WeChat webhooks and outbound text replies to Xpert agents.',
      zh_Hans: '连接 wx2.0 个人微信 webhook 与 Xpert Agent 文本回复。'
    },
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['integration', 'workbench-view'],
        capabilities: [WECHAT_PERSONAL_FEATURE, WECHAT_PERSONAL_RUNTIME_FEATURE, WECHAT_PERSONAL_WORKBENCH_FEATURE],
        runtime: {
          viewProviders: [WECHAT_PERSONAL_VIEW_PROVIDER_KEY]
        },
        extensions: {
          views: [WECHAT_PERSONAL_INTEGRATION_VIEW_EXTENSION]
        }
      }
    },
    extensions: {
      views: [WECHAT_PERSONAL_INTEGRATION_VIEW_EXTENSION]
    },
    extensionViews: [WECHAT_PERSONAL_INTEGRATION_VIEW_EXTENSION],
    webhook: true,
    schema: {
      type: 'object',
      properties: {
        baseUrl: {
          type: 'string',
          title: {
            en_US: 'wx2.0 Base URL',
            zh_Hans: 'wx2.0 服务地址'
          },
          description: {
            en_US: 'Example: http://127.0.0.1:8058',
            zh_Hans: '例如：http://127.0.0.1:8058'
          }
        },
        apiVersion: {
          type: 'string',
          title: {
            en_US: 'API Version Prefix',
            zh_Hans: 'API 版本前缀'
          },
          default: '/v1/'
        },
        timeoutMs: {
          type: 'number',
          title: {
            en_US: 'Request Timeout (ms)',
            zh_Hans: '请求超时（毫秒）'
          },
          default: 10000
        },
        apiToken: {
          type: 'string',
          title: {
            en_US: 'API Token',
            zh_Hans: 'API Token'
          },
          description: {
            en_US: 'Optional token header reserved for wx2.0 TokenAuth.',
            zh_Hans: '可选，作为 token header 发送，兼容后续 wx2.0 TokenAuth。'
          },
          'x-ui': {
            component: 'password'
          }
        },
        preferLanguage: {
          type: 'string',
          title: {
            en_US: 'Preferred Language',
            zh_Hans: '首选语言'
          },
          enum: ['en', 'zh-Hans'],
          default: 'zh-Hans'
        },
        callbackSecret: {
          type: 'string',
          title: {
            en_US: 'Callback Secret',
            zh_Hans: '回调密钥'
          },
          description: {
            en_US: 'Optional secret passed by query secret or x-wechat-callback-secret header.',
            zh_Hans: '可选，通过 query secret 或 x-wechat-callback-secret header 校验。'
          },
          'x-ui': {
            component: 'password'
          }
        },
        groupTriggerMode: {
          type: 'string',
          title: {
            en_US: 'Group Trigger Mode',
            zh_Hans: '群聊触发方式'
          },
          enum: ['mention_or_keywords', 'all', 'mentions', 'keywords', 'off'],
          default: 'mention_or_keywords'
        },
        groupKeywords: {
          type: 'array',
          title: {
            en_US: 'Group Keywords',
            zh_Hans: '群聊关键词'
          },
          items: {
            type: 'string'
          }
        },
        ignoreSelfMessages: {
          type: 'boolean',
          title: {
            en_US: 'Ignore Self Messages',
            zh_Hans: '忽略自己发出的消息'
          },
          default: true
        },
        fallbackToLegacySendText: {
          type: 'boolean',
          title: {
            en_US: 'Fallback to Legacy SendText',
            zh_Hans: '失败时回退旧发送接口'
          },
          default: true
        }
      },
      required: ['baseUrl'],
      secret: ['apiToken', 'callbackSecret']
    }
  }

  async execute(_integration: IIntegration<TIntegrationWechatPersonalOptions>, _payload: TIntegrationStrategyParams): Promise<any> {
    return null
  }

  async validateConfig(
    config: TIntegrationWechatPersonalOptions,
    integration?: IIntegration<TIntegrationWechatPersonalOptions>
  ) {
    const baseUrl = normalizeBaseUrl(config?.baseUrl)
    if (!baseUrl) {
      throw new Error('wx2.0 baseUrl is required')
    }

    try {
      new URL(baseUrl)
    } catch {
      throw new Error('wx2.0 baseUrl must be a valid URL')
    }

    config.apiVersion = normalizeApiVersion(config.apiVersion)
    config.timeoutMs = normalizeTimeoutMs(config.timeoutMs)
    config.groupTriggerMode = normalizeGroupTriggerMode(config.groupTriggerMode)
    config.groupKeywords = normalizeKeywords(config.groupKeywords)
    config.ignoreSelfMessages = config.ignoreSelfMessages !== false
    config.fallbackToLegacySendText = config.fallbackToLegacySendText !== false

    const apiBaseUrl = (process.env.API_BASE_URL || '').replace(/\/+$/, '')
    const integrationId = integration?.id || '<save_and_get_your_integration_id>'
    const callbackSecret = config.callbackSecret?.trim()
    const callbackUrl = `${apiBaseUrl}/api/wechat-personal/webhook/${integrationId}${
      callbackSecret ? `?secret=${encodeURIComponent(callbackSecret)}` : ''
    }`
    const redactedCallbackUrl = `${apiBaseUrl}/api/wechat-personal/webhook/${integrationId}${
      callbackSecret ? '?secret=***' : ''
    }`

    return {
      webhookUrl: callbackUrl,
      callback: {
        mode: 'http',
        callbackUrl,
        globalWebhookConfigKeys: ['webhook.allMessagePushUrl', 'AllMsgPushUrl'],
        setCallback: {
          method: 'POST',
          urlTemplate: `${baseUrl}/message/SetCallback?key=<uuid>`,
          body: {
            CallbackURL: redactedCallbackUrl,
            Enabled: true
          }
        },
        expectedAckMs: 1500,
        subscriptionHints: [...WECHAT_PERSONAL_CALLBACK_HINTS]
      }
    }
  }
}
