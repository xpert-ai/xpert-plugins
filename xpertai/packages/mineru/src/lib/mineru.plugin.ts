import chalk from 'chalk';
import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk';
import { ConfigModule } from '@nestjs/config';
import { MinerUTransformerStrategy } from './transformer-mineru.strategy.js';
import { MinerUResultParserService } from './result-parser.service.js';
import { MinerUIntegrationStrategy } from './integration.strategy.js';
import { MinerUController } from './mineru.controller.js';

@XpertServerPlugin({
	/**
	 * An array of modules that will be imported and registered with the plugin.
	 */
	imports: [
		ConfigModule,
	],
	/**
	 * An array of Entity classes. The plugin (or ORM) will
	 * register these entities for use within the application.
	 */
	entities: [],

	providers: [
		MinerUIntegrationStrategy,
		MinerUTransformerStrategy,
		MinerUResultParserService,
	],
	controllers: [
		MinerUController
	]
})
export class MinerUPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
	// We disable by default additional logging for each event to avoid cluttering the logs
	private logEnabled = true;

	/**
	 * Called when the plugin is being initialized.
	 */
	onPluginBootstrap(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${MinerUPlugin.name} is being bootstrapped...`));
		}
	}

	/**
	 * Called when the plugin is being destroyed.
	 */
	onPluginDestroy(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${MinerUPlugin.name} is being destroyed...`));
		}
	}
}
