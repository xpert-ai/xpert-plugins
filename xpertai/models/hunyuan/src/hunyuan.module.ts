import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { ConfigModule } from '@nestjs/config'
import chalk from 'chalk'
import { HunyuanProviderStrategy } from './provider.strategy.js'
import { HunyuanLargeLanguageModel } from './llm/llm.js'

@XpertServerPlugin({
  imports: [ConfigModule],
  providers: [HunyuanProviderStrategy, HunyuanLargeLanguageModel],
})
export class HunyuanModule implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${HunyuanModule.name} is being bootstrapped...`))
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${HunyuanModule.name} is being destroyed...`))
    }
  }
}
