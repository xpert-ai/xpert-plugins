import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { IntakeCase } from './intake-case.entity.js'
import { IntakePhoto } from './intake-photo.entity.js'
import { PhotoIntakeMiddleware } from './intake.middleware.js'
import { IntakeAnalyzer } from './intake.analyzer.js'
import { IntakeService } from './intake.service.js'
import { PhotoIntakeViewProvider } from './intake-view.provider.js'
import { EvaluationRun } from './evaluation-run.entity.js'
import { EvaluationService } from './evaluation.service.js'
import { EvaluationRunner } from './evaluation.runner.js'

export const ENTITIES = [IntakeCase, IntakePhoto, EvaluationRun]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  entities: ENTITIES,
  providers: [IntakeService, EvaluationService, EvaluationRunner, IntakeAnalyzer, PhotoIntakeMiddleware, PhotoIntakeViewProvider],
  exports: [IntakeService]
})
export class PhotoIntakePlugin {}
