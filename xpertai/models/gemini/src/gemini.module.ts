import {
  XpertServerPlugin,
  IOnPluginBootstrap,
  IOnPluginDestroy,
} from '@xpert-ai/plugin-sdk';
import { ConfigModule } from '@nestjs/config';
import { GeminiProviderStrategy } from './provider.strategy.js';
import { GeminiLargeLanguageModel } from './llm/llm.js';

@XpertServerPlugin({
  imports: [ConfigModule],
  providers: [GeminiProviderStrategy, GeminiLargeLanguageModel],
})
export class GeminiModule implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true;

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${GeminiModule.name} is being bootstrapped...`);
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${GeminiModule.name} is being destroyed...`);
    }
  }
}
