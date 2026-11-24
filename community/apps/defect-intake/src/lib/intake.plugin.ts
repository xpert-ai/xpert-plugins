import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { IntakeEntity } from './intake.entity'
import { IntakeService } from './intake.service'
import { IntakeViewProvider } from './intake-view.provider'
import { IntakeMiddleware } from './intake.middleware'
import { AnalysisAttempt } from './analysis/attempt.entity'
import { AnalysisService } from './analysis/analysis.service'
import { AnalysisProcessor } from './analysis/analysis.processor'

@XpertServerPlugin({ imports: [TypeOrmModule.forFeature([IntakeEntity, AnalysisAttempt])], entities: [IntakeEntity, AnalysisAttempt], providers: [IntakeService, AnalysisService, AnalysisProcessor, IntakeViewProvider, IntakeMiddleware] })
export class IntakePlugin {}
