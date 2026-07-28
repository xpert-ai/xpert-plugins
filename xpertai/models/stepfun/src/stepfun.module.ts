import { ConfigModule } from '@nestjs/config';
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk';
import { StepfunLargeLanguageModel } from './llm/llm.js';
import { StepfunProviderStrategy } from './provider.strategy.js';

@XpertServerPlugin({
  imports: [ConfigModule],
  providers: [StepfunProviderStrategy, StepfunLargeLanguageModel],
})
export class StepfunModule {}
