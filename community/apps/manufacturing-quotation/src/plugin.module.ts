import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { QuotationDraft } from './draft.entity.js'
import { PricingService } from './pricing.service.js'
import { QuotationService } from './quotation.service.js'
import { QuotationMiddleware } from './quotation.middleware.js'
import { QuotationView } from './quotation.view.js'
import { OcrService } from './ocr.service.js'

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature([QuotationDraft])], entities: [QuotationDraft],
  providers: [PricingService, OcrService, QuotationService, QuotationMiddleware, QuotationView], exports: [QuotationService]
})
export class ManufacturingQuotationPlugin {}
