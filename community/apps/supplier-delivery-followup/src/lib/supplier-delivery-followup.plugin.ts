import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ENTITIES } from './entities'
import { SupplierDeliveryFollowupService } from './supplier-delivery-followup.service'
import { SupplierDeliveryFollowupMiddleware } from './supplier-delivery-followup.middleware'
import { SupplierDeliveryFollowupViewProvider } from './supplier-delivery-followup-view.provider'

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  entities: ENTITIES,
  providers: [
    SupplierDeliveryFollowupService,
    SupplierDeliveryFollowupMiddleware,
    SupplierDeliveryFollowupViewProvider
  ],
  exports: [SupplierDeliveryFollowupService]
})
export class SupplierDeliveryFollowupPlugin {}
