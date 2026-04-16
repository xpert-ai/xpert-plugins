import {
  ISSOProviderDescriptor,
  ISSOProviderStrategy,
  ISSOProviderContext,
  SSOProviderStrategyKey
} from '@xpert-ai/plugin-sdk'
import { Inject, Injectable } from '@nestjs/common'
import type { LarkIdentityPluginConfig } from './plugin-config.js'
import { LARK_IDENTITY_PLUGIN_CONFIG } from './tokens.js'
import {
  LARK_IDENTITY_LOGIN_START_PATH,
  LARK_IDENTITY_PROVIDER,
  LARK_IDENTITY_PROVIDER_ICON_PATH
} from './types.js'

@Injectable()
@SSOProviderStrategyKey(LARK_IDENTITY_PROVIDER)
export class LarkSSOProviderStrategy implements ISSOProviderStrategy {
  constructor(
    @Inject(LARK_IDENTITY_PLUGIN_CONFIG)
    private readonly config: LarkIdentityPluginConfig
  ) {}

  describe(context: ISSOProviderContext): ISSOProviderDescriptor | null {
    if (!this.config?.appId?.trim() || !this.config?.appSecret?.trim()) {
      return null
    }

    return {
      provider: LARK_IDENTITY_PROVIDER,
      displayName: 'Feishu',
      icon: LARK_IDENTITY_PROVIDER_ICON_PATH,
      order: 100,
      startUrl: LARK_IDENTITY_LOGIN_START_PATH
    }
  }
}
