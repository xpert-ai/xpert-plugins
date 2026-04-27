import chalk from 'chalk'
import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { LarkSsoController } from './lark-sso.controller.js'
import { LarkSsoService } from './lark-sso.service.js'
import { LarkOAuthService } from './lark-oauth.service.js'
import { LarkSsoProviderStrategy } from './lark-sso-provider.strategy.js'
import { LarkStateService } from './lark-state.service.js'

@XpertServerPlugin({
  controllers: [LarkSsoController],
  providers: [LarkSsoService, LarkOAuthService, LarkStateService, LarkSsoProviderStrategy],
  exports: [LarkSsoService]
})
export class LarkSsoPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${LarkSsoPluginModule.name} is being bootstrapped...`))
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${LarkSsoPluginModule.name} is being destroyed...`))
    }
  }
}
