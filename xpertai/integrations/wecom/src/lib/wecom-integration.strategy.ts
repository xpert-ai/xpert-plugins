import { IIntegration, TIntegrationProvider } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { IntegrationStrategy, IntegrationStrategyKey, TIntegrationStrategyParams } from '@xpert-ai/plugin-sdk'
import { iconImage, INTEGRATION_WECOM, TIntegrationWeComShortOptions } from './types.js'

export const WECOM_HTTP_SUBSCRIPTION_HINTS = [
  '企业微信机器人消息回调事件',
  'URL 校验请求（GET msg_signature/timestamp/nonce/echostr）',
  '消息推送回调（POST）'
] as const

@Injectable()
@IntegrationStrategyKey(INTEGRATION_WECOM)
export class WeComIntegrationStrategy implements IntegrationStrategy<TIntegrationWeComShortOptions> {
  readonly meta: TIntegrationProvider = {
    name: INTEGRATION_WECOM,
    label: {
      en_US: 'WeCom',
      zh_Hans: '企业微信-短连接'
    },
    icon: {
      type: 'image',
      value: iconImage
    },
    description: {
      en_US: 'Enterprise WeCom API callback integration for webhook verification and event reception.',
      zh_Hans: '企业微信 API 回调集成，用于 URL 校验与事件接收。'
    },
    webhook: true,
    schema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          title: {
            en_US: 'Token',
            zh_Hans: '回调 Token'
          },
          description: {
            en_US: 'Token configured in WeCom API mode.',
            zh_Hans: '企业微信 API 模式里配置的 Token。'
          },
          'x-ui': {
            component: 'password'
          }
        },
        encodingAesKey: {
          type: 'string',
          title: {
            en_US: 'EncodingAESKey',
            zh_Hans: 'EncodingAESKey'
          },
          description: {
            en_US: 'EncodingAESKey configured in WeCom API mode (43 chars).',
            zh_Hans: '企业微信 API 模式里配置的 EncodingAESKey（43 位）。'
          },
          'x-ui': {
            component: 'password'
          }
        },
        xpertId: {
          type: 'string',
          title: {
            en_US: 'Xpert',
            zh_Hans: '数字专家'
          },
          description: {
            en_US: 'Choose a corresponding digital expert',
            zh_Hans: '选择一个对应的数字专家'
          },
          'x-ui': {
            component: 'remoteSelect',
            selectUrl: '/api/xpert/select-options'
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
        timeoutMs: {
          type: 'number',
          title: {
            en_US: 'Request Timeout (ms)',
            zh_Hans: '请求超时（毫秒）'
          },
          description: {
            en_US: 'Optional timeout for outbound webhook calls.',
            zh_Hans: '可选，外发 webhook 请求超时。'
          }
        }
      },
      required: ['token', 'encodingAesKey'],
      secret: ['token', 'encodingAesKey']
    }
  }

  async execute(_integration: IIntegration<TIntegrationWeComShortOptions>, _payload: TIntegrationStrategyParams): Promise<any> {
    return null
  }

  async validateConfig(config: TIntegrationWeComShortOptions, integration?: IIntegration<TIntegrationWeComShortOptions>) {
    if (!config?.token?.trim()) {
      throw new Error('token is required')
    }

    const aesKey = config?.encodingAesKey?.trim()
    if (!aesKey) {
      throw new Error('encodingAesKey is required')
    }

    if (aesKey.length !== 43) {
      throw new Error('encodingAesKey must be 43 characters')
    }

    const apiBaseUrl = process.env.API_BASE_URL
    const integrationId = integration?.id || '<save_and_get_your_integration_id>'
    const callbackUrl = `${apiBaseUrl}/api/wecom/webhook/${integrationId}`

    return {
      webhookUrl: callbackUrl,
      callback: {
        mode: 'http',
        callbackUrl,
        signatureAlgorithm: 'sha1(sort(token,timestamp,nonce,encrypt))',
        encryptedAck: false,
        expectedAckMs: 1500,
        subscriptionHints: [...WECOM_HTTP_SUBSCRIPTION_HINTS]
      }
    }
  }
}
