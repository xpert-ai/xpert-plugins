import {
  XpertServerPlugin,
  IOnPluginBootstrap,
  IOnPluginDestroy,
} from '@xpert-ai/plugin-sdk';
import { ConfigModule } from '@nestjs/config';
import { OpenRouterProviderStrategy } from './provider.strategy.js';
import { OpenRouterLargeLanguageModel } from './llm/llm.js';
import { OpenRouterRerankModel } from './rerank/rerank.js';
import { OpenRouterTextEmbeddingModel } from './text-embedding/text-embedding.js';

@XpertServerPlugin({
  imports: [ConfigModule],
  providers: [
    OpenRouterProviderStrategy,
    OpenRouterLargeLanguageModel,
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
