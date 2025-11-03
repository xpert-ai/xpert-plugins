import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk';
import { ConfigModule } from '@nestjs/config';
import chalk from 'chalk';
import { OpenAICompatibleProviderStrategy } from './provider.strategy.js';
import { OAIAPICompatLargeLanguageModel } from './llm/llm.js';
import { OAIAPICompatTextEmbeddingModel } from './text-embedding/text-embedding.js';
import { OpenAICompatibleSpeech2TextModel } from './speech2text/index.js';
import { OpenAICompatibleRerankModel } from './rerank/rerank.js';

@XpertServerPlugin({
	/**
	 * An array of modules that will be imported and registered with the plugin.
	 */
	imports: [ConfigModule],

	providers: [
		OpenAICompatibleProviderStrategy,
		OAIAPICompatLargeLanguageModel,
		OAIAPICompatTextEmbeddingModel,
		OpenAICompatibleSpeech2TextModel,
		OpenAICompatibleRerankModel
	]
})
export class OpenAICompatiblePlugin implements IOnPluginBootstrap, IOnPluginDestroy {
	// We disable by default additional logging for each event to avoid cluttering the logs
	private logEnabled = true;

	/**
	 * Called when the plugin is being initialized.
	 */
	onPluginBootstrap(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${OpenAICompatiblePlugin.name} is being bootstrapped...`));
		}
	}

	/**
	 * Called when the plugin is being destroyed.
	 */
	onPluginDestroy(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${OpenAICompatiblePlugin.name} is being destroyed...`));
		}
	}
}
