import { Injectable, Logger } from '@nestjs/common'
import { IIntegration } from '@xpert-ai/contracts'
import { IntegrationStrategy, IntegrationStrategyKey, TIntegrationStrategyParams } from '@xpert-ai/plugin-sdk'
import axios, { AxiosError } from 'axios'
import {
  DINGTALK_APP_CREDENTIALS_HELP_LABEL,
  DINGTALK_APP_CREDENTIALS_HELP_URL,
  iconImage,
  INTEGRATION_DINGTALK,
  resolveDingTalkHttpCallbackEnabled,
  TDingTalkIntegrationProvider,
  TIntegrationDingTalkOptions
} from './types.js'

export const DINGTALK_HTTP_SUBSCRIPTION_HINTS = [
  '机器人接收消息事件',
  '机器人卡片回调事件',
  '机器人会话变更相关事件（按需）'
] as const

@Injectable()
@IntegrationStrategyKey(INTEGRATION_DINGTALK)
export class DingTalkIntegrationStrategy implements IntegrationStrategy<TIntegrationDingTalkOptions> {
  private readonly logger = new Logger(DingTalkIntegrationStrategy.name)

  meta: TDingTalkIntegrationProvider = {
    name: INTEGRATION_DINGTALK,
    label: {
      en_US: 'DingTalk (HTTP Mode)',
      zh_Hans: '钉钉-HTTP模式'
    },
    icon: {
      type: 'svg',
      value: iconImage
    },
    description: {
      en_US:
        'DingTalk HTTP Mode callback integration for bot messages and card actions. Use only when Stream Mode is unavailable.',
      zh_Hans:
        '钉钉机器人 HTTP 模式回调集成，用于消息接收与卡片回调。仅在无法使用 Stream 模式时使用。'
    },
    webhook: true,
    helpUrl: DINGTALK_APP_CREDENTIALS_HELP_URL,
    helpLabel: DINGTALK_APP_CREDENTIALS_HELP_LABEL,
    schema: {
      type: 'object',
      properties: {
        clientId: {
          type: 'string',
          title: {
            en_US: 'Client ID (AppKey)',
            zh_Hans: 'Client ID（AppKey）'
          },
          description: {
            en_US: 'DingTalk appKey. Same value as Client ID.',
            zh_Hans: '钉钉应用的 appKey，与 Client ID 相同。'
          }
        },
        clientSecret: {
          type: 'string',
          title: {
            en_US: 'Client Secret',
            zh_Hans: 'Client Secret'
          },
          'x-ui': {
            component: 'password'
          }
        },
        robotCode: {
          type: 'string',
          title: {
            en_US: 'Robot Code',
            zh_Hans: '机器人编码'
          },
          description: {
            en_US:
              'Robot unique identifier for sending group/user messages via API. Get it from DingTalk Open Platform: App → Robot → 机器人的唯一标识. Not the "robotCode" value in callback payload (e.g. "normal"). Leave empty to rely on sessionWebhook cache for in-session replies.',
            zh_Hans:
              '用于通过 API 发送群/单聊消息的机器人唯一标识。从钉钉开放平台：应用 → 机器人 → 机器人的唯一标识 获取。不是回调体里的 robotCode（如 "normal"）。留空则仅依赖会话内 sessionWebhook 缓存回复。'
          }
        },
        preferLanguage: {
          type: 'string',
          title: {
            en_US: 'Preferred Language',
            zh_Hans: '首选语言'
          },
          enum: ['en', 'zh-Hans'],
          'x-ui': {
            enumLabels: {
              en: { en_US: 'English', zh_Hans: '英语' },
              'zh-Hans': { en_US: 'Chinese', zh_Hans: '中文' }
            }
          }
        },
        callbackToken: {
          type: 'string',
          title: {
            en_US: 'Callback Token',
            zh_Hans: '回调 Token'
          },
          description: {
            en_US: 'Used to verify callback signature from DingTalk',
            zh_Hans: '用于校验钉钉 HTTP 回调签名'
          },
          'x-ui': {
            component: 'password'
          }
        },
        callbackAesKey: {
          type: 'string',
          title: {
            en_US: 'Callback AES Key',
            zh_Hans: '回调 AES Key'
          },
          description: {
            en_US: 'Used to decrypt callback encrypt payload',
            zh_Hans: '用于解密钉钉 HTTP 回调加密体'
          },
          'x-ui': {
            component: 'password'
          }
        },
      },
      required: ['clientId', 'clientSecret'],
      secret: ['clientSecret', 'callbackToken', 'callbackAesKey']
    }
  }

  async execute(_integration: IIntegration<TIntegrationDingTalkOptions>, _payload: TIntegrationStrategyParams): Promise<any> {
    return null
  }

  async validateConfig(
    config: TIntegrationDingTalkOptions,
    integration?: IIntegration<TIntegrationDingTalkOptions>
  ): Promise<any> {
    if (!config?.clientId) {
      throw new Error('clientId is required')
    }

    if (!config?.clientSecret) {
      throw new Error('clientSecret is required')
    }

    const httpCallbackEnabled = resolveDingTalkHttpCallbackEnabled(config, INTEGRATION_DINGTALK)

    if (!httpCallbackEnabled) {
      throw new Error('HTTP callback is required for DingTalk HTTP mode')
    }

    if (httpCallbackEnabled && !config.callbackToken) {
      throw new Error('callbackToken is required for DingTalk HTTP mode')
    }
    if (httpCallbackEnabled && !config.callbackAesKey) {
      throw new Error('callbackAesKey is required for DingTalk HTTP mode')
    }
    try {
      const baseUrl = config.apiBaseUrl || 'https://api.dingtalk.com'
      const tokenResponse = await axios.post(
        `${baseUrl}/v1.0/oauth2/accessToken`,
        {
          appKey: config.clientId,
          appSecret: config.clientSecret
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        }
      )

      if (!tokenResponse?.data?.accessToken) {
        throw new Error('Failed to get access token from DingTalk API')
      }

      const apiBaseUrl = process.env.API_BASE_URL
      const integrationId = integration?.id || '<save_and_get_your_integration_id>'
      const callbackUrl = `${apiBaseUrl}/api/dingtalk/webhook/${integrationId}`
      const result: Record<string, unknown> = {
        mode: 'webhook'
      }

      if (httpCallbackEnabled) {
        result.webhookUrl = callbackUrl
        result.callback = {
          mode: 'http',
          callbackUrl,
          signatureAlgorithm: 'sha1(sort(token,timestamp,nonce,encrypt))',
          encryptedAck: true,
          expectedAckMs: 1500,
          subscriptionHints: [...DINGTALK_HTTP_SUBSCRIPTION_HINTS]
        }
      }

      return result
    } catch (error: any) {
      const axiosError = error as AxiosError<{ code?: number; msg?: string; message?: string }>
      const message =
        axiosError?.response?.data?.msg ||
        axiosError?.response?.data?.message ||
        axiosError?.message ||
        'Unknown error'
      this.logger.error('DingTalk connection test failed:', error)
      throw new Error(`DingTalk API connection failed: ${message}`)
    }
  }
}
