import {
  XpertServerPlugin,
  IOnPluginBootstrap,
  IOnPluginDestroy,
} from '@xpert-ai/plugin-sdk';
import { ConfigModule } from '@nestjs/config';
import { MoonshotProviderStrategy } from './provider.strategy.js';
import { MoonshotLargeLanguageModel } from './llm/llm.js';

@XpertServerPlugin({
  imports: [ConfigModule],
  providers: [MoonshotProviderStrategy, MoonshotLargeLanguageModel],
})
export class MoonshotModule implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true;

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${MoonshotModule.name} is being bootstrapped...`);
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${MoonshotModule.name} is being destroyed...`);
    }
  }
}

