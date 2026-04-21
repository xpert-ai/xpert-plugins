import {
  ISSOProviderDescriptor,
  ISSOProviderStrategy,
  ISSOProviderContext,
  SSOProviderStrategyKey
} from '@xpert-ai/plugin-sdk'
import { Inject, Injectable } from '@nestjs/common'
import type { LarkSsoPluginConfig } from './plugin-config.js'
import { LARK_SSO_PLUGIN_CONFIG } from './tokens.js'
import {
  LARK_SSO_LOGIN_START_PATH,
  LARK_SSO_PROVIDER,
  LARK_SSO_PROVIDER_ICON_PATH
} from './types.js'

@Injectable()
@SSOProviderStrategyKey(LARK_SSO_PROVIDER)
export class LarkSsoProviderStrategy implements ISSOProviderStrategy {
  constructor(
    @Inject(LARK_SSO_PLUGIN_CONFIG)
    private readonly config: LarkSsoPluginConfig
  ) {}

  describe(context: ISSOProviderContext): ISSOProviderDescriptor | null {
    if (!this.config?.appId?.trim() || !this.config?.appSecret?.trim()) {
      return null
    }

    return {
      provider: LARK_SSO_PROVIDER,
      displayName: 'Feishu',
      icon: LARK_SSO_PROVIDER_ICON_PATH,
      order: 100,
      startUrl: LARK_SSO_LOGIN_START_PATH
    }
  }
}
