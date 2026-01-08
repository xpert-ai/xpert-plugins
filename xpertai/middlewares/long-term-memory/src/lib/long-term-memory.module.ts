import { CqrsModule } from '@nestjs/cqrs';
import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk';
import chalk from 'chalk';
import { LongTermMemoryMiddleware } from './longTermMemory.js';


@XpertServerPlugin({
	/**
	 * An array of modules that will be imported and registered with the plugin.
	 */
	imports: [
		CqrsModule
	],

	providers: [
    	LongTermMemoryMiddleware
	]
})
export class LongTermMemoryPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
	// We disable by default additional logging for each event to avoid cluttering the logs
	private logEnabled = true;

	/**
	 * Called when the plugin is being initialized.
	 */
	onPluginBootstrap(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${LongTermMemoryPlugin.name} is being bootstrapped...`));
		}
	}

	/**
	 * Called when the plugin is being destroyed.
	 */
	onPluginDestroy(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${LongTermMemoryPlugin.name} is being destroyed...`));
		}
	}
}
