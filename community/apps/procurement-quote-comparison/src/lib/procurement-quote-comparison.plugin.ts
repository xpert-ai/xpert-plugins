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
} from './entities/index.js'
import { ProcurementQuoteComparisonMiddleware } from './procurement-quote-comparison.middleware.js'
import { ProcurementQuoteComparisonService } from './procurement-quote-comparison.service.js'
import { ProcurementQuoteComparisonViewProvider } from './procurement-quote-comparison-view.provider.js'

export const PROCUREMENT_QUOTE_COMPARISON_ENTITIES = [
  ProcurementComparisonCase,
  ProcurementSourceDocument,
  ProcurementParseJob,
  ProcurementRequirementItem,
  ProcurementSupplierQuote,
  ProcurementQuoteItem,
  ProcurementItemMatch,
  ProcurementRiskItem,
  ProcurementRecommendation
]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(PROCUREMENT_QUOTE_COMPARISON_ENTITIES)],
  entities: PROCUREMENT_QUOTE_COMPARISON_ENTITIES,
  providers: [
    ProcurementQuoteComparisonService,
    ProcurementQuoteComparisonMiddleware,
    ProcurementQuoteComparisonViewProvider
  ],
  exports: [ProcurementQuoteComparisonService]
})
export class ProcurementQuoteComparisonPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${ProcurementQuoteComparisonPlugin.name} is being bootstrapped...`)
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${ProcurementQuoteComparisonPlugin.name} is being destroyed...`)
    }
  }
}
