import chalk from 'chalk'
import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ModelScopeSkillSourceProvider } from './modelscope.strategy.js'

@XpertServerPlugin({
  imports: [],
  entities: [],
  providers: [ModelScopeSkillSourceProvider],
  controllers: []
})
export class ModelScopePlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${ModelScopePlugin.name} is being bootstrapped...`))
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${ModelScopePlugin.name} is being destroyed...`))
    }
  }
}
