import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { InvoiceRecord } from './entities/index.js'
import { InvoiceReimbursementService } from './invoice-reimbursement.service.js'
import { InvoiceReimbursementMiddleware } from './invoice-reimbursement.middleware.js'
import { InvoiceReimbursementViewProvider } from './invoice-reimbursement-view.provider.js'

const INVOICE_ENTITIES = [InvoiceRecord]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(INVOICE_ENTITIES)],
  entities: INVOICE_ENTITIES,
  providers: [
    InvoiceReimbursementService,
    InvoiceReimbursementMiddleware,
    InvoiceReimbursementViewProvider
  ],
  exports: [InvoiceReimbursementService]
})
export class InvoiceReimbursementPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${InvoiceReimbursementPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${InvoiceReimbursementPlugin.name} is being destroyed...`)
  }
}
