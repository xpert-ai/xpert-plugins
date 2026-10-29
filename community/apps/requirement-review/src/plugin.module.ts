import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { Review } from './entities/review.entity.js'
import { AnalysisAttempt } from './entities/analysis-attempt.entity.js'
import { ReviewService } from './services/review.service.js'
import { ReviewMiddleware } from './middleware.js'
import { ReviewViewProvider } from './view.provider.js'

export const ENTITIES = [Review, AnalysisAttempt]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  entities: ENTITIES,
  providers: [ReviewService, ReviewMiddleware, ReviewViewProvider],
  exports: [ReviewService]
})
export class RequirementReviewPlugin {}
