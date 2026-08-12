import {
  SSOProviderStrategyKey,
  type ISSOProviderContext,
  type ISSOProviderDescriptor,
  type ISSOProviderStrategy
} from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { DingTalkSsoIntegrationResolver } from './dingtalk-sso-integration.resolver.js'
import {
  DINGTALK_SSO_LOGIN_START_PATH,
  DINGTALK_SSO_PROVIDER,
  DINGTALK_SSO_PROVIDER_ICON_PATH
} from './types.js'

@Injectable()
@SSOProviderStrategyKey(DINGTALK_SSO_PROVIDER)
export class DingTalkSsoProviderStrategy implements ISSOProviderStrategy {
  constructor(private readonly integrationResolver: DingTalkSsoIntegrationResolver) {}

  async describe(context: ISSOProviderContext): Promise<ISSOProviderDescriptor | null> {
    if (!context.tenantId?.trim() || !(await this.integrationResolver.findAvailable(context.tenantId))) {
      return null
    }

    return {
      provider: DINGTALK_SSO_PROVIDER,
      displayName: 'DingTalk',
      icon: DINGTALK_SSO_PROVIDER_ICON_PATH,
      order: 105,
      startUrl: DINGTALK_SSO_LOGIN_START_PATH
    }
  }
}
