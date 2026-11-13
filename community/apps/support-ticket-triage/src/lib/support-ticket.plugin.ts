import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { SupportTicketEntity } from './entities/support-ticket.entity.js'
import { SupportTicketTriageMiddleware } from './support-ticket.middleware.js'
import { SupportTicketService } from './support-ticket.service.js'
import { SupportTicketViewProvider } from './support-ticket-view.provider.js'

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature([SupportTicketEntity])],
  entities: [SupportTicketEntity],
  providers: [SupportTicketService, SupportTicketTriageMiddleware, SupportTicketViewProvider],
  exports: [SupportTicketService]
})
export class SupportTicketPlugin {}
