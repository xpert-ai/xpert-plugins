import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ResumeCandidate, ResumeScreeningJob } from './entities/index.js'
import { ResumeScreeningAssistantMiddleware } from './resume-screening-assistant.middleware.js'
import { ResumeScreeningAssistantService } from './resume-screening-assistant.service.js'
import { ResumeScreeningAssistantViewProvider } from './resume-screening-assistant-view.provider.js'

export const RESUME_SCREENING_ASSISTANT_ENTITIES = [ResumeScreeningJob, ResumeCandidate]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(RESUME_SCREENING_ASSISTANT_ENTITIES)],
  entities: RESUME_SCREENING_ASSISTANT_ENTITIES,
  providers: [
    ResumeScreeningAssistantService,
    ResumeScreeningAssistantMiddleware,
    ResumeScreeningAssistantViewProvider
  ],
  exports: [ResumeScreeningAssistantService]
})
export class ResumeScreeningAssistantPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${ResumeScreeningAssistantPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${ResumeScreeningAssistantPlugin.name} is being destroyed...`)
  }
}
