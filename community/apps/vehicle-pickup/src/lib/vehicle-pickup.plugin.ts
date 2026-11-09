import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { VehiclePickupMockCatalogService } from './vehicle-pickup-mock-catalog.service'
import { VehiclePickupMiddleware } from './vehicle-pickup.middleware'
import { VehiclePickupService } from './vehicle-pickup.service'
import { VehiclePickupViewProvider } from './vehicle-pickup-view.provider'
import { VehiclePickupRequest, VehiclePickupRequestLog } from './entities'

const ENTITIES = [VehiclePickupRequest, VehiclePickupRequestLog]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  entities: ENTITIES,
  providers: [
    VehiclePickupService,
    VehiclePickupMockCatalogService,
    VehiclePickupMiddleware,
    VehiclePickupViewProvider
  ],
  exports: [VehiclePickupService, VehiclePickupMockCatalogService]
})
export class VehiclePickupPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${VehiclePickupPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${VehiclePickupPlugin.name} is being destroyed...`)
  }
}
