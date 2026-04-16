import chalk from 'chalk'
import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { LarkIdentityController } from './lark-identity.controller.js'
import { LarkIdentityService } from './lark-identity.service.js'
import { LarkOAuthService } from './lark-oauth.service.js'
import { LarkSSOProviderStrategy } from './lark-sso-provider.strategy.js'
import { LarkStateService } from './lark-state.service.js'

@XpertServerPlugin({
  controllers: [LarkIdentityController],
  providers: [LarkIdentityService, LarkOAuthService, LarkStateService, LarkSSOProviderStrategy],
  exports: [LarkIdentityService]
})
export class LarkIdentityPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${LarkIdentityPluginModule.name} is being bootstrapped...`))
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${LarkIdentityPluginModule.name} is being destroyed...`))
    }
  }
}
