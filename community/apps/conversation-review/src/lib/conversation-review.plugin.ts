import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ConversationReviewMiddleware } from './conversation-review.middleware'
import { ConversationReviewService } from './conversation-review.service'
import { ConversationReviewViewProvider } from './conversation-review-view.provider'
import { ConversationReviewRecord } from './entities'

const CONVERSATION_REVIEW_ENTITIES = [ConversationReviewRecord]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(CONVERSATION_REVIEW_ENTITIES)],
  entities: CONVERSATION_REVIEW_ENTITIES,
  providers: [ConversationReviewService, ConversationReviewMiddleware, ConversationReviewViewProvider],
  exports: [ConversationReviewService]
})
export class ConversationReviewPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${ConversationReviewPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${ConversationReviewPlugin.name} is being destroyed...`)
  }
}
