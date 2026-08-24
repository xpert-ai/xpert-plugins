import {
  XpertServerPlugin,
  type IOnPluginBootstrap,
  type IOnPluginDestroy
} from '@xpert-ai/plugin-sdk'
import { ConfigModule } from '@nestjs/config'
import { DingTalkOAuthService } from './dingtalk-oauth.service.js'
import { DingTalkSsoIntegrationResolver } from './dingtalk-sso-integration.resolver.js'
import { DingTalkSsoIntegrationStrategy } from './dingtalk-sso-integration.strategy.js'
import { DingTalkSsoSecretService } from './dingtalk-sso-secret.service.js'
import { DingTalkSsoController } from './dingtalk-sso.controller.js'
import { DingTalkSsoProviderStrategy } from './dingtalk-sso-provider.strategy.js'
import { DingTalkSsoService } from './dingtalk-sso.service.js'
import { DingTalkStateService } from './dingtalk-state.service.js'

@XpertServerPlugin({
  imports: [ConfigModule],
  controllers: [DingTalkSsoController],
  providers: [
    DingTalkSsoSecretService,
    DingTalkSsoIntegrationResolver,
    DingTalkSsoIntegrationStrategy,
    DingTalkOAuthService,
    DingTalkStateService,
    DingTalkSsoService,
    DingTalkSsoProviderStrategy
  ],
  exports: [DingTalkSsoService]
})
export class DingTalkSsoPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void {
    console.log(`${DingTalkSsoPluginModule.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void {
    console.log(`${DingTalkSsoPluginModule.name} is being destroyed...`)
  }
}
