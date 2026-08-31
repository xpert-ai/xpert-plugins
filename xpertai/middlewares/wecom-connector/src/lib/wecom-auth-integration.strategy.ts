import type { I18nObject, IIntegration, TIntegrationProvider } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  IntegrationStrategyKey,
  type IntegrationStrategy,
  type IntegrationTestResult,
  type TIntegrationStrategyParams
} from '@xpert-ai/plugin-sdk'
import { WECOM_AUTH_INTEGRATION_PROVIDER, WECOM_CONNECTOR_ICON, type WeComAuthIntegrationOptions } from './types.js'

@Injectable()
@IntegrationStrategyKey(WECOM_AUTH_INTEGRATION_PROVIDER)
export class WeComAuthIntegrationStrategy implements IntegrationStrategy<WeComAuthIntegrationOptions> {
  readonly meta: TIntegrationProvider = {
    name: WECOM_AUTH_INTEGRATION_PROVIDER,
    label: i18n('WeCom AI Bot credentials', '企业微信智能机器人凭据'),
    description: i18n(
      'Bot ID and Secret used by the WeCom connector and the official WeCom CLI.',
      '供企业微信连接器和官方企业微信 CLI 使用的 Bot ID 与 Secret。'
    ),
    icon: { type: 'svg', value: WECOM_CONNECTOR_ICON },
    helpUrl: 'https://developer.work.weixin.qq.com/document/path/101463',
    helpLabel: i18n('Open WeCom AI Bot documentation', '打开企业微信智能机器人文档'),
    schema: {
      type: 'object',
      properties: {
        botId: {
          type: 'string',
          title: i18n('Bot ID', 'Bot ID'),
          description: i18n('Bot ID from the WeCom AI Bot configuration.', '企业微信智能机器人配置中的 Bot ID。')
        },
        botSecret: {
          type: 'string',
          title: i18n('Secret', 'Secret'),
          description: i18n('Secret from the WeCom AI Bot configuration.', '企业微信智能机器人配置中的 Secret。'),
          'x-ui': { component: 'password' as const }
        }
      },
      required: ['botId', 'botSecret'],
      secret: ['botSecret']
    }
  }

  async execute(
    _integration: IIntegration<WeComAuthIntegrationOptions>,
    _payload: TIntegrationStrategyParams
  ): Promise<null> {
    return null
  }

  async validateConfig(config: WeComAuthIntegrationOptions): Promise<IntegrationTestResult> {
    required(config?.botId, 'WeCom AI Bot ID is required.')
    required(config?.botSecret, 'WeCom AI Bot Secret is required.')
    return {
      mode: 'wecom-ai-bot',
      probe: { state: 'configured', checkedAt: Date.now() }
    }
  }
}

function i18n(en_US: string, zh_Hans: string): I18nObject {
  return { en_US, zh_Hans }
}

function required(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message)
  return value.trim()
}
