import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { TicketBoardViewProvider } from './board-view.provider.js'
import { TicketRecord } from './ticket.entity.js'
import { TicketTriageService } from './ticket.service.js'
import { TicketTriageMiddleware } from './triage.middleware.js'

export const ENTITIES = [TicketRecord]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  entities: ENTITIES,
  providers: [TicketTriageService, TicketTriageMiddleware, TicketBoardViewProvider],
  exports: [TicketTriageService]
})
export class TicketTriagePlugin {}
