import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import chalk from 'chalk'

@XpertServerPlugin({
  imports: [],
  entities: [],
  providers: []
})
export class EChartsMcpAppPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${EChartsMcpAppPlugin.name} is being bootstrapped...`))
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${EChartsMcpAppPlugin.name} is being destroyed...`))
    }
  }
}
