import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { TicketRecord } from './ticket.entity.js'
import { TicketService } from './ticket.service.js'
import { AnalysisMiddleware } from './analysis.middleware.js'
import { SupportTriageViewProvider } from './view.provider.js'

export const ENTITIES = [TicketRecord]
@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(ENTITIES)], entities: ENTITIES,
  providers: [TicketService, AnalysisMiddleware, SupportTriageViewProvider], exports: [TicketService]
})
export class SupportTriagePlugin {}
