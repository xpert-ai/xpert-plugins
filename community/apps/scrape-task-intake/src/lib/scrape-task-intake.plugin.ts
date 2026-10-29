import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ScrapeTaskIntakeMiddleware } from './scrape-task-intake.middleware'
import { ScrapeTaskIntakeMockCatalogService } from './scrape-task-intake-mock-catalog.service'
import { ScrapeTaskIntakeService } from './scrape-task-intake.service'
import { ScrapeTaskIntakeViewProvider } from './scrape-task-intake-view.provider'
import { ScrapeTask, ScrapeTaskLog } from './entities'

const SCRAPE_TASK_INTAKE_ENTITIES = [ScrapeTask, ScrapeTaskLog]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(SCRAPE_TASK_INTAKE_ENTITIES)],
  entities: SCRAPE_TASK_INTAKE_ENTITIES,
  providers: [
    ScrapeTaskIntakeService,
    ScrapeTaskIntakeMockCatalogService,
    ScrapeTaskIntakeMiddleware,
    ScrapeTaskIntakeViewProvider
  ],
  exports: [ScrapeTaskIntakeService, ScrapeTaskIntakeMockCatalogService]
})
export class ScrapeTaskIntakePlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${ScrapeTaskIntakePlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${ScrapeTaskIntakePlugin.name} is being destroyed...`)
  }
}
