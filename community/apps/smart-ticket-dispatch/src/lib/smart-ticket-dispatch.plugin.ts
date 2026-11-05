import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { SmartTicketDispatchMiddleware } from './smart-ticket-dispatch.middleware'
import { SmartTicketDispatchService } from './smart-ticket-dispatch.service'
import { SmartTicketDispatchViewProvider } from './smart-ticket-dispatch-view.provider'
import { SmartTicket, SmartTicketLog } from './entities'

const SMART_TICKET_ENTITIES = [SmartTicket, SmartTicketLog]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(SMART_TICKET_ENTITIES)],
  entities: SMART_TICKET_ENTITIES,
  providers: [SmartTicketDispatchService, SmartTicketDispatchMiddleware, SmartTicketDispatchViewProvider],
  exports: [SmartTicketDispatchService]
})
export class SmartTicketDispatchPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${SmartTicketDispatchPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${SmartTicketDispatchPlugin.name} is being destroyed...`)
  }
}
