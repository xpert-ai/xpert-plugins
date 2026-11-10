import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ResumeCandidate } from './entities/index.js'
import { ResumeScore } from './entities/index.js'
import { ResumeScreening } from './entities/index.js'
import { ResumeScreeningMiddleware } from './resume-screening.middleware.js'
import { ResumeScreeningService } from './resume-screening.service.js'
import { ResumeScreeningViewProvider } from './resume-screening-view.provider.js'

export const RESUME_SCREENING_ENTITIES = [ResumeScreening, ResumeCandidate, ResumeScore]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(RESUME_SCREENING_ENTITIES)],
  entities: RESUME_SCREENING_ENTITIES,
  providers: [ResumeScreeningService, ResumeScreeningMiddleware, ResumeScreeningViewProvider],
  exports: [ResumeScreeningService]
})
export class ResumeScreeningPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${ResumeScreeningPlugin.name} is being bootstrapped...`)
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${ResumeScreeningPlugin.name} is being destroyed...`)
    }
  }
}
