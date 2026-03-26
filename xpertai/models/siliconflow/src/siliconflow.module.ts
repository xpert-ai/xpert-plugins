import { ConfigModule } from '@nestjs/config';
import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk';
import chalk from 'chalk';
import { SiliconflowLargeLanguageModel } from './llm/llm.js';
import { SiliconflowProviderStrategy } from './provider.strategy.js';
import { SiliconflowRerankModel } from './rerank/rerank.js';
import { SiliconflowSpeech2TextModel } from './speech2text/index.js';
import { SiliconflowTextEmbeddingModel } from './text-embedding/text-embedding.js';
import { SiliconflowTTSModel } from './tts/tts.js';

@XpertServerPlugin({
  imports: [ConfigModule],
  providers: [
    SiliconflowProviderStrategy,
    SiliconflowLargeLanguageModel,
    SiliconflowTextEmbeddingModel,
    SiliconflowRerankModel,
    SiliconflowSpeech2TextModel,
    SiliconflowTTSModel,
  ]
})
export class SiliconflowModule implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true;

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${SiliconflowModule.name} is being bootstrapped...`));
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${SiliconflowModule.name} is being destroyed...`));
    }
  }
}
