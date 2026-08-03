import { Injectable } from '@nestjs/common'
import {
  SSOProviderStrategyKey,
  type ISSOProviderContext,
  type ISSOProviderDescriptor,
  type ISSOProviderStrategy
} from '@xpert-ai/plugin-sdk'
import { GITHUB_SSO_LOGIN_START_PATH, GITHUB_SSO_PROVIDER, GITHUB_SSO_PROVIDER_ICON_PATH } from './constants.js'
import { GitHubSsoIntegrationResolver } from './github-sso-integration.resolver.js'

@Injectable()
@SSOProviderStrategyKey(GITHUB_SSO_PROVIDER)
export class GitHubSsoProviderStrategy implements ISSOProviderStrategy {
  constructor(private readonly integrationResolver: GitHubSsoIntegrationResolver) {}

  async describe(context: ISSOProviderContext): Promise<ISSOProviderDescriptor | null> {
    if (!context.tenantId?.trim()) {
      return null
    }
    const integration = await this.integrationResolver.findAvailable(context.tenantId)
    if (!integration) {
      return null
    }

    return {
      provider: GITHUB_SSO_PROVIDER,
      displayName: 'GitHub',
      icon: GITHUB_SSO_PROVIDER_ICON_PATH,
      order: 110,
      startUrl: GITHUB_SSO_LOGIN_START_PATH
    }
  }
}
