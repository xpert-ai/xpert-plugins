import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { OntoAgentGovernedContextMiddleware } from './ontoagent.middleware.js'
import { OntoAgentService } from './ontoagent.service.js'
import { OntoAgentViewProvider } from './ontoagent-view.provider.js'
import { OntoAgentAnswerRecord, OntoAgentSyncRun } from './entities/index.js'

const ONTOAGENT_ENTITIES = [OntoAgentAnswerRecord, OntoAgentSyncRun]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(ONTOAGENT_ENTITIES)],
  entities: ONTOAGENT_ENTITIES,
  providers: [OntoAgentService, OntoAgentGovernedContextMiddleware, OntoAgentViewProvider],
  exports: [OntoAgentService]
})
export class OntoAgentPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void {
    console.log(`${OntoAgentPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void {
    console.log(`${OntoAgentPlugin.name} is being destroyed...`)
  }
}
