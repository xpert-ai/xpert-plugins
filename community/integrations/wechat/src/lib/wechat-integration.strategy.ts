import { IIntegration, TIntegrationProvider } from '@xpert-ai/contracts'
import { Inject, Injectable } from '@nestjs/common'
import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  IntegrationPermissionService,
  IntegrationStrategy,
  IntegrationStrategyKey,
  TIntegrationStrategyParams,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import {
  WECHAT_FEATURE,
  WECHAT_ICON,
  WECHAT_PLUGIN_NAME,
  WECHAT_PROVIDER_KEY,
  WECHAT_REMOTE_ENTRY_KEY,
  WECHAT_RUNTIME_FEATURE,
  WECHAT_VIEW_KEY,
  WECHAT_VIEW_PROVIDER_KEY,
  WECHAT_WORKBENCH_FEATURE
} from './constants.js'
import {
  normalizeApiVersion,
  normalizeBaseUrl,
  normalizeString,
  normalizeTimeoutMs,
  normalizeWechatConnectionMode,
  TIntegrationWechatOptions
} from './types.js'
import { WechatTunnelBrokerService } from './wechat-tunnel-broker.service.js'
import { WECHAT_PLUGIN_CONTEXT } from './tokens.js'

export const WECHAT_CALLBACK_HINTS = [
  '推荐：wx2.0 config webhook.allMessagePushUrl / AllMsgPushUrl 指向 Xpert webhook URL',
  '兼容：对单个账号调用 /message/SetCallback?key=<uuid> 设置 CallbackURL',
  '消息回复：Xpert 插件调用 wx2.0 /v1/message/sendtext，失败时可回退旧接口',
  '外网 Xpert 访问内网服务时，可选择 reverse_tunnel，由本地 sidecar 通过 WSS 连接 Xpert 插件'
] as const

type WechatIntegrationViewExtensionMeta = {
  key: string
  provider: string
  plugin: string
  hostType: 'integration'
  slot: 'detail.main_tabs'
  viewType: 'remote_component'
  runtime: 'react'
  entry: string
}

type WechatIntegrationProviderMeta = TIntegrationProvider & {
  targetApps?: string[]
  targetAppMeta?: {
    'data-xpert'?: {
      types?: string[]
      capabilities?: string[]
      runtime?: {
        viewProviders?: string[]
      }
      extensions?: {
        views?: WechatIntegrationViewExtensionMeta[]
      }
    }
  }
  extensions?: {
    views?: WechatIntegrationViewExtensionMeta[]
  }
  extensionViews?: WechatIntegrationViewExtensionMeta[]
  setup?: {
    autoValidateOnLoad?: boolean
    authorization?: {
      requiresSavedIntegration?: boolean
    }
  }
}

const WECHAT_INTEGRATION_VIEW_EXTENSION: WechatIntegrationViewExtensionMeta = {
  key: WECHAT_VIEW_KEY,
  provider: WECHAT_VIEW_PROVIDER_KEY,
  plugin: WECHAT_PLUGIN_NAME,
  hostType: 'integration',
  slot: 'detail.main_tabs',
  viewType: 'remote_component',
  runtime: 'react',
  entry: WECHAT_REMOTE_ENTRY_KEY
}

@Injectable()
@IntegrationStrategyKey(WECHAT_PROVIDER_KEY)
export class WechatIntegrationStrategy implements IntegrationStrategy<TIntegrationWechatOptions> {
  private _integrationPermissionService: IntegrationPermissionService | null = null

