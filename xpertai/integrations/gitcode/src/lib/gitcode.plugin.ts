import chalk from 'chalk'
import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { GitCodeSkillSourceProvider } from './gitcode.strategy.js'

@XpertServerPlugin({
  imports: [],
  entities: [],
  providers: [GitCodeSkillSourceProvider],
  controllers: []
})
export class GitCodePlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${GitCodePlugin.name} is being bootstrapped...`))
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${GitCodePlugin.name} is being destroyed...`))
    }
  }
}
