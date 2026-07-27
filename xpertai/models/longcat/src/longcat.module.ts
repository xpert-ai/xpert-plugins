import { ConfigModule } from '@nestjs/config';
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk';
import { LongcatLargeLanguageModel } from './llm/llm.js';
import { LongcatProviderStrategy } from './provider.strategy.js';

@XpertServerPlugin({
  imports: [ConfigModule],
  providers: [LongcatProviderStrategy, LongcatLargeLanguageModel],
})
export class LongcatModule {}
