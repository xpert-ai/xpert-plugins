import { QuoteEventRoute, QuoteEventFact, QuoteEventParse, QuoteRevisionContext } from './event-journal.js'
import { DelayDecision, DelayDecisionInput } from './entities/delay-decision.entity.js'
import { DeliveryCheck, DeliveryCheckReceipt } from './delivery-check.js'
import { QuoteFollowUp } from './quote-follow-up.js'
import { QuoteEvents } from './quote-events.js'
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
  QuoteEventRoute,
  QuoteEventFact,
  QuoteEventParse,
  QuoteRevisionContext,
  QuoteFollowUp,
  DeliveryCheck,
  DeliveryCheckReceipt,
  DelayDecision,
  DelayDecisionInput,
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
    QuoteEvents,
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
