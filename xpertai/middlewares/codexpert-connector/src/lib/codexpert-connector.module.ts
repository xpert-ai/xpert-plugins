import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { TypeOrmModule } from '@nestjs/typeorm'
import chalk from 'chalk'
import { CodexpertConnectorMiddleware } from './codexpert-connector.middleware.js'
import { CodexpertConnectorRunService } from './codexpert-connector-run.service.js'
import { PluginCodexpertConnectorRunEntity } from './entities/codexpert-connector-run.entity.js'

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature([PluginCodexpertConnectorRunEntity])],
  providers: [CodexpertConnectorMiddleware, CodexpertConnectorRunService],
  entities: [PluginCodexpertConnectorRunEntity],
})
export class CodexpertConnectorPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  constructor(private readonly runService: CodexpertConnectorRunService) {}

  async onPluginBootstrap(): Promise<void> {
    console.log(chalk.green(`${CodexpertConnectorPlugin.name} is being bootstrapped...`))
    await this.runService.ensureSchema()
  }

  onPluginDestroy(): void {
    console.log(chalk.green(`${CodexpertConnectorPlugin.name} is being destroyed...`))
  }
}
