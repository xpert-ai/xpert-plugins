import chalk from 'chalk';
import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk';
import { ConfigModule } from '@nestjs/config';
import { IntegrationDifyModule } from './dify.module.js';
import { DifyIntegrationStrategy } from './dify-integration.strategy.js';
import { DifyKnowledgeStrategy } from './dify-knowledge.strategy.js';

@XpertServerPlugin({
	/**
	 * An array of modules that will be imported and registered with the plugin.
	 */
	imports: [ConfigModule, IntegrationDifyModule],
	/**
	 * An array of Entity classes. The plugin (or ORM) will
	 * register these entities for use within the application.
	 */
	entities: [],
	/**
	 * Providers that will be registered with the plugin.
	 * Strategy classes must be registered here (not in nested modules) 
	 * so they can be discovered by collectProvidersWithMetadata() during plugin installation.
	 * This is required for the integration strategy to appear in the system integration list.
	 */
	providers: [DifyIntegrationStrategy, DifyKnowledgeStrategy],
})
export class IntegrationDifyPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
	// We disable by default additional logging for each event to avoid cluttering the logs
	private logEnabled = true;

	/**
	 * Called when the plugin is being initialized.
	 */
	onPluginBootstrap(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${IntegrationDifyPlugin.name} is being bootstrapped...`));
		}
	}

	/**
	 * Called when the plugin is being destroyed.
	 */
	onPluginDestroy(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${IntegrationDifyPlugin.name} is being destroyed...`));
		}
	}
}
