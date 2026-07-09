import { IIntegration, TIntegrationProvider } from '@xpert-ai/contracts'
import { Inject, Injectable, Logger } from '@nestjs/common'
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
  DEFAULT_INBOUND_FILE_MAX_SIZE_MB,
  DEFAULT_OUTBOUND_QUEUE_OPTIONS,
  MAX_INBOUND_FILE_MAX_SIZE_MB,
  normalizeInboundFileRules,
  normalizeApiVersion,
  normalizeBaseUrl,
  normalizeString,
  normalizeTimeoutMs,
  normalizeWechatConnectionMode,
  TIntegrationWechatOptions
} from './types.js'
import { buildWechatSidecarRuntimeConfig, WechatTunnelBrokerService } from './wechat-tunnel-broker.service.js'
import { WECHAT_PLUGIN_CONTEXT } from './tokens.js'

export const WECHAT_CALLBACK_HINTS = [
  '推荐：wx2.0 config webhook.allMessagePushUrl / AllMsgPushUrl 指向 Xpert webhook URL',
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
  private readonly logger = new Logger(WechatIntegrationStrategy.name)
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
        agentCallbackIntermediateTextEnabled: {
          type: 'boolean',
          title: {
            en_US: 'Send Intermediate Agent Messages',
            zh_Hans: '发送 Agent 中间消息'
          },
          description: {
            en_US: 'When enabled, visible assistant messages produced before tool calls are sent to WeChat before the final reply.',
            zh_Hans: '开启后，Agent 工具调用前已经生成的可见消息会先作为微信消息发送。'
          },
          default: false
        },
        inboundFileRules: {
          type: 'object',
          title: {
            en_US: 'Inbound File Rules',
            zh_Hans: '入站文件规则'
          },
          description: {
            en_US: 'Rules applied to inbound WeChat file messages before downloading and workspace upload.',
            zh_Hans: '微信文件消息下载和上传 workspace 前应用的规则。'
          },
          properties: {
            maxSizeMb: {
              type: 'number',
              title: {
                en_US: 'Max File Size (MiB)',
                zh_Hans: '最大文件大小（MiB）'
              },
              description: {
                en_US: 'Files larger than this value are skipped before agent dispatch.',
                zh_Hans: '超过该大小的文件会被跳过，不进入 Agent。'
              },
              minimum: 1,
              maximum: MAX_INBOUND_FILE_MAX_SIZE_MB,
              default: DEFAULT_INBOUND_FILE_MAX_SIZE_MB
            }
          },
          default: {
            maxSizeMb: DEFAULT_INBOUND_FILE_MAX_SIZE_MB
          }
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
            initialDelayMs: {
              type: 'number',
              title: {
                en_US: 'Initial Delay (ms)',
                zh_Hans: '初始延迟（毫秒）'
              },
              default: DEFAULT_OUTBOUND_QUEUE_OPTIONS.initialDelayMs
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
              default: DEFAULT_OUTBOUND_QUEUE_OPTIONS.globalMinIntervalMs
            },
            perAccountMinIntervalMs: {
              type: 'number',
              title: {
                en_US: 'Per Account Min Interval (ms)',
                zh_Hans: '单账号最小间隔（毫秒）'
              },
              default: DEFAULT_OUTBOUND_QUEUE_OPTIONS.perAccountMinIntervalMs
            },
            perContactMinIntervalMs: {
              type: 'number',
              title: {
                en_US: 'Per Contact Min Interval (ms)',
                zh_Hans: '单联系人最小间隔（毫秒）'
              },
              default: DEFAULT_OUTBOUND_QUEUE_OPTIONS.perContactMinIntervalMs
            },
            perAccountMaxPerMinute: {
              type: 'number',
              title: {
                en_US: 'Per Account Max / Minute',
                zh_Hans: '单账号每分钟上限'
              },
              default: DEFAULT_OUTBOUND_QUEUE_OPTIONS.perAccountMaxPerMinute
            },
            perAccountMaxPerHour: {
              type: 'number',
              title: {
                en_US: 'Per Account Max / Hour',
                zh_Hans: '单账号每小时上限'
              },
              default: DEFAULT_OUTBOUND_QUEUE_OPTIONS.perAccountMaxPerHour
            },
            perAccountMaxPerDay: {
              type: 'number',
              title: {
                en_US: 'Per Account Max / Day',
                zh_Hans: '单账号每日上限'
              },
              default: DEFAULT_OUTBOUND_QUEUE_OPTIONS.perAccountMaxPerDay
            },
            perContactMaxPerHour: {
              type: 'number',
              title: {
                en_US: 'Per Contact Max / Hour',
                zh_Hans: '单联系人每小时上限'
              },
              default: DEFAULT_OUTBOUND_QUEUE_OPTIONS.perContactMaxPerHour
            },
            maxPendingPerAccount: {
              type: 'number',
              title: {
                en_US: 'Max Pending / Account',
                zh_Hans: '单账号最大积压'
              },
              default: DEFAULT_OUTBOUND_QUEUE_OPTIONS.maxPendingPerAccount
            },
            maxPendingPerContact: {
              type: 'number',
              title: {
                en_US: 'Max Pending / Contact',
                zh_Hans: '单联系人最大积压'
              },
              default: DEFAULT_OUTBOUND_QUEUE_OPTIONS.maxPendingPerContact
            },
            maxAttempts: {
              type: 'number',
              title: {
                en_US: 'Max Attempts',
                zh_Hans: '最大重试次数'
              },
              default: DEFAULT_OUTBOUND_QUEUE_OPTIONS.maxAttempts
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

  async onUpdate(
    previous: IIntegration<TIntegrationWechatOptions>,
    current: IIntegration<any>
  ): Promise<void> {
    const currentClientIds = new Set(this.getRuntimeTunnelClientIds(current))
    for (const previousClientId of this.getDisconnectableTunnelClientIds(previous)) {
      if (currentClientIds.has(previousClientId)) {
        continue
      }
      this.disconnectTunnelClient(
        previousClientId,
        `wechat integration ${previous.id} tunnel client id changed`
      )
    }
  }

  async onDelete(integration: IIntegration<TIntegrationWechatOptions>): Promise<void> {
    for (const clientId of this.getDisconnectableTunnelClientIds(integration)) {
      this.disconnectTunnelClient(clientId, `wechat integration ${integration.id} deleted`)
    }
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
    }
    delete config.tunnelClientId

    config.apiVersion = normalizeApiVersion(config.apiVersion)
    config.timeoutMs = normalizeTimeoutMs(config.timeoutMs)
    config.agentCallbackIntermediateTextEnabled = config.agentCallbackIntermediateTextEnabled === true
    config.fallbackToLegacySendText = config.fallbackToLegacySendText !== false
    config.fallbackToLegacySendImage = config.fallbackToLegacySendImage !== false
    config.inboundFileRules = normalizeInboundFileRules(config.inboundFileRules)
    config.outboundQueue = {
      ...config.outboundQueue,
      enabled: true
    }

    const apiBaseUrl = (process.env.API_BASE_URL || '').replace(/\/+$/, '')
    const integrationId = integration?.id || '<save_and_get_your_integration_id>'
    const webhookSecret = integration?.id ? await this.ensureWebhookSecret(integration.id, config) : null
    const secretForUrl = webhookSecret || '<webhook-secret>'
    const callbackUrl = `${apiBaseUrl}/api/wechat/webhook/${integrationId}?secret=${encodeURIComponent(secretForUrl)}`
    const tunnelClientId = this.getPreviewTunnelClientId(integration)
    const setup = this.tunnelBroker.buildSetupConfig(tunnelClientId, integration?.name || tunnelClientId || WECHAT_PROVIDER_KEY)
    const sidecarConfig = buildWechatSidecarRuntimeConfig(setup, callbackUrl)
    const sidecarConfigJson = JSON.stringify(sidecarConfig, null, 2)

    return {
      webhookUrl: callbackUrl,
      callback: {
        mode: 'http',
        callbackUrl,
        globalWebhookConfigKeys: ['webhook.allMessagePushUrl', 'AllMsgPushUrl'],
        expectedAckMs: 1500,
        subscriptionHints: [...WECHAT_CALLBACK_HINTS]
      },
      tunnel: {
        clientId: tunnelClientId,
        forwardServerInfo: setup.forwardServerInfo,
        msgClientInfo: setup.msgClientInfo,
        settingJson: sidecarConfigJson,
        sidecarConfig,
        sidecarConfigJson
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

  private getRuntimeTunnelClientIds(integration?: IIntegration<TIntegrationWechatOptions> | null): string[] {
    const options = integration?.options
    if (normalizeWechatConnectionMode(options?.connectionMode) !== 'reverse_tunnel') {
      return []
    }
    const clientId = normalizeString(integration?.id)
    return clientId ? [clientId] : []
  }

  private getDisconnectableTunnelClientIds(integration?: IIntegration<TIntegrationWechatOptions> | null): string[] {
    if (normalizeWechatConnectionMode(integration?.options?.connectionMode) !== 'reverse_tunnel') {
      return []
    }
    const ids = new Set(this.getRuntimeTunnelClientIds(integration))
    const legacyClientId = normalizeString(integration?.options?.tunnelClientId)
    if (legacyClientId) {
      ids.add(legacyClientId)
    }
    return [...ids]
  }

  private getPreviewTunnelClientId(integration?: IIntegration<TIntegrationWechatOptions> | null): string {
    return normalizeString(integration?.id) || '<save_and_get_your_integration_id>'
  }

  private disconnectTunnelClient(clientId: string, reason: string): void {
    const disconnected = this.tunnelBroker.disconnectClient(clientId, reason)
    if (disconnected) {
      this.logger.log(`[wechat-tunnel] disconnected client "${clientId}": ${reason}`)
    }
  }
}
