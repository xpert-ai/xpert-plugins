import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { SqlReviewCase, SqlReviewFinding } from './entities'
import { SqlReviewRulesService } from './rules/sql-review-rules.service'
import { SqlReviewMiddleware } from './sql-review.middleware'
import { SqlReviewService } from './sql-review.service'
import { SqlReviewViewProvider } from './sql-review-view.provider'

const SQL_REVIEW_ENTITIES = [SqlReviewCase, SqlReviewFinding]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(SQL_REVIEW_ENTITIES)],
  entities: SQL_REVIEW_ENTITIES,
  providers: [SqlReviewRulesService, SqlReviewService, SqlReviewMiddleware, SqlReviewViewProvider],
  exports: [SqlReviewService]
})
export class SqlReviewPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${SqlReviewPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${SqlReviewPlugin.name} is being destroyed...`)
  }
}
