import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import chalk from 'chalk'
import { LoopGuardMiddleware } from './loopGuard.js'

@XpertServerPlugin({
  imports: [],
  providers: [LoopGuardMiddleware],
})
export class LoopGuardPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${LoopGuardPlugin.name} is being bootstrapped...`))
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${LoopGuardPlugin.name} is being destroyed...`))
    }
  }
}
