import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk';
import { ConfigModule } from '@nestjs/config';
import { MiniMaxProviderStrategy } from './provider.strategy.js';
import { MiniMaxLargeLanguageModel } from './llm/llm.js';
import { MiniMaxTextEmbeddingModel } from './text-embedding/text-embedding.js';
import { MiniMaxTTSModel } from './tts/tts.js';

@XpertServerPlugin({
  /**
   * An array of modules that will be imported and registered with the plugin.
   */
  imports: [ConfigModule],

  providers: [
    MiniMaxProviderStrategy,
    MiniMaxLargeLanguageModel,
    MiniMaxTextEmbeddingModel,
    MiniMaxTTSModel
  ]
})
export class MiniMaxModule implements IOnPluginBootstrap, IOnPluginDestroy {
  // We disable by default additional logging for each event to avoid cluttering the logs
  private logEnabled = true;

  /**
   * Called when the plugin is being initialized.
   */
  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${MiniMaxModule.name} is being bootstrapped...`);
    }
  }

  /**
   * Called when the plugin is being destroyed.
   */
  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${MiniMaxModule.name} is being destroyed...`);
    }
  }
}