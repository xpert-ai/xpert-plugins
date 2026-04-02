import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import chalk from 'chalk'
import { DanglingToolCallMiddleware } from './dangling-tool-call.middleware.js'

@XpertServerPlugin({
  imports: [],
  providers: [DanglingToolCallMiddleware]
})
export class DanglingToolCallPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${DanglingToolCallPluginModule.name} is being bootstrapped...`))
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${DanglingToolCallPluginModule.name} is being destroyed...`))
    }
  }
}
