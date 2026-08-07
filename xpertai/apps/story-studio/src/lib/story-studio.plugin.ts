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
  StoryProject,
  StoryShotContinuityBoundary,
  StoryVideoGenerationTask
} from './entities/index.js'
import { StoryGeneratedMediaService } from './story-generated-media.service.js'
import { StoryAdaptationSuggestionService } from './story-adaptation-suggestion.service.js'
import { StoryCutHandoffService } from './story-cut-handoff.service.js'
import { StoryProductionService } from './story-production.service.js'
import { StoryStudioMiddleware } from './story-studio.middleware.js'
import { StoryStudioService } from './story-studio.service.js'
import { StoryStudioViewProvider } from './story-studio-view.provider.js'
import { StoryVideoGenerationService } from './story-video-generation.service.js'
import {
  StoryVideoGenerationPollProcessor,
  StoryVideoGenerationSubmitProcessor
} from './story-video-generation.processor.js'

export const STORY_STUDIO_ENTITIES = [
  StoryProject,
  StoryActionLog,
  StoryCutHandoff,
  StoryProduction,
  StoryShotContinuityBoundary,
  StoryVideoGenerationTask
]

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(STORY_STUDIO_ENTITIES)],
  entities: STORY_STUDIO_ENTITIES,
  providers: [
    StoryStudioService,
    StoryProductionService,
    StoryAdaptationSuggestionService,
    StoryGeneratedMediaService,
    StoryCutHandoffService,
    StoryVideoGenerationService,
    StoryVideoGenerationSubmitProcessor,
    StoryVideoGenerationPollProcessor,
    StoryStudioMiddleware,
    StoryStudioViewProvider
  ],
  exports: [
    StoryStudioService,
    StoryProductionService,
    StoryAdaptationSuggestionService,
    StoryGeneratedMediaService,
    StoryCutHandoffService,
    StoryVideoGenerationService
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
