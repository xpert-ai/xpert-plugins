import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk';
import { ConfigModule } from '@nestjs/config';
import chalk from 'chalk';
import { XinferenceProviderStrategy } from './provider.strategy.js';
import { XinferenceLargeLanguageModel } from './llm/llm.js';
import { XinferenceTextEmbeddingModel } from './text-embedding/text-embedding.js';
import { XinferenceRerankModel } from './rerank/rerank.js';

@XpertServerPlugin({
	/**
	 * An array of modules that will be imported and registered with the plugin.
	 */
	imports: [ConfigModule],

	providers: [
        XinferenceProviderStrategy,
		XinferenceLargeLanguageModel,
		XinferenceRerankModel,
		XinferenceTextEmbeddingModel
	]
})
export class XinferenceModule implements IOnPluginBootstrap, IOnPluginDestroy {
	// We disable by default additional logging for each event to avoid cluttering the logs
	private logEnabled = true;

	/**
	 * Called when the plugin is being initialized.
	 */
	onPluginBootstrap(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${XinferenceModule.name} is being bootstrapped...`));
		}
	}

	/**
	 * Called when the plugin is being destroyed.
	 */
	onPluginDestroy(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${XinferenceModule.name} is being destroyed...`));
		}
	}
}
