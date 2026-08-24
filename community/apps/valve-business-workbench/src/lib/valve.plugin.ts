import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ValveDataXpertClient } from './data-xpert-client.service'
import { ValveActionEvent, ValveActionProposal } from './entities'
import { ValveBusinessService } from './valve-business.service'
import { ValveMiddleware } from './valve.middleware'
import { ValveViewProvider } from './valve-view.provider'

const VALVE_ENTITIES = [ValveActionProposal, ValveActionEvent]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(VALVE_ENTITIES)],
  entities: VALVE_ENTITIES,
  providers: [ValveDataXpertClient, ValveBusinessService, ValveMiddleware, ValveViewProvider],
  exports: [ValveDataXpertClient, ValveBusinessService]
})
export class ValveBusinessWorkbenchPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void {
    console.log(`${ValveBusinessWorkbenchPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void {
    console.log(`${ValveBusinessWorkbenchPlugin.name} is being destroyed...`)
  }
}
