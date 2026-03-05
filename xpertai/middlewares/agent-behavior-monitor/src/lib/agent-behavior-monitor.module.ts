import { CqrsModule } from '@nestjs/cqrs'
import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import chalk from 'chalk'
import { AgentBehaviorMonitorMiddleware } from './agentBehaviorMonitor.js'

@XpertServerPlugin({
  imports: [CqrsModule],
  providers: [AgentBehaviorMonitorMiddleware],
})
export class AgentBehaviorMonitorPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${AgentBehaviorMonitorPlugin.name} is being bootstrapped...`))
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${AgentBehaviorMonitorPlugin.name} is being destroyed...`))
    }
  }
}
