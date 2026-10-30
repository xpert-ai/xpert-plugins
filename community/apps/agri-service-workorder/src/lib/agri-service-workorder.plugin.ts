import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { AgriServiceMiddleware } from './agri-service-workorder.middleware'
import { AgriServiceMockCatalogService } from './agri-service-workorder-mock-catalog.service'
import { AgriServiceService } from './agri-service-workorder.service'
import { AgriServiceViewProvider } from './agri-service-workorder-view.provider'
import { AgriServiceServiceData, AgriServiceWorkOrder, AgriServiceWorkOrderLog } from './entities'

const agri_service_ENTITIES = [AgriServiceWorkOrder, AgriServiceWorkOrderLog, AgriServiceServiceData]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(agri_service_ENTITIES)],
  entities: agri_service_ENTITIES,
  providers: [
    AgriServiceService,
    AgriServiceMockCatalogService,
    AgriServiceMiddleware,
    AgriServiceViewProvider
  ],
  exports: [AgriServiceService, AgriServiceMockCatalogService]
})
export class AgriServicePlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${AgriServicePlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${AgriServicePlugin.name} is being destroyed...`)
  }
}
