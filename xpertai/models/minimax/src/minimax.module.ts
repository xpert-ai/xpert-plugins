import { ConfigModule } from '@nestjs/config';
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk';
import { MiniMaxProviderStrategy } from './provider.strategy.js';
import { MiniMaxLargeLanguageModel } from './llm/llm.js';
import { MiniMaxTTSModel } from './tts/tts.js';
import { MiniMaxVideoGenerationModel } from './video/model.js';
import { MiniMaxVideoStrategy } from './video/strategy.js';
import { MiniMaxVideoJobProcessor } from './video/job.js';

@XpertServerPlugin({
  imports: [ConfigModule],
  providers: [
    MiniMaxProviderStrategy,
    MiniMaxLargeLanguageModel,
    MiniMaxTTSModel,
    MiniMaxVideoGenerationModel,
    MiniMaxVideoStrategy,
    MiniMaxVideoJobProcessor
  ]
})
export class MiniMaxModule {}
