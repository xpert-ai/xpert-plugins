import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import chalk from 'chalk'
import { MarkItDownBootstrapService } from './markitdown-bootstrap.service.js'
import { MarkItDownSkillMiddleware } from './markitdown.middleware.js'
import { MarkItDownSkillValidator } from './markitdown.validator.js'
import { MarkItDownSandboxConverter } from './convert.js'
import { MarkItDownTransformerStrategy } from './transformer.strategy.js'

@XpertServerPlugin({
  imports: [],
  providers: [
    MarkItDownBootstrapService,
    MarkItDownSkillMiddleware,
    MarkItDownSkillValidator,
    MarkItDownTransformerStrategy,
    MarkItDownSandboxConverter
  ]
})
export class MarkItDownPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${MarkItDownPluginModule.name} is being bootstrapped...`))
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${MarkItDownPluginModule.name} is being destroyed...`))
    }
  }
}
