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
  normalizeChatFilterMode,
  normalizeGroupTriggerMode,
  normalizeIdList,
  normalizeKeywords,
  normalizeString,
  normalizeTimeoutMs,
  normalizeWechatPersonalConnectionMode,
  TIntegrationWechatPersonalOptions
} from './types.js'
import { WechatPersonalTunnelBrokerService } from './wechat-personal-tunnel-broker.service.js'

export const WECHAT_PERSONAL_CALLBACK_HINTS = [
  '推荐：wx2.0 config webhook.allMessagePushUrl / AllMsgPushUrl 指向 Xpert webhook URL',
  '兼容：对单个账号调用 /message/SetCallback?key=<uuid> 设置 CallbackURL',
  '消息回复：Xpert 插件调用 wx2.0 /v1/message/sendtext，失败时可回退旧接口',
  '外网 Xpert 访问内网服务时，可选择 reverse_tunnel，由本地 sidecar 通过 WSS 连接 Xpert 插件'
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
  constructor(private readonly tunnelBroker: WechatPersonalTunnelBrokerService) {}

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
        connectionMode: {
          type: 'string',
          title: {
            en_US: 'Connection Mode',
            zh_Hans: '连接方式'
          },
          enum: ['direct_http', 'reverse_tunnel'],
          enumLabels: {
            direct_http: {
              en_US: 'Direct HTTP',
              zh_Hans: '直接 HTTP'
            },
            reverse_tunnel: {
              en_US: 'Reverse Tunnel',
              zh_Hans: '反向隧道'
            }
          },
          default: 'direct_http'
        },
        baseUrl: {
          type: 'string',
          title: {
            en_US: 'wx2.0 Base URL',
            zh_Hans: 'wx2.0 服务地址'
          },
          description: {
            en_US: 'Required in direct HTTP mode. Example: http://127.0.0.1:8058',
            zh_Hans: '直接 HTTP 模式必填。例如：http://127.0.0.1:8058'
          }
        },
        tunnelClientId: {
          type: 'string',
          title: {
            en_US: 'Tunnel Client ID',
            zh_Hans: '隧道客户端 ID'
          },
          description: {
            en_US: 'Required in reverse tunnel mode. Must match MsgClientInfo.Id in the local wx2.0 setting.',
            zh_Hans: '反向隧道模式必填，需与本地 wx2.0 setting 中的 MsgClientInfo.Id 一致。'
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
        chatFilterMode: {
          type: 'string',
          title: {
            en_US: 'Chat Filter Mode',
            zh_Hans: '会话过滤方式'
          },
          enum: ['all', 'private_only', 'group_only'],
          enumLabels: {
            all: {
              en_US: 'All chats',
              zh_Hans: '全部会话'
            },
            private_only: {
              en_US: 'Private chats only',
              zh_Hans: '仅私聊'
            },
            group_only: {
              en_US: 'Group chats only',
              zh_Hans: '仅群聊'
            }
          },
          default: 'all'
        },
        allowedContactIds: {
          type: 'array',
          title: {
            en_US: 'Allowed Contact IDs',
            zh_Hans: '允许的联系人/群 ID'
          },
          description: {
            en_US: 'Optional allowlist for contactId. Applies to private contact ids and group room ids.',
            zh_Hans: '可选 contactId 白名单，适用于私聊联系人 ID 和群 roomId。'
          },
          items: {
            type: 'string'
          }
        },
        blockedContactIds: {
          type: 'array',
          title: {
            en_US: 'Blocked Contact IDs',
            zh_Hans: '排除的联系人/群 ID'
          },
          items: {
            type: 'string'
          }
        },
        allowedGroupIds: {
          type: 'array',
          title: {
            en_US: 'Allowed Group IDs',
            zh_Hans: '允许的群 ID'
          },
          description: {
            en_US: 'Optional group room id allowlist. Example: 12345@chatroom.',
            zh_Hans: '可选群 roomId 白名单。例如：12345@chatroom。'
          },
          items: {
            type: 'string'
          }
        },
        blockedGroupIds: {
          type: 'array',
          title: {
            en_US: 'Blocked Group IDs',
            zh_Hans: '排除的群 ID'
          },
          items: {
            type: 'string'
          }
        },
        allowedSenderIds: {
          type: 'array',
          title: {
            en_US: 'Allowed Sender IDs',
            zh_Hans: '允许的发送人 ID'
          },
          items: {
            type: 'string'
          }
        },
        blockedSenderIds: {
          type: 'array',
          title: {
            en_US: 'Blocked Sender IDs',
            zh_Hans: '排除的发送人 ID'
          },
          items: {
            type: 'string'
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
      required: [],
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
    const connectionMode = normalizeWechatPersonalConnectionMode(config?.connectionMode)
    config.connectionMode = connectionMode
    const baseUrl = normalizeBaseUrl(config?.baseUrl)
    if (connectionMode === 'direct_http') {
      if (!baseUrl) {
        throw new Error('wx2.0 baseUrl is required in direct_http mode')
      }

      try {
        new URL(baseUrl)
      } catch {
        throw new Error('wx2.0 baseUrl must be a valid URL')
      }
      config.baseUrl = baseUrl
    } else {
      config.baseUrl = baseUrl || undefined
      config.tunnelClientId = normalizeString(config.tunnelClientId)
      if (!config.tunnelClientId) {
        throw new Error('tunnelClientId is required in reverse_tunnel mode')
      }
    }

    config.apiVersion = normalizeApiVersion(config.apiVersion)
    config.timeoutMs = normalizeTimeoutMs(config.timeoutMs)
    config.chatFilterMode = normalizeChatFilterMode(config.chatFilterMode)
    config.allowedContactIds = normalizeIdList(config.allowedContactIds)
    config.blockedContactIds = normalizeIdList(config.blockedContactIds)
    config.allowedGroupIds = normalizeIdList(config.allowedGroupIds)
    config.blockedGroupIds = normalizeIdList(config.blockedGroupIds)
    config.allowedSenderIds = normalizeIdList(config.allowedSenderIds)
    config.blockedSenderIds = normalizeIdList(config.blockedSenderIds)
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
    const setup = this.tunnelBroker.buildSetupConfig(config.tunnelClientId, integration?.name || WECHAT_PERSONAL_PROVIDER_KEY)

    return {
      webhookUrl: callbackUrl,
      callback: {
        mode: 'http',
        callbackUrl,
        globalWebhookConfigKeys: ['webhook.allMessagePushUrl', 'AllMsgPushUrl'],
        setCallback: {
          method: 'POST',
          urlTemplate:
            connectionMode === 'reverse_tunnel'
              ? 'reverse_tunnel:/message/SetCallback?key=<uuid>'
              : `${baseUrl}/message/SetCallback?key=<uuid>`,
          body: {
            CallbackURL: redactedCallbackUrl,
            Enabled: true
          }
        },
        expectedAckMs: 1500,
        subscriptionHints: [...WECHAT_PERSONAL_CALLBACK_HINTS]
      },
      tunnel: {
        clientId: config.tunnelClientId,
        forwardServerInfo: setup.forwardServerInfo,
        msgClientInfo: setup.msgClientInfo,
        settingJson: setup.settingJson
      }
    }
  }
}
