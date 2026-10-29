import type { ModuleMetadata } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ComplaintAssistantTaskService } from './complaint-assistant-task.service.js'
import { ComplaintCaseService } from './complaint-case.service.js'
import { ComplaintTriageTools } from './complaint-tools.js'
import { ComplaintTriageViewProvider } from './complaint-triage-view.provider.js'
import { ComplaintCaseEntity } from './entities/complaint-case.entity.js'

export const COMPLAINT_TRIAGE_ENTITIES = [ComplaintCaseEntity]

const complaintTriageModuleMetadata: ModuleMetadata & {
  entities: typeof COMPLAINT_TRIAGE_ENTITIES
} = {
  imports: [TypeOrmModule.forFeature(COMPLAINT_TRIAGE_ENTITIES)],
  entities: COMPLAINT_TRIAGE_ENTITIES,
  providers: [
    ComplaintCaseService,
    ComplaintAssistantTaskService,
    ComplaintTriageTools,
    ComplaintTriageViewProvider
  ],
  exports: [ComplaintCaseService, ComplaintAssistantTaskService, ComplaintTriageTools]
}

@XpertServerPlugin(complaintTriageModuleMetadata)
export class ComplaintTriagePlugin {}
