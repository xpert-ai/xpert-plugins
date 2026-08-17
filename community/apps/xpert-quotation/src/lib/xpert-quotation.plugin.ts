import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin, type IOnPluginBootstrap, type IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import {
  XpertPriceBook,
  XpertQuotaEvidence,
  XpertQuotaIngestionJob,
  XpertQuotaItem,
  XpertQuotaKnowledgeSource,
  XpertQuotaKnowledgeSourceVersion,
  XpertQuotaKnowledgeSync,
  XpertQuotaKnowledgeSyncJob,
  XpertQuotaResource,
  XpertQuotaReview,
  XpertQuotation,
  XpertQuotationHistory,
  XpertQuotationLine,
  XpertQuotationWorkbookVersion
} from './entities/index.js'
import { XpertQuotaIngestionProcessor } from './knowledge-ingestion/xpert-quota-ingestion.processor.js'
import { XpertQuotaKnowledgeSyncProcessor } from './knowledge-ingestion/xpert-quota-knowledge-sync.processor.js'
import { XpertQuotaKnowledgeSyncService } from './knowledge-ingestion/xpert-quota-knowledge-sync.service.js'
import { XpertQuotaKnowledgeService } from './knowledge-ingestion/xpert-quota-knowledge.service.js'
import { XpertQuotationHistoryService } from './xpert-quotation-history.service.js'
import { XpertQuotationKnowledgebaseAdapter } from './xpert-quotation-knowledgebase.adapter.js'
import {
  XpertQuotationConsumptionMiddleware,
  XpertQuotationCoordinatorMiddleware,
  XpertQuotationLineWorkerMiddleware,
  XpertQuotationMiddleware,
  XpertQuotationMiddlewareFactory,
  XpertQuotationPriceMiddleware
} from './xpert-quotation.middleware.js'
import { XpertQuotationReviewService } from './xpert-quotation-review.service.js'
import { XpertQuotationResourcePricingService } from './xpert-quotation-resource-pricing.service.js'
import { XpertQuotationService } from './xpert-quotation.service.js'
import { XpertQuotationViewProvider } from './xpert-quotation-view.provider.js'
import { XpertQuotationWorkbookService } from './xpert-quotation-workbook.service.js'
import { XpertQuotationWebFallbackService } from './xpert-quotation-web-fallback.service.js'

export const XPERT_QUOTATION_ENTITIES = [
  XpertQuotation,
  XpertPriceBook,
  XpertQuotationLine,
  XpertQuotationHistory,
  XpertQuotationWorkbookVersion,
  XpertQuotaKnowledgeSource,
  XpertQuotaKnowledgeSourceVersion,
  XpertQuotaIngestionJob,
  XpertQuotaItem,
  XpertQuotaResource,
  XpertQuotaEvidence,
  XpertQuotaReview,
  XpertQuotaKnowledgeSync,
  XpertQuotaKnowledgeSyncJob
]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(XPERT_QUOTATION_ENTITIES)],
  entities: XPERT_QUOTATION_ENTITIES,
  providers: [
    XpertQuotationWorkbookService,
    XpertQuotationHistoryService,
    XpertQuotationReviewService,
    XpertQuotaKnowledgeService,
    XpertQuotaKnowledgeSyncService,
    XpertQuotaIngestionProcessor,
    XpertQuotaKnowledgeSyncProcessor,
    XpertQuotationKnowledgebaseAdapter,
    XpertQuotationResourcePricingService,
    XpertQuotationWebFallbackService,
    XpertQuotationService,
    XpertQuotationMiddlewareFactory,
    XpertQuotationCoordinatorMiddleware,
    XpertQuotationLineWorkerMiddleware,
    XpertQuotationConsumptionMiddleware,
    XpertQuotationPriceMiddleware,
    XpertQuotationMiddleware,
    XpertQuotationViewProvider
  ],
  exports: [XpertQuotationService, XpertQuotationKnowledgebaseAdapter, XpertQuotationResourcePricingService, XpertQuotationWebFallbackService, XpertQuotaKnowledgeService, XpertQuotaKnowledgeSyncService]
})
export class XpertQuotationPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void {
    console.log(`${XpertQuotationPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void {
    console.log(`${XpertQuotationPlugin.name} is being destroyed...`)
  }
}
