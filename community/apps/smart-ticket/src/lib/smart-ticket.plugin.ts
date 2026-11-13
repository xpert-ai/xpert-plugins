import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { TicketRecord } from './ticket.entity.js'
import { TicketService } from './ticket.service.js'
import { SmartTicketMiddleware } from './ticket.middleware.js'
import { TicketViewProvider } from './ticket-view.provider.js'

export const ENTITIES = [TicketRecord]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  entities: ENTITIES,
  providers: [TicketService, SmartTicketMiddleware, TicketViewProvider],
  exports: [TicketService]
})
export class SmartTicketPlugin {}
