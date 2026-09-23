import type { I18nObject, IIntegration, TIntegrationProvider } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  IntegrationStrategyKey,
  type IntegrationStrategy,
  type IntegrationTestResult,
  type TIntegrationStrategyParams
} from '@xpert-ai/plugin-sdk'
import { DINGTALK_CONNECTOR_ICON } from './branding.js'
import { DINGTALK_CONNECTOR_INTEGRATION_PROVIDER } from './constants.js'
import { DingTalkConnectorSecretService } from './dingtalk-connector-secret.service.js'

export type DingTalkConnectorIntegrationOptions = {
  clientId?: string
  clientSecret?: string
  robotCode?: string
}

@Injectable()
@IntegrationStrategyKey(DINGTALK_CONNECTOR_INTEGRATION_PROVIDER)
export class DingTalkConnectorIntegrationStrategy implements IntegrationStrategy<DingTalkConnectorIntegrationOptions> {
  constructor(private readonly secretService: DingTalkConnectorSecretService) {}

  readonly meta: TIntegrationProvider = {
    name: DINGTALK_CONNECTOR_INTEGRATION_PROVIDER,
    label: i18n('DingTalk Connector OAuth', '钉钉连接器 OAuth'),
    description: i18n(
      'Organization-level DingTalk OAuth application credentials are preferred; the tenant integration is used as a fallback. Robot Code is optional.',
      '优先使用组织级钉钉 OAuth 应用凭据；没有可用组织配置时使用租户级配置。机器人编码为可选项。'
    ),
    icon: DINGTALK_CONNECTOR_ICON,
    helpUrl: 'https://open.dingtalk.com/document/orgapp/tutorial-obtaining-user-personal-information',
    schema: {
      type: 'object',
      properties: {
        clientId: {
          type: 'string',
          title: i18n('Client ID (AppKey)', '客户端 ID（AppKey）'),
          description: i18n(
            'Client ID or AppKey of the DingTalk application configured for the current tenant or organization.',
            '当前租户或组织配置的钉钉应用 Client ID 或 AppKey。'
          )
        },
        clientSecret: {
          type: 'string',
          title: i18n('Client Secret (AppSecret)', '客户端密钥（AppSecret）'),
          description: i18n(
            'Client secret or AppSecret of the DingTalk application.',
            '钉钉应用的 Client Secret 或 AppSecret。'
          ),
          'x-ui': { component: 'secretInput', revealable: true, maskSymbol: '*', persist: true }
        },
        robotCode: {
          type: 'string',
          title: i18n('Robot Code', '机器人编码'),
          description: i18n(
            'Optional. Required by DingTalk CLI bot messaging commands. Find it in DingTalk Open Platform under Application > Robot.',
            '可选。使用钉钉 CLI 的机器人消息命令时必填，可在钉钉开放平台的“应用 > 机器人”中获取。'
          )
        }
      },
      required: ['clientId', 'clientSecret'],
      secret: ['clientSecret']
    }
  }

  async execute(_integration: IIntegration<DingTalkConnectorIntegrationOptions>, _payload: TIntegrationStrategyParams) {
    void _integration
    void _payload
    return null
  }

  async validateConfig(config: DingTalkConnectorIntegrationOptions): Promise<IntegrationTestResult> {
    const clientId = required(config?.clientId, 'DingTalk OAuth Client ID is required.')
    const clientSecret = required(config?.clientSecret, 'DingTalk OAuth Client Secret is required.')
    const robotCode = optional(config?.robotCode)
    return {
      mode: 'oauth_app',
      options: {
        clientId,
        clientSecret: this.secretService.encrypt(clientSecret),
        ...(robotCode ? { robotCode } : {})
      }
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

function optional(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
