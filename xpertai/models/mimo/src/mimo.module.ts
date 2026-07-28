import { ConfigModule } from '@nestjs/config';
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk';
import { MimoLargeLanguageModel } from './llm/llm.js';
import { MimoProviderStrategy } from './provider.strategy.js';

@XpertServerPlugin({
  imports: [ConfigModule],
  providers: [MimoProviderStrategy, MimoLargeLanguageModel],
})
export class MimoModule {}
