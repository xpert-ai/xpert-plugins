import { FactoryPipelineEvidence } from './pipeline/entity.js'
import { FactoryPipelineService } from './pipeline/service.js'
import { FactoryPipelineContribution } from './pipeline/configuration.js'
import { factoryPipelineAdapters } from './pipeline/adapters.js'
import { FactoryProjectTypeProvider } from './factory-project-type.provider.js'
import { FactoryProfileMigration } from './migrations/assistant-profile.migration.js'
import { FactoryProfileService } from './factory-profile.service.js'
import { FactoryProfileAccessService } from './factory-profile-access.service.js'
import { FactoryApprovalPolicy } from './factory-approval-policy.service.js'
import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import {
  FactoryArtifactEntity,
  FactoryAuditEntity,
  FactoryCaseEntity,
  FactoryExecutionRecordEntity
} from './entities/index.js'
import { FactoryOperationsService } from './factory-operations.service.js'
import { FactoryCaseProjectService } from './factory-case-project.service.js'
import { FactoryOperationsInsightsTools, FactoryOperationsTools } from './factory-middlewares.js'
import { FactoryToolEventService } from './factory-tool-events.js'
import { FactoryOperationsViewProvider } from './factory-view.provider.js'

export const FACTORY_ENTITIES = [FactoryPipelineEvidence,
  FactoryCaseEntity,
  FactoryArtifactEntity,
  FactoryAuditEntity,
  FactoryExecutionRecordEntity
]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(FACTORY_ENTITIES)],
  entities: FACTORY_ENTITIES,
  providers: [FactoryPipelineService, FactoryPipelineContribution, ...factoryPipelineAdapters, FactoryProfileMigration,FactoryProfileService, FactoryProfileAccessService, FactoryApprovalPolicy,
    FactoryProjectTypeProvider,
    FactoryCaseProjectService,
    FactoryOperationsService,
    FactoryToolEventService,
    FactoryOperationsInsightsTools,
    FactoryOperationsTools,
    FactoryOperationsViewProvider
  ],
  exports: [FactoryOperationsService, FactoryOperationsInsightsTools, FactoryOperationsTools]
})
export class FactoryOperationsPlugin {}
