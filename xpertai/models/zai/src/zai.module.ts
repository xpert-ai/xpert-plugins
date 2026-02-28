import {
  XpertServerPlugin,
  IOnPluginBootstrap,
  IOnPluginDestroy,
} from '@xpert-ai/plugin-sdk';
import { ConfigModule } from '@nestjs/config';
import chalk from 'chalk';
import { ZAIProviderStrategy } from './zai.js';
import { ZAILargeLanguageModel } from './llm/llm.js';

@XpertServerPlugin({
  imports: [ConfigModule],
  providers: [ZAIProviderStrategy, ZAILargeLanguageModel],
})
export class ZAIModule implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true;

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${ZAIModule.name} is being bootstrapped...`));
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${ZAIModule.name} is being destroyed...`));
    }
  }
}
