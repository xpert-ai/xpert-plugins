import {
  IntegrationFeatureEnum,
  type I18nObject,
  type IIntegration,
  type TIntegrationProvider
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  IntegrationStrategyKey,
  type IntegrationStrategy,
  type IntegrationTestResult,
  type TIntegrationStrategyParams
} from '@xpert-ai/plugin-sdk'
import { DINGTALK_SSO_CALLBACK_PATH, DINGTALK_SSO_PROVIDER } from './types.js'
import { DingTalkSsoSecretService } from './dingtalk-sso-secret.service.js'
import type { DingTalkSsoIntegrationOptions } from './types.js'

@Injectable()
@IntegrationStrategyKey(DINGTALK_SSO_PROVIDER)
export class DingTalkSsoIntegrationStrategy implements IntegrationStrategy<DingTalkSsoIntegrationOptions> {
  constructor(
    private readonly configService: ConfigService,
    private readonly secretService: DingTalkSsoSecretService
  ) {}

  readonly meta: TIntegrationProvider = {
    name: DINGTALK_SSO_PROVIDER,
    label: i18n('DingTalk OAuth Sign-in', '钉钉 OAuth 登录'),
    description: i18n(
      'Use a tenant-owned DingTalk OAuth application for Xpert sign-in.',
      '使用租户自有的钉钉 OAuth 应用登录 Xpert。'
    ),
    icon: { type: 'image', value: '/assets/images/destinations/dingtalk.png' },
    helpUrl: 'https://open.dingtalk.com/document/orgapp/tutorial-obtaining-user-personal-information',
    features: [IntegrationFeatureEnum.SSO],
    schema: {
      type: 'object',
      properties: {
        clientId: {
          type: 'string',
          title: i18n('Client ID (AppKey)', '客户端 ID（AppKey）'),
          description: i18n('Client ID or AppKey of the DingTalk application.', '钉钉应用的 Client ID 或 AppKey。')
        },
        clientSecret: {
          type: 'string',
          title: i18n('Client Secret (AppSecret)', '客户端密钥（AppSecret）'),
          description: i18n('Client secret or AppSecret of the DingTalk application.', '钉钉应用的 Client Secret 或 AppSecret。'),
          'x-ui': { component: 'secretInput', revealable: true, maskSymbol: '*', persist: true }
        }
      },
      required: ['clientId', 'clientSecret'],
      secret: ['clientSecret']
    }
  }

  async execute(_integration: IIntegration<DingTalkSsoIntegrationOptions>, _payload: TIntegrationStrategyParams): Promise<null> {
    return null
  }

  async validateConfig(config: DingTalkSsoIntegrationOptions): Promise<IntegrationTestResult> {
    const clientId = required(config?.clientId, 'DingTalk OAuth Client ID is required.')
    const clientSecret = required(config?.clientSecret, 'DingTalk OAuth Client Secret is required.')
    const options = { clientId, clientSecret: this.secretService.encrypt(clientSecret) }
    const clientBaseUrl = this.configService.get<string>('clientBaseUrl')?.trim()
    if (!clientBaseUrl) {
      return {
        mode: 'oauth_app',
        callbackUrl: DINGTALK_SSO_CALLBACK_PATH,
        options,
        warnings: ['The host clientBaseUrl is not configured. Prefix the callback path with the public Xpert origin.']
      }
    }
    return { mode: 'oauth_app', callbackUrl: new URL(DINGTALK_SSO_CALLBACK_PATH, clientBaseUrl).toString(), options }
  }
}

function i18n(en_US: string, zh_Hans: string): I18nObject {
  return { en_US, zh_Hans }
}

function required(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message)
  return value.trim()
}
