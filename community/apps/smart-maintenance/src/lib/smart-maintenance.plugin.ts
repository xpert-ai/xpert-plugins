import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { SmartMaintenanceMiddleware } from './smart-maintenance.middleware'
import { SmartMaintenanceMockCatalogService } from './smart-maintenance-mock-catalog.service'
import { SmartMaintenanceService } from './smart-maintenance.service'
import { SmartMaintenanceViewProvider } from './smart-maintenance-view.provider'
import { SmartMaintenanceServiceData, SmartMaintenanceWorkOrder, SmartMaintenanceWorkOrderLog } from './entities'

const SMART_MAINTENANCE_ENTITIES = [SmartMaintenanceWorkOrder, SmartMaintenanceWorkOrderLog, SmartMaintenanceServiceData]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(SMART_MAINTENANCE_ENTITIES)],
  entities: SMART_MAINTENANCE_ENTITIES,
  providers: [
    SmartMaintenanceService,
    SmartMaintenanceMockCatalogService,
    SmartMaintenanceMiddleware,
    SmartMaintenanceViewProvider
  ],
  exports: [SmartMaintenanceService, SmartMaintenanceMockCatalogService]
})
export class SmartMaintenancePlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${SmartMaintenancePlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${SmartMaintenancePlugin.name} is being destroyed...`)
  }
}
