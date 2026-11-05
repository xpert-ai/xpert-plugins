import { TypeOrmModule } from '@nestjs/typeorm'
import type { IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ListingAiRun, ListingDraft, ListingSpec, ListingTask } from './entities/index.js'
import { ListingAiService } from './listing-ai.service.js'
import { ListingAssistantMiddleware } from './listing-assistant.middleware.js'
import { ListingAssistantService } from './listing-assistant.service.js'
import { ListingAssistantViewProvider } from './listing-assistant-view.provider.js'

export const LISTING_ASSISTANT_ENTITIES = [ListingTask, ListingDraft, ListingSpec, ListingAiRun]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(LISTING_ASSISTANT_ENTITIES)],
  entities: LISTING_ASSISTANT_ENTITIES,
  providers: [ListingAiService, ListingAssistantService, ListingAssistantMiddleware, ListingAssistantViewProvider],
  exports: [ListingAssistantService]
})
export class ListingAssistantServerPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    console.log(`${ListingAssistantServerPlugin.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void | Promise<void> {
    console.log(`${ListingAssistantServerPlugin.name} is being destroyed...`)
  }
}
