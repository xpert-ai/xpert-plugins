import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import chalk from 'chalk'
import { ZipUnzipBootstrapService } from './zip-unzip-bootstrap.service.js'
import { ZipUnzipCLISkillMiddleware } from './zip-unzip.middleware.js'
import { ZipUnzipCLISkillValidator } from './zip-unzip.validator.js'

@XpertServerPlugin({
  imports: [],
  providers: [ZipUnzipBootstrapService, ZipUnzipCLISkillMiddleware, ZipUnzipCLISkillValidator]
})
export class ZipUnzipCliPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${ZipUnzipCliPluginModule.name} is being bootstrapped...`))
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${ZipUnzipCliPluginModule.name} is being destroyed...`))
    }
  }
}
