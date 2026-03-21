import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import chalk from 'chalk'
import { MinerUBootstrapService } from './mineru-bootstrap.service.js'
import { MinerUSkillMiddleware } from './mineru.middleware.js'
import { MinerUSkillValidator } from './mineru.validator.js'

@XpertServerPlugin({
  imports: [],
  providers: [MinerUBootstrapService, MinerUSkillMiddleware, MinerUSkillValidator]
})
export class MinerUCliPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${MinerUCliPluginModule.name} is being bootstrapped...`))
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${MinerUCliPluginModule.name} is being destroyed...`))
    }
  }
}
