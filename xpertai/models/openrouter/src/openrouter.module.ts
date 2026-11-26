import {
  XpertServerPlugin,
  IOnPluginBootstrap,
  IOnPluginDestroy,
} from '@xpert-ai/plugin-sdk';
import { ConfigModule } from '@nestjs/config';
import { OpenRouterProviderStrategy } from './provider.strategy.js';
import { OpenRouterLargeLanguageModel } from './llm/llm.js';
import { OpenRouterTTSModel } from './tts/tts.js';
import { OpenRouterSpeech2TextModel } from './speech2text/speech2text.js';
import { OpenRouterRerankModel } from './rerank/rerank.js';
import { OpenRouterTextEmbeddingModel } from './text-embedding/text-embedding.js';

@XpertServerPlugin({
  imports: [ConfigModule],
  providers: [
    OpenRouterProviderStrategy,
    OpenRouterLargeLanguageModel,
    OpenRouterTTSModel,
    OpenRouterSpeech2TextModel,
    OpenRouterRerankModel,
    OpenRouterTextEmbeddingModel
  ],
})
export class OpenRouterModule implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true;

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${OpenRouterModule.name} is being bootstrapped...`);
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${OpenRouterModule.name} is being destroyed...`);
    }
  }
}
