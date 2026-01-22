import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk';
import chalk from 'chalk';
import { FastGPTController } from './fastgpt.controller.js';
import { FastGPTService } from './fastgpt.service.js';
import { FastGPTIntegrationStrategy } from './integration.strategy.js';
import { FastGPTKnowledgeStrategy } from './knowledge.strategy.js';

@XpertServerPlugin({
	controllers: [FastGPTController],
	providers: [FastGPTService, FastGPTIntegrationStrategy, FastGPTKnowledgeStrategy],
})
export class IntegrationFastGPTPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
	// We disable by default additional logging for each event to avoid cluttering the logs
	private logEnabled = true;

	/**
	 * Called when the plugin is being initialized.
	 */
	onPluginBootstrap(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${IntegrationFastGPTPlugin.name} is being bootstrapped...`));
		}
	}

	/**
	 * Called when the plugin is being destroyed.
	 */
	onPluginDestroy(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${IntegrationFastGPTPlugin.name} is being destroyed...`));
		}
	}
}
