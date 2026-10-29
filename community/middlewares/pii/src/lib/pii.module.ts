import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk';
import chalk from 'chalk';
import { PiiMiddleware } from './pii.js';


@XpertServerPlugin({
	/**
	 * An array of modules that will be imported and registered with the plugin.
	 */
	imports: [],

	providers: [
    	PiiMiddleware
	]
})
export class PiiPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
	// We disable by default additional logging for each event to avoid cluttering the logs
	private logEnabled = true;

	/**
	 * Called when the plugin is being initialized.
	 */
	onPluginBootstrap(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${PiiPlugin.name} is being bootstrapped...`));
		}
	}

	/**
	 * Called when the plugin is being destroyed.
	 */
	onPluginDestroy(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${PiiPlugin.name} is being destroyed...`));
		}
	}
}