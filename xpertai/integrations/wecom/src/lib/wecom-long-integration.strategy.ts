import { IIntegration, TIntegrationProvider } from '@metad/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { IntegrationStrategy, IntegrationStrategyKey, TIntegrationStrategyParams } from '@xpert-ai/plugin-sdk'
import {
  iconImage,
  INTEGRATION_WECOM_LONG,
  TIntegrationWeComLongOptions
} from './types.js'
import { WeComLongConnectionService } from './wecom-long-connection.service.js'

@Injectable()
@IntegrationStrategyKey(INTEGRATION_WECOM_LONG)
export class WeComLongIntegrationStrategy implements IntegrationStrategy<TIntegrationWeComLongOptions> {
  private readonly logger = new Logger(WeComLongIntegrationStrategy.name)

  constructor(private readonly longConnection: WeComLongConnectionService) {}

  readonly meta: TIntegrationProvider = {
    name: INTEGRATION_WECOM_LONG,
    label: {
      en_US: 'WeCom (Long Connection)',
      zh_Hans: '企业微信-长连接'
    },
    icon: {
      type: 'image',
      value: iconImage
    },
    description: {
      en_US: 'WeCom AI Bot websocket mode (aibot_subscribe / aibot_msg_callback).',
      zh_Hans: '企业微信智能机器人 WebSocket 长连接模式（aibot_subscribe / aibot_msg_callback）。'
    },
    webhook: false,
    schema: {
      type: 'object',
      properties: {
        botId: {
          type: 'string',
          title: {
            en_US: 'Bot ID',
            zh_Hans: 'Bot ID'
          },
          description: {
            en_US: 'Bot ID from WeCom AI bot API mode (long connection).',
            zh_Hans: '企业微信智能机器人 API 长连接模式中的 Bot ID。'
          }
        },
        secret: {
          type: 'string',
          title: {
            en_US: 'Secret',
            zh_Hans: 'Secret'
          },
          description: {
            en_US: 'Long-connection secret for aibot_subscribe.',
            zh_Hans: '用于 aibot_subscribe 的长连接 Secret。'
          },
          'x-ui': {
            component: 'password'
          }
        },
        wsOrigin: {
          type: 'string',
          title: {
            en_US: 'WebSocket Origin',
            zh_Hans: 'WebSocket Origin'
          },
          description: {
            en_US: 'Optional. Set Origin header for websocket handshake compatibility.',
            zh_Hans: '可选。为 WebSocket 握手设置 Origin 头（用于兼容部分网络策略）。'
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
            en_US: 'Optional timeout for websocket command ack waiting.',
            zh_Hans: '可选，WebSocket 命令等待 ack 的超时时间。'
          }
        }
      },
      required: ['botId', 'secret'],
      secret: ['secret']
    }
  }

  async execute(_integration: IIntegration<TIntegrationWeComLongOptions>, _payload: TIntegrationStrategyParams): Promise<any> {
    return null
  }

  async onUpdate(
    previous: IIntegration<TIntegrationWeComLongOptions>,
    current: IIntegration<TIntegrationWeComLongOptions>
  ): Promise<void> {
    const wasLongConnection = previous.provider === INTEGRATION_WECOM_LONG
    const isStillLongConnection = current.provider === INTEGRATION_WECOM_LONG

    if (wasLongConnection && !isStillLongConnection) {
      await this.longConnection.disconnect(previous.id, {
        clearStatus: true
      })
      return
    }

    if (!isStillLongConnection) {
      return
    }

    const previousEnabled = this.isEnabled(previous)
    const currentEnabled = this.isEnabled(current)
    const previousHasRoutingTarget = await this.longConnection.hasRoutingTarget({
      integrationId: previous.id
    })
    const currentHasRoutingTarget = await this.longConnection.hasRoutingTarget({
      integrationId: current.id
    })

    if (!currentEnabled) {
      await this.longConnection.disconnect(current.id, {
        reason: 'integration_disabled'
      })
      return
    }

    if (!currentHasRoutingTarget) {
      await this.longConnection.disconnect(current.id, {
        reason: 'xpert_unbound'
      })
      return
    }

    if (!previousEnabled || !previousHasRoutingTarget) {
      await this.longConnection.reconnect(current.id)
    }
  }

  async onDelete(integration: IIntegration<TIntegrationWeComLongOptions>): Promise<void> {
    if (integration.provider !== INTEGRATION_WECOM_LONG) {
      return
    }

    await this.longConnection.disconnect(integration.id, {
      clearStatus: true
    })
  }

  async validateConfig(
    config: TIntegrationWeComLongOptions,
    integration?: IIntegration<TIntegrationWeComLongOptions>
  ) {
    if (!config?.botId?.trim()) {
      throw new Error('botId is required')
    }
    if (!config?.secret?.trim()) {
      throw new Error('secret is required')
    }

    const integrationId = integration?.id?.trim()
    if (integrationId) {
      try {
        const enabled = this.isEnabled(integration)
        const hasRoutingTarget = await this.longConnection.hasRoutingTarget({
          integrationId
        })

        if (!enabled) {
          await this.longConnection.disconnect(integrationId, {
            reason: 'integration_disabled'
          })
        } else if (!hasRoutingTarget) {
          await this.longConnection.disconnect(integrationId, {
            reason: 'xpert_unbound'
          })
        } else {
          await this.longConnection.connectWithConfig({
            integrationId,
            botId: config.botId,
            secret: config.secret,
            wsOrigin: config.wsOrigin,
            timeoutMs: config.timeoutMs
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.logger.warn(`[wecom-long] auto connect on save failed integration=${integrationId}: ${message}`)
      }
    }

    return {
      webhookUrl: 'wss://openws.work.weixin.qq.com',
      websocketUrl: 'wss://openws.work.weixin.qq.com',
      mode: 'long_connection'
    }
  }

  private isEnabled(integration?: IIntegration<TIntegrationWeComLongOptions> | null): boolean {
    if (!integration || typeof integration !== 'object') {
      return true
    }
    return (integration as unknown as Record<string, unknown>).enabled !== false
  }
}
