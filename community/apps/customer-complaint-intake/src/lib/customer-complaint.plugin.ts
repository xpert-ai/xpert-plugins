import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CustomerComplaintMiddleware } from './customer-complaint.middleware'
import { CustomerComplaintService } from './customer-complaint.service'
import { CustomerComplaintViewProvider } from './customer-complaint-view.provider'
import { ComplaintCase, ComplaintCaseLog } from './entities'

const ENTITIES = [ComplaintCase, ComplaintCaseLog]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  entities: ENTITIES,
  providers: [CustomerComplaintService, CustomerComplaintMiddleware, CustomerComplaintViewProvider],
  exports: [CustomerComplaintService]
})
export class CustomerComplaintPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap() {
    console.log(`${CustomerComplaintPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy() {
    console.log(`${CustomerComplaintPlugin.name} is being destroyed...`)
  }
}
