import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { CandidateApplication, CandidateJob } from './entities/index.js'
import { CandidateIntakeController } from './candidate-intake.controller.js'
import { CandidateIntakeMiddleware } from './candidate-intake.middleware.js'
import { CandidateIntakeService } from './candidate-intake.service.js'
import { CandidateIntakeViewProvider } from './candidate-intake-view.provider.js'

export const CANDIDATE_INTAKE_ENTITIES = [CandidateJob, CandidateApplication]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(CANDIDATE_INTAKE_ENTITIES)],
  entities: CANDIDATE_INTAKE_ENTITIES,
  controllers: [CandidateIntakeController],
  providers: [CandidateIntakeService, CandidateIntakeMiddleware, CandidateIntakeViewProvider],
  exports: [CandidateIntakeService]
})
export class CandidateIntakePlugin {}
