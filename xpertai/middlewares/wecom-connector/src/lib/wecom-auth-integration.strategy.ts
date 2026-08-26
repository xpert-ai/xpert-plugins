import type { I18nObject, TIntegrationProvider } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { IntegrationStrategy, IntegrationStrategyKey, type IntegrationTestResult } from '@xpert-ai/plugin-sdk'
import { WECOM_AUTH_INTEGRATION_PROVIDER, WECOM_CONNECTOR_ICON, type WeComConnectorAppCredentials } from './types.js'

@Injectable()
@IntegrationStrategyKey(WECOM_AUTH_INTEGRATION_PROVIDER)
export class WeComAuthIntegrationStrategy implements IntegrationStrategy<WeComConnectorAppCredentials> {
  readonly meta: TIntegrationProvider = {
    name: WECOM_AUTH_INTEGRATION_PROVIDER,
    label: i18n('WeCom Connector OAuth', '企业微信连接器认证'),
    description: i18n(
      'Tenant- or organization-level WeCom application credentials used by the workspace QR connector.',
      '供工作区企业微信连接器扫码授权使用的租户级或组织级企业微信应用凭证。'
    ),
    icon: { type: 'image', value: WECOM_CONNECTOR_ICON },
    helpUrl: 'https://developer.work.weixin.qq.com/document/path/97291',
    schema: {
      type: 'object',
      properties: {
        corpId: {
          type: 'string',
          title: i18n('CorpID', 'CorpID'),
          description: i18n('The WeCom enterprise ID.', '企业微信的企业 ID。')
        },
        agentId: {
          type: 'string',
          title: i18n('Agent ID', 'Agent ID'),
          description: i18n(
            'The AgentID of the WeCom application used for QR login.',
            '用于扫码登录的企业微信应用 AgentID。'
          )
        },
        corpSecret: {
          type: 'string',
          title: i18n('CorpSecret', 'CorpSecret'),
          description: i18n(
            'The application secret used to exchange the QR login code.',
            '用于换取扫码登录 code 的应用 Secret。'
          ),
          'x-ui': { component: 'secretInput', revealable: true, maskSymbol: '*', persist: true }
        }
      },
      required: ['corpId', 'agentId', 'corpSecret'],
      secret: ['corpSecret']
    }
  }

  async execute(): Promise<null> {
    return null
  }

  async validateConfig(config: WeComConnectorAppCredentials): Promise<IntegrationTestResult> {
    const corpId = required(config?.corpId, 'WeCom CorpID is required.')
    const agentId = required(config?.agentId, 'WeCom AgentID is required.')
    const corpSecret = required(config?.corpSecret, 'WeCom CorpSecret is required.')
    return { mode: 'oauth_app', options: { corpId, agentId, corpSecret } }
  }
}

function i18n(en_US: string, zh_Hans: string): I18nObject {
  return { en_US, zh_Hans }
}

function required(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message)
  return value.trim()
}
