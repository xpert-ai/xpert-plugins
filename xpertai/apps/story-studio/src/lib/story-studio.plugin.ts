import { TypeOrmModule } from '@nestjs/typeorm'
import {
  XpertServerPlugin,
  type IOnPluginBootstrap,
  type IOnPluginDestroy
} from '@xpert-ai/plugin-sdk'
import {
  StoryActionLog,
  StoryCutHandoff,
  StoryProduction,
  StoryProject
} from './entities/index.js'
import { StoryGeneratedMediaService } from './story-generated-media.service.js'
import { StoryCutHandoffService } from './story-cut-handoff.service.js'
import { StoryProductionService } from './story-production.service.js'
import { StoryStudioMiddleware } from './story-studio.middleware.js'
import { StoryStudioService } from './story-studio.service.js'
import { StoryStudioViewProvider } from './story-studio-view.provider.js'

export const STORY_STUDIO_ENTITIES = [
  StoryProject,
  StoryActionLog,
  StoryCutHandoff,
  StoryProduction
]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(STORY_STUDIO_ENTITIES)],
  entities: STORY_STUDIO_ENTITIES,
  providers: [
    StoryStudioService,
    StoryProductionService,
    StoryGeneratedMediaService,
    StoryCutHandoffService,
    StoryStudioMiddleware,
    StoryStudioViewProvider
  ],
  exports: [
    StoryStudioService,
    StoryProductionService,
    StoryGeneratedMediaService,
    StoryCutHandoffService
  ]
})
export class StoryStudioPlugin
  implements IOnPluginBootstrap, IOnPluginDestroy
{
  onPluginBootstrap(): void {
    // No plugin-owned worker lifecycle is required.
  }

  onPluginDestroy(): void {
    // No plugin-owned workers or connections exist in the foundation milestone.
  }
}
