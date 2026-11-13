import { TypeOrmModule } from '@nestjs/typeorm'
import { Logger } from '@nestjs/common'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ResumeCandidate } from './entities/index.js'
import { ResumeScore } from './entities/index.js'
import { ResumeScreening } from './entities/index.js'
import { ResumeScreeningMiddleware } from './resume-screening.middleware.js'
import { ResumeScreeningService } from './resume-screening.service.js'
import { ResumeScreeningViewProvider } from './resume-screening-view.provider.js'
import { ResumeScoringTask } from './entities/resume-scoring-task.entity.js'

export const RESUME_SCREENING_ENTITIES = [ResumeScreening, ResumeCandidate, ResumeScore, ResumeScoringTask]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(RESUME_SCREENING_ENTITIES)],
  entities: RESUME_SCREENING_ENTITIES,
  providers: [
    { provide: Logger, useFactory: () => new Logger('ResumeScreeningPlugin') },
    ResumeScreeningService, ResumeScreeningMiddleware, ResumeScreeningViewProvider
  ],
  exports: [ResumeScreeningService]
})
export class ResumeScreeningPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  constructor(private readonly logger: Logger) {}

  onPluginBootstrap(): void | Promise<void> {
    this.logger.log('Resume screening plugin bootstrapped')
  }

  onPluginDestroy(): void | Promise<void> {
    this.logger.log('Resume screening plugin destroyed')
  }
}
