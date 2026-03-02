import {
  XpertServerPlugin,
  IOnPluginBootstrap,
  IOnPluginDestroy,
} from '@xpert-ai/plugin-sdk'
import { ConfigModule } from '@nestjs/config'
import chalk from 'chalk'
import { OpenAIProviderStrategy } from './provider.strategy.js'
import { OpenAILargeLanguageModel } from './llm/llm.js'

@XpertServerPlugin({
  imports: [ConfigModule],
  providers: [OpenAIProviderStrategy, OpenAILargeLanguageModel],
})
export class OpenAIModule implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${OpenAIModule.name} is being bootstrapped...`))
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${OpenAIModule.name} is being destroyed...`))
    }
  }
}
