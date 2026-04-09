import chalk from 'chalk'
import { CqrsModule } from '@nestjs/cqrs'
import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { FileMemoryController } from './file-memory.controller.js'
import { FileMemoryFileRepository } from './file-repository.js'
import { XpertFileMemoryService } from './file-memory.service.js'
import { FileMemorySystemMiddleware } from './file-memory.middleware.js'
import { FileMemoryLayerResolver } from './layer-resolver.js'
import { FileMemoryPathPolicy } from './path-policy.js'
import { FileMemoryRecallPlanner } from './recall-planner.js'
import { FileMemoryWritebackRunner } from './file-memory.writeback-runner.js'
import { FileMemoryWritePolicy } from './write-policy.js'

@XpertServerPlugin({
  imports: [CqrsModule],
  controllers: [FileMemoryController],
  providers: [
    FileMemoryPathPolicy,
    FileMemoryLayerResolver,
    FileMemoryFileRepository,
    FileMemoryRecallPlanner,
    FileMemoryWritePolicy,
    XpertFileMemoryService,
    FileMemoryWritebackRunner,
    FileMemorySystemMiddleware
  ],
  exports: [XpertFileMemoryService]
})
export class FileMemoryPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  private readonly logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${FileMemoryPluginModule.name} is being bootstrapped...`))
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${FileMemoryPluginModule.name} is being destroyed...`))
    }
  }
}
