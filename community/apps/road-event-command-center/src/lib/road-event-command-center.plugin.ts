import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { RoadEventDraftRecord } from './road-event-command-center-draft.entity.js'
import { RoadEventCommandCenterDraftService } from './road-event-command-center-draft.service.js'
import { RoadEventCommandCenterMiddleware } from './road-event-command-center.middleware.js'
import { RoadEventCommandCenterViewProvider } from './road-event-command-center-view.provider.js'

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature([RoadEventDraftRecord])],
  entities: [RoadEventDraftRecord],
  providers: [RoadEventCommandCenterDraftService, RoadEventCommandCenterMiddleware, RoadEventCommandCenterViewProvider],
  exports: [RoadEventCommandCenterViewProvider]
})
export class RoadEventCommandCenterPlugin {}
