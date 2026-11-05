import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ContractReviewCase, ContractReviewClause } from './entities'
import { ContractReviewMiddleware } from './contract-review.middleware'
import { ContractReviewService } from './contract-review.service'
import { ContractReviewViewProvider } from './contract-review-view.provider'

export const CONTRACT_REVIEW_ENTITIES = [ContractReviewCase, ContractReviewClause]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(CONTRACT_REVIEW_ENTITIES)],
  entities: CONTRACT_REVIEW_ENTITIES,
  providers: [ContractReviewService, ContractReviewMiddleware, ContractReviewViewProvider],
  exports: [ContractReviewService]
})
export class ContractReviewPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${ContractReviewPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${ContractReviewPlugin.name} is being destroyed...`)
  }
}
