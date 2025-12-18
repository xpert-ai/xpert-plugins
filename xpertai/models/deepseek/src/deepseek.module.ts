import {
  XpertServerPlugin,
  IOnPluginBootstrap,
  IOnPluginDestroy,
} from '@xpert-ai/plugin-sdk';
import { ConfigModule } from '@nestjs/config';
import { DeepSeekProviderStrategy } from './provider.strategy.js';
import { DeepSeekLargeLanguageModel } from './llm/llm.js';

@XpertServerPlugin({
  imports: [ConfigModule],
  providers: [DeepSeekProviderStrategy, DeepSeekLargeLanguageModel],
})
export class DeepSeekModule implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true;

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${DeepSeekModule.name} is being bootstrapped...`);
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${DeepSeekModule.name} is being destroyed...`);
    }
  }
}
