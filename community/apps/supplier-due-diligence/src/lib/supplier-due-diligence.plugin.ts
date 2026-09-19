import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import {
  ProcurementComparisonCase,
  ProcurementItemMatch,
  ProcurementParseJob,
  ProcurementQuoteItem,
  ProcurementRecommendation,
  ProcurementRequirementItem,
  ProcurementRiskItem,
  ProcurementSourceDocument,
  ProcurementSupplierQuote
  ,SupplierWebEvidence
} from './entities/index.js'
import { SupplierDueDiligenceMiddleware } from './supplier-due-diligence.middleware.js'
import { SupplierDueDiligenceService } from './supplier-due-diligence.service.js'
import { SupplierDueDiligenceViewProvider } from './supplier-due-diligence-view.provider.js'

export const SUPPLIER_DUE_DILIGENCE_ENTITIES = [
  ProcurementComparisonCase,
  ProcurementSourceDocument,
  ProcurementParseJob,
  ProcurementRequirementItem,
  ProcurementSupplierQuote,
  ProcurementQuoteItem,
  ProcurementItemMatch,
  ProcurementRiskItem,
  ProcurementRecommendation
  ,SupplierWebEvidence
]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(SUPPLIER_DUE_DILIGENCE_ENTITIES)],
  entities: SUPPLIER_DUE_DILIGENCE_ENTITIES,
  providers: [
    SupplierDueDiligenceService,
    SupplierDueDiligenceMiddleware,
    SupplierDueDiligenceViewProvider
  ],
  exports: [SupplierDueDiligenceService]
})
export class SupplierDueDiligencePlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${SupplierDueDiligencePlugin.name} is being bootstrapped...`)
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${SupplierDueDiligencePlugin.name} is being destroyed...`)
    }
  }
}
