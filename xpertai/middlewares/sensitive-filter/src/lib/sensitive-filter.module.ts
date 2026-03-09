import { CqrsModule } from '@nestjs/cqrs'
import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import chalk from 'chalk'
import { SensitiveFilterMiddleware } from './sensitiveFilter.js'

@XpertServerPlugin({
  imports: [CqrsModule],
  providers: [SensitiveFilterMiddleware]
})
export class SensitiveFilterPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${SensitiveFilterPlugin.name} is being bootstrapped...`))
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${SensitiveFilterPlugin.name} is being destroyed...`))
    }
  }
}
