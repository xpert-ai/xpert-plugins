import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { TravelItineraryMiddleware } from './travel-itinerary.middleware'
import { TravelItineraryService } from './travel-itinerary.service'
import { TravelItineraryViewProvider } from './travel-itinerary.view.provider'
import { TravelPlan } from './entities/travel-plan.entity'

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature([TravelPlan])],
  entities: [TravelPlan],
  providers: [TravelItineraryService, TravelItineraryMiddleware, TravelItineraryViewProvider],
  exports: [TravelItineraryService]
})
export class TravelItineraryPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap() {
    return undefined
  }

  onPluginDestroy() {
    return undefined
  }
}
