import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { SupportTicket } from './entities'
import { SupportTicketMiddleware } from './support-ticket.middleware'
import { SupportTicketService } from './support-ticket.service'
import { SupportTicketViewProvider } from './support-ticket-view.provider'

const SUPPORT_TICKET_ENTITIES = [SupportTicket]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(SUPPORT_TICKET_ENTITIES)],
  entities: SUPPORT_TICKET_ENTITIES,
  providers: [SupportTicketService, SupportTicketMiddleware, SupportTicketViewProvider],
  exports: [SupportTicketService]
})
export class SupportTicketPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${SupportTicketPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${SupportTicketPlugin.name} is being destroyed...`)
  }
}
