import { ConfigModule } from '@nestjs/config';
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk';
import { MiniMaxProviderStrategy } from './provider.strategy.js';
import { MiniMaxLargeLanguageModel } from './llm/llm.js';
import { MiniMaxTextEmbeddingModel } from './text-embedding/text-embedding.js';
import { MiniMaxTTSModel } from './tts/tts.js';

@XpertServerPlugin({
  imports: [ConfigModule],
  providers: [MiniMaxProviderStrategy, MiniMaxLargeLanguageModel, MiniMaxTextEmbeddingModel, MiniMaxTTSModel]
})
export class MiniMaxModule {}