import { ConfigModule } from '@nestjs/config';
import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk';
import chalk from 'chalk';
import { TongyiLargeLanguageModel } from './llm/llm.js';
import { TongyiProviderStrategy } from './provider.strategy.js';
import { TongyiRerankModel } from './rerank/rerank.js';
import { TongyiSpeech2TextModel } from './speech2text/index.js';
import { TongyiTextEmbeddingModel } from './text-embedding/text-embedding.js';
import { TongyiTTSModel } from './tts/tts.js';

@XpertServerPlugin({
  imports: [ConfigModule],
  providers: [
    TongyiProviderStrategy,
    TongyiLargeLanguageModel,
    TongyiTextEmbeddingModel,
    TongyiRerankModel,
    TongyiSpeech2TextModel,
    TongyiTTSModel,
  ]
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
