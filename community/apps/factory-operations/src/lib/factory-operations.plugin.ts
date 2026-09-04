import { FactoryProfileMigration } from './migrations/assistant-profile.migration.js'
import { FactoryProfileService } from './factory-profile.service.js'
import { FactoryProfileAccessService } from './factory-profile-access.service.js'
import { FactoryApprovalPolicy } from './factory-approval-policy.service.js'
import { FactoryContinuationService } from './factory-continuation.service.js'
import { FactoryContinuationProcessor } from './factory-continuation.processor.js'
import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import {
  FactoryArtifactEntity,
  FactoryContinuationEntity,
  FactoryAuditEntity,
  FactoryCaseEntity,
  FactoryExecutionRecordEntity
} from './entities/index.js'
import { FactoryOperationsService } from './factory-operations.service.js'
import { FactoryCaseProjectService } from './factory-case-project.service.js'
import { FactoryAssistantTaskService } from './factory-assistant-task.service.js'
import { FactoryAssistantTaskProcessor } from './factory-assistant-task.processor.js'
import { FactoryOperationsInsightsTools, FactoryOperationsTools } from './factory-middlewares.js'
import { FactoryToolEventService } from './factory-tool-events.js'
import { FactoryOperationsViewProvider } from './factory-view.provider.js'

export const FACTORY_ENTITIES = [FactoryContinuationEntity,
  FactoryCaseEntity,
  FactoryArtifactEntity,
  FactoryAuditEntity,
  FactoryExecutionRecordEntity
]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(FACTORY_ENTITIES)],
  entities: FACTORY_ENTITIES,
  providers: [FactoryProfileMigration,FactoryProfileService, FactoryProfileAccessService, FactoryApprovalPolicy, FactoryContinuationService, FactoryContinuationProcessor,
    FactoryCaseProjectService,
    FactoryAssistantTaskService,
    FactoryAssistantTaskProcessor,
    FactoryOperationsService,
    FactoryToolEventService,
    FactoryOperationsInsightsTools,
    FactoryOperationsTools,
    FactoryOperationsViewProvider
  ],
  exports: [FactoryOperationsService, FactoryOperationsInsightsTools, FactoryOperationsTools]
})
export class FactoryOperationsPlugin {}
