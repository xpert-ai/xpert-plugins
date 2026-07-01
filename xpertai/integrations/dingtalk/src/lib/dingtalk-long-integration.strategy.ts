import { IIntegration } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { IntegrationStrategy, IntegrationStrategyKey, TIntegrationStrategyParams } from '@xpert-ai/plugin-sdk'
import { DingTalkLongConnectionService } from './dingtalk-long-connection.service.js'
import {
  DINGTALK_APP_CREDENTIALS_HELP_LABEL,
  DINGTALK_APP_CREDENTIALS_HELP_URL,
  iconImage,
  INTEGRATION_DINGTALK_LONG,
  resolveDingTalkConnectionMode,
  TDingTalkIntegrationProvider,
  TIntegrationDingTalkOptions
} from './types.js'

@Injectable()
@IntegrationStrategyKey(INTEGRATION_DINGTALK_LONG)
export class DingTalkLongIntegrationStrategy implements IntegrationStrategy<TIntegrationDingTalkOptions> {
  constructor(private readonly longConnection: DingTalkLongConnectionService) {}

  readonly meta: TDingTalkIntegrationProvider = {
    name: INTEGRATION_DINGTALK_LONG,
    label: {
      en_US: 'DingTalk (Stream Mode)',
      zh_Hans: '钉钉-Stream模式'
    },
    icon: {
      type: 'svg',
      value: iconImage
    },
    description: {
      en_US:
        'Recommended DingTalk Stream Mode integration for bot messages and card actions. No public HTTP callback URL is required.',
      zh_Hans:
        '推荐使用的钉钉机器人 Stream 模式集成，用于消息接收与卡片回调，无需公网 HTTP 回调地址。'
    },
    webhook: false,
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
              'Robot unique identifier for sending group/user messages via API. Get it from DingTalk Open Platform: App -> Robot -> 机器人的唯一标识.',
            zh_Hans:
              '用于通过 API 发送群/单聊消息的机器人唯一标识。从钉钉开放平台：应用 -> 机器人 -> 机器人的唯一标识 获取。'
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
        }
      },
      required: ['clientId', 'clientSecret'],
      secret: ['clientSecret']
    }
  }

  async execute(_integration: IIntegration<TIntegrationDingTalkOptions>, _payload: TIntegrationStrategyParams): Promise<any> {
    return null
  }

  async onUpdate(
    previous: IIntegration<TIntegrationDingTalkOptions>,
    current: IIntegration<TIntegrationDingTalkOptions>
  ): Promise<void> {
    const wasLongConnection = resolveDingTalkConnectionMode(previous.options, previous.provider) === 'long_connection'
    const isLongConnection = resolveDingTalkConnectionMode(current.options, current.provider) === 'long_connection'

    if (wasLongConnection && !isLongConnection) {
      await this.longConnection.disconnect(previous.id)
      return
    }

    if (isLongConnection) {
      await this.longConnection.reconnect(current.id)
    }
  }

  async onDelete(integration: IIntegration<TIntegrationDingTalkOptions>): Promise<void> {
    if (resolveDingTalkConnectionMode(integration.options, integration.provider) === 'long_connection') {
      await this.longConnection.disconnect(integration.id)
    }
  }

  async validateConfig(config: TIntegrationDingTalkOptions): Promise<any> {
    if (!config?.clientId) {
      throw new Error('clientId is required')
    }

    if (!config?.clientSecret) {
      throw new Error('clientSecret is required')
    }

    const probe = await this.longConnection.probeConfig(config)
    return {
      mode: 'long_connection',
      stream: {
        mode: 'long_connection',
        subscriptions: [
          '/v1.0/im/bot/messages/get',
          '/v1.0/card/instances/callback'
        ],
        probe: {
          connected: probe.connected,
          state: probe.state,
          lastError: probe.lastError ?? null,
          checkedAt: probe.checkedAt
        }
      }
    }
  }
}
