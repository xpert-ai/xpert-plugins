import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import chalk from 'chalk'
import { ViewImageMiddleware } from './view-image.middleware.js'
import { ViewImageService } from './view-image.service.js'
import { ViewImageValidator } from './view-image.validator.js'

@XpertServerPlugin({
  imports: [],
  providers: [ViewImageService, ViewImageMiddleware, ViewImageValidator]
})
export class ViewImagePluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${ViewImagePluginModule.name} is being bootstrapped...`))
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${ViewImagePluginModule.name} is being destroyed...`))
    }
  }
}
