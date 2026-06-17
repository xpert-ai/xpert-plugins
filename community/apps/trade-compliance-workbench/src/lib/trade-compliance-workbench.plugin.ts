import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import {
  ControlledGoodsRecord,
  CustomsWorkbookGeneration,
  TradeComplianceImportBatch,
  TradeComplianceReviewItem,
  TradeProduct,
  TradeSupplier
} from './entities/index.js'
import { TradeComplianceWorkbenchMiddleware } from './trade-compliance-workbench.middleware.js'
import { TradeComplianceWorkbenchService } from './trade-compliance-workbench.service.js'
import { TradeComplianceWorkbenchViewProvider } from './trade-compliance-workbench-view.provider.js'

export const TRADE_COMPLIANCE_ENTITIES = [
  TradeComplianceImportBatch,
  TradeComplianceReviewItem,
  ControlledGoodsRecord,
  TradeSupplier,
  TradeProduct,
  CustomsWorkbookGeneration
]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(TRADE_COMPLIANCE_ENTITIES)],
  entities: TRADE_COMPLIANCE_ENTITIES,
  providers: [
    TradeComplianceWorkbenchService,
    TradeComplianceWorkbenchMiddleware,
    TradeComplianceWorkbenchViewProvider
  ],
  exports: [TradeComplianceWorkbenchService]
})
export class TradeComplianceWorkbenchPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void {
    console.log(`${TradeComplianceWorkbenchPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void {
    console.log(`${TradeComplianceWorkbenchPlugin.name} is being destroyed...`)
  }
}
