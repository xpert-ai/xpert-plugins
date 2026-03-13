import { CqrsModule } from '@nestjs/cqrs'
import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import chalk from 'chalk'
import { ModelRetryMiddleware } from './modelRetry.js'

@XpertServerPlugin({
  imports: [CqrsModule],
  providers: [ModelRetryMiddleware],
})
export class ModelRetryPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${ModelRetryPlugin.name} is being bootstrapped...`))
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${ModelRetryPlugin.name} is being destroyed...`))
    }
  }
}
