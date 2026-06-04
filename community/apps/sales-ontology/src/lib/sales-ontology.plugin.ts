import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import {
  SalesOntologyActionGovernanceMiddleware,
  SalesOntologyContextMiddleware,
  SalesOntologyDecisionMiddleware,
  SalesOntologyMiddleware,
  SalesOntologyScenarioLearningMiddleware
} from './sales-ontology.middleware.js'
import { SalesOntologyClientService } from './sales-ontology-client.service.js'
import { SalesOntologyService } from './sales-ontology.service.js'
import { SalesOntologyViewProvider } from './sales-ontology-view.provider.js'
import {
  SalesOntologyActionProposal,
  SalesOntologyDecisionEffect,
  SalesOntologyDecisionRun,
  SalesOntologyExecutionLog,
  SalesOntologyMemory,
  SalesOntologyNotification,
  SalesOntologyPerceptionResult,
  SalesOntologyReminder,
  SalesOntologyScenario,
  SalesOntologySuggestion
} from './entities/index.js'

const SALES_ONTOLOGY_ENTITIES = [
  SalesOntologyDecisionRun,
  SalesOntologyPerceptionResult,
  SalesOntologySuggestion,
  SalesOntologyActionProposal,
  SalesOntologyExecutionLog,
  SalesOntologyDecisionEffect,
  SalesOntologyNotification,
  SalesOntologyReminder,
  SalesOntologyScenario,
  SalesOntologyMemory
]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(SALES_ONTOLOGY_ENTITIES)],
  entities: SALES_ONTOLOGY_ENTITIES,
  providers: [
    SalesOntologyClientService,
    SalesOntologyService,
    SalesOntologyMiddleware,
    SalesOntologyContextMiddleware,
    SalesOntologyDecisionMiddleware,
    SalesOntologyActionGovernanceMiddleware,
    SalesOntologyScenarioLearningMiddleware,
    SalesOntologyViewProvider
  ],
  exports: [SalesOntologyClientService, SalesOntologyService]
})
export class SalesOntologyPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${SalesOntologyPlugin.name} is being bootstrapped...`)
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${SalesOntologyPlugin.name} is being destroyed...`)
    }
  }
}
