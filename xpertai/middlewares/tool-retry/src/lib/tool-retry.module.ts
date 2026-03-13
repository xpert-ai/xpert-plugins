import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import chalk from 'chalk'
import { ToolRetryMiddleware } from './toolRetry.js'

@XpertServerPlugin({
  imports: [],
  providers: [ToolRetryMiddleware],
})
export class ToolRetryPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${ToolRetryPlugin.name} is being bootstrapped...`))
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${ToolRetryPlugin.name} is being destroyed...`))
    }
  }
}
