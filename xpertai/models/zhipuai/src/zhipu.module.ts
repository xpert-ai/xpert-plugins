import {
  XpertServerPlugin,
  IOnPluginBootstrap,
  IOnPluginDestroy,
} from '@xpert-ai/plugin-sdk';
import { ConfigModule } from '@nestjs/config';
import chalk from 'chalk';
import { ZhipuaiProviderStrategy } from './zhipuai.js';
import { ZhipuAILargeLanguageModel } from './llm/llm.js';
import { ZhipuaiTextEmbeddingModel } from './text-embedding/text-embedding.js';

@XpertServerPlugin({
  /**
   * An array of modules that will be imported and registered with the plugin.
   */
  imports: [ConfigModule],

  providers: [ZhipuaiProviderStrategy, ZhipuAILargeLanguageModel, ZhipuaiTextEmbeddingModel],
})
export class ZhipuAIModule implements IOnPluginBootstrap, IOnPluginDestroy {
  // We disable by default additional logging for each event to avoid cluttering the logs
  private logEnabled = true;

  /**
   * Called when the plugin is being initialized.
   */
  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${ZhipuAIModule.name} is being bootstrapped...`));
    }
  }

  /**
   * Called when the plugin is being destroyed.
   */
  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${ZhipuAIModule.name} is being destroyed...`));
    }
  }
}
