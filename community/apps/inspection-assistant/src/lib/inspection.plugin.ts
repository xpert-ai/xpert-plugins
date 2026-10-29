import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { InspectionCase, InspectionHistoryRecord } from './entities/index.js'
import { InspectionMiddleware } from './inspection.middleware.js'
import { InspectionService } from './inspection.service.js'
import { InspectionViewProvider } from './inspection-view.provider.js'

export const INSPECTION_ENTITIES = [InspectionCase, InspectionHistoryRecord]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(INSPECTION_ENTITIES)],
  entities: INSPECTION_ENTITIES,
  providers: [InspectionService, InspectionMiddleware, InspectionViewProvider],
  exports: [InspectionService]
})
export class InspectionPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${InspectionPlugin.name} is being bootstrapped...`)
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${InspectionPlugin.name} is being destroyed...`)
    }
  }
}
