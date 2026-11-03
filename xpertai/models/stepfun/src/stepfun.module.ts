import { ConfigModule } from '@nestjs/config';
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk';
import { StepfunLargeLanguageModel } from './llm/llm.js';
import { StepfunProviderStrategy } from './provider.strategy.js';
import { StepfunSpeech2TextModel } from './speech2text/speech2text.js';
import { StepfunTTSModel } from './tts/tts.js';

@XpertServerPlugin({
  imports: [ConfigModule],
  providers: [StepfunProviderStrategy, StepfunLargeLanguageModel, StepfunSpeech2TextModel, StepfunTTSModel],
})
export class StepfunModule {}
