import chalk from 'chalk'
import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { PdfiumToolset } from './toolset.js'

@XpertServerPlugin({
  providers: [
    PdfiumToolset,
  ]
})
export class PdfiumModule implements IOnPluginBootstrap, IOnPluginDestroy {
  // We disable by default additional logging for each event to avoid cluttering the logs
  private logEnabled = true

  /**
   * Called when the plugin is being initialized.
   */
  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${PdfiumModule.name} is being bootstrapped...`))
    }
  }

  /**
   * Called when the plugin is being destroyed.
   */
  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${PdfiumModule.name} is being destroyed...`))
    }
  }
}