  constructor(
    private readonly tunnelBroker: WechatTunnelBrokerService,
    @Inject(WECHAT_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService | null {
    if (this._integrationPermissionService) {
      return this._integrationPermissionService
    }

    try {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
      return this._integrationPermissionService
    } catch {
      return null
    }
  }

  readonly meta: WechatIntegrationProviderMeta = {
    name: WECHAT_PROVIDER_KEY,
    label: {
      en_US: 'WeChat (wx2.0)',
      zh_Hans: '微信 wx2.0'
    },
    icon: {
      type: 'svg',
      value: WECHAT_ICON
    },
    description: {
      en_US: 'Bridge wx2.0 WeChat webhooks and outbound text replies to Xpert agents.',
      zh_Hans: '连接 wx2.0 微信 webhook 与 Xpert Agent 文本回复。'
    },
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['integration', 'workbench-view'],
        capabilities: [WECHAT_FEATURE, WECHAT_RUNTIME_FEATURE, WECHAT_WORKBENCH_FEATURE],
        runtime: {
          viewProviders: [WECHAT_VIEW_PROVIDER_KEY]
        },
        extensions: {
          views: [WECHAT_INTEGRATION_VIEW_EXTENSION]
        }
      }
    },
    extensions: {
      views: [WECHAT_INTEGRATION_VIEW_EXTENSION]
    },
    extensionViews: [WECHAT_INTEGRATION_VIEW_EXTENSION],
    webhook: true,
    setup: {
      autoValidateOnLoad: true
    },
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
        fallbackToLegacySendText: {
          type: 'boolean',
          title: {
            en_US: 'Fallback to Legacy SendText',
            zh_Hans: '失败时回退旧发送接口'
          },
          default: true
        },
        fallbackToLegacySendImage: {
          type: 'boolean',
          title: {
            en_US: 'Fallback to Legacy SendImage',
            zh_Hans: '图片失败时回退旧发送接口'
          },
          default: true
        },
        outboundQueue: {
          type: 'object',
          title: {
            en_US: 'Outbound Queue Rules',
            zh_Hans: '出站队列规则'
          },
          description: {
            en_US: 'Redis-backed delayed sending, rate limits, quiet hours, retry and pause protection.',
            zh_Hans: '基于 Redis 的延迟发送、限速、静默时段、重试和暂停保护。'
          },
          properties: {
            enabled: {
              type: 'boolean',
              title: {
                en_US: 'Enable Outbound Queue',
                zh_Hans: '启用出站队列'
              },
              default: true
            },
            initialDelayMs: {
              type: 'number',
              title: {
                en_US: 'Initial Delay (ms)',
                zh_Hans: '初始延迟（毫秒）'
              },
              default: 3000
            },
            globalMinIntervalMs: {
              type: 'number',
              title: {
                en_US: 'Global Min Interval (ms)',
                zh_Hans: '全局最小间隔（毫秒）'
              },
              description: {
                en_US: 'Minimum interval between any two outbound sends across this plugin queue.',
                zh_Hans: '该插件出站队列中任意两条消息成功发送之间的最小间隔。'
              },
              default: 3000
            },
            perAccountMinIntervalMs: {
              type: 'number',
              title: {
                en_US: 'Per Account Min Interval (ms)',
                zh_Hans: '单账号最小间隔（毫秒）'
              },
              default: 10000
            },
            perContactMinIntervalMs: {
              type: 'number',
              title: {
                en_US: 'Per Contact Min Interval (ms)',
                zh_Hans: '单联系人最小间隔（毫秒）'
              },
              default: 20000
            },
            perAccountMaxPerMinute: {
              type: 'number',
              title: {
                en_US: 'Per Account Max / Minute',
                zh_Hans: '单账号每分钟上限'
              },
              default: 6
            },
            perAccountMaxPerHour: {
              type: 'number',
              title: {
                en_US: 'Per Account Max / Hour',
                zh_Hans: '单账号每小时上限'
              },
              default: 80
            },
            perAccountMaxPerDay: {
              type: 'number',
              title: {
                en_US: 'Per Account Max / Day',
                zh_Hans: '单账号每日上限'
              },
              default: 500
            },
            perContactMaxPerHour: {
              type: 'number',
              title: {
                en_US: 'Per Contact Max / Hour',
                zh_Hans: '单联系人每小时上限'
              },
              default: 20
            },
            maxPendingPerAccount: {
              type: 'number',
              title: {
                en_US: 'Max Pending / Account',
                zh_Hans: '单账号最大积压'
              },
              default: 100
            },
            maxPendingPerContact: {
              type: 'number',
              title: {
                en_US: 'Max Pending / Contact',
                zh_Hans: '单联系人最大积压'
              },
              default: 20
            },
            maxAttempts: {
              type: 'number',
              title: {
                en_US: 'Max Attempts',
                zh_Hans: '最大重试次数'
              },
              default: 4
            }
          }
        }
      },
      required: [],
      secret: ['apiToken']
    }
  }

  async execute(_integration: IIntegration<TIntegrationWechatOptions>, _payload: TIntegrationStrategyParams): Promise<any> {
    return null
  }

  async validateConfig(
    config: TIntegrationWechatOptions,
    integration?: IIntegration<TIntegrationWechatOptions>
  ) {
    const connectionMode = normalizeWechatConnectionMode(config?.connectionMode)
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
    config.fallbackToLegacySendText = config.fallbackToLegacySendText !== false
    config.fallbackToLegacySendImage = config.fallbackToLegacySendImage !== false
    config.outboundQueue = {
      ...config.outboundQueue,
      enabled: config.outboundQueue?.enabled !== false
    }

    const apiBaseUrl = (process.env.API_BASE_URL || '').replace(/\/+$/, '')
    const integrationId = integration?.id || '<save_and_get_your_integration_id>'
    const webhookSecret = integration?.id ? await this.ensureWebhookSecret(integration.id, config) : null
    const secretForUrl = webhookSecret || '<webhook-secret>'
    const callbackUrl = `${apiBaseUrl}/api/wechat/webhook/${integrationId}?secret=${encodeURIComponent(secretForUrl)}`
    const redactedCallbackUrl = `${apiBaseUrl}/api/wechat/webhook/${integrationId}?secret=***`
    const setup = this.tunnelBroker.buildSetupConfig(config.tunnelClientId, integration?.name || WECHAT_PROVIDER_KEY)

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
        subscriptionHints: [...WECHAT_CALLBACK_HINTS]
      },
      tunnel: {
        clientId: config.tunnelClientId,
        forwardServerInfo: setup.forwardServerInfo,
        msgClientInfo: setup.msgClientInfo,
        settingJson: setup.settingJson
      }
    }
  }

  private async ensureWebhookSecret(
    integrationId: string,
    config: TIntegrationWechatOptions
  ): Promise<string | null> {
    const service = this.integrationPermissionService
    const ensureWebhookCredential = service?.ensureWebhookCredential
    if (typeof ensureWebhookCredential !== 'function') {
      return null
    }

    const result = await ensureWebhookCredential.call(service, integrationId, {
      provider: WECHAT_PROVIDER_KEY
    })
    const token = normalizeString(result?.token)
    if (result?.credential) {
      config.webhookCredential = result.credential
    }
    return token || null
  }
}
