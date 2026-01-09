import chalk from 'chalk';
import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk';
import { FirecrawlSourceStrategy } from './source.strategy.js';
import { FirecrawlIntegrationStrategy } from './integration.strategy.js';
import { FirecrawlController } from './firecrawl.controller.js';
import { FirecrawlService } from './firecrawl.service.js';

@XpertServerPlugin({
	/**
	 * An array of modules that will be imported and registered with the plugin.
	 */
	imports: [
	],
	/**
	 * An array of Entity classes. The plugin (or ORM) will
	 * register these entities for use within the application.
	 */
	entities: [],

	providers: [
		FirecrawlIntegrationStrategy,
		FirecrawlSourceStrategy,
		FirecrawlService
	],

	controllers: [
		FirecrawlController
	]
})
export class FirecrawlPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
	// We disable by default additional logging for each event to avoid cluttering the logs
	private logEnabled = true;

	/**
	 * Called when the plugin is being initialized.
	 */
	onPluginBootstrap(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${FirecrawlPlugin.name} is being bootstrapped...`));
		}
	}

	/**
	 * Called when the plugin is being destroyed.
	 */
	onPluginDestroy(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${FirecrawlPlugin.name} is being destroyed...`));
		}
	}
}
