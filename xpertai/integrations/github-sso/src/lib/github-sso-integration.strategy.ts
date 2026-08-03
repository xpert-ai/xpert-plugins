import {
  IntegrationFeatureEnum,
  type IIntegration,
  type I18nObject,
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
import { GITHUB_SSO_CALLBACK_PATH, GITHUB_SSO_PROVIDER } from './constants.js'
import { GitHubSsoSecretService } from './github-sso-secret.service.js'
import type { GitHubSsoIntegrationOptions } from './types.js'

@Injectable()
@IntegrationStrategyKey(GITHUB_SSO_PROVIDER)
export class GitHubSsoIntegrationStrategy implements IntegrationStrategy<GitHubSsoIntegrationOptions> {
  constructor(private readonly configService: ConfigService, private readonly secretService: GitHubSsoSecretService) {}

  readonly meta: TIntegrationProvider = {
    name: GITHUB_SSO_PROVIDER,
    label: i18n('GitHub OAuth Sign-in', 'GitHub OAuth 登录'),
    description: i18n(
      'Use a tenant-owned GitHub OAuth App for Xpert sign-in.',
      '使用租户自有的 GitHub OAuth App 登录 Xpert。'
    ),
    icon: {
      type: 'font',
      value: 'ri-github-fill'
    },
    helpUrl: 'https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app',
    features: [IntegrationFeatureEnum.SSO],
    schema: {
      type: 'object',
      properties: {
        clientId: {
          type: 'string',
          title: i18n('Client ID', 'Client ID'),
          description: i18n('Client ID of the GitHub OAuth App.', 'GitHub OAuth App 的 Client ID。')
        },
        clientSecret: {
          type: 'string',
          title: i18n('Client Secret', 'Client Secret'),
          description: i18n('Client secret of the GitHub OAuth App.', 'GitHub OAuth App 的 Client Secret。'),
          'x-ui': {
            component: 'secretInput',
            revealable: true,
            maskSymbol: '*',
            persist: true
          }
        }
      },
      required: ['clientId', 'clientSecret'],
      secret: ['clientSecret']
    }
  }

  async execute(
    _integration: IIntegration<GitHubSsoIntegrationOptions>,
    _payload: TIntegrationStrategyParams
  ): Promise<null> {
    return null
  }

  async validateConfig(config: GitHubSsoIntegrationOptions): Promise<IntegrationTestResult> {
    const clientId = requireText(config?.clientId, 'GitHub OAuth Client ID is required.')
    const clientSecret = requireText(config?.clientSecret, 'GitHub OAuth Client Secret is required.')
    const options = {
      clientId,
      clientSecret: this.secretService.encrypt(clientSecret)
    }

    const clientBaseUrl = this.configService.get<string>('clientBaseUrl')?.trim()
    if (!clientBaseUrl) {
      return {
        mode: 'oauth_app',
        callbackUrl: GITHUB_SSO_CALLBACK_PATH,
        options,
        warnings: ['The host clientBaseUrl is not configured. Prefix the callback path with the public Xpert origin.']
      }
    }

    return {
      mode: 'oauth_app',
      callbackUrl: new URL(GITHUB_SSO_CALLBACK_PATH, clientBaseUrl).toString(),
      options
    }
  }
}

function i18n(en_US: string, zh_Hans: string): I18nObject {
  return { en_US, zh_Hans }
}

function requireText(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(message)
  }
  return value.trim()
}
