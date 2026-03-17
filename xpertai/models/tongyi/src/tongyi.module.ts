import {
  XpertServerPlugin,
  IOnPluginBootstrap,
  IOnPluginDestroy,
} from '@xpert-ai/plugin-sdk';
import { ConfigModule } from '@nestjs/config';
import chalk from 'chalk';
import { TongyiProviderStrategy } from './provider.strategy.js';
import { TongyiLargeLanguageModel } from './llm/llm.js';

@XpertServerPlugin({
  imports: [ConfigModule],
  providers: [TongyiProviderStrategy, TongyiLargeLanguageModel],
})
export class TongyiModule implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true;

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${TongyiModule.name} is being bootstrapped...`));
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${TongyiModule.name} is being destroyed...`));
    }
  }
}
