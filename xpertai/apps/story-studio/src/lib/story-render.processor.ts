import { Injectable } from '@nestjs/common'
import {
  PluginJobProcessor,
  type ManagedQueueJob,
  type ManagedQueueJobProcessor
} from '@xpert-ai/plugin-sdk'
import {
  STORY_RENDER_JOB_NAME,
  STORY_RENDER_QUEUE_NAME,
  STORY_STUDIO_PLUGIN_NAME
} from './constants.js'
import type { StoryRenderQueueJobData } from './production-types.js'
import { StoryProductionService } from './story-production.service.js'

@Injectable()
@PluginJobProcessor({
  pluginName: STORY_STUDIO_PLUGIN_NAME,
  queueName: STORY_RENDER_QUEUE_NAME,
  jobName: STORY_RENDER_JOB_NAME,
  concurrency: 2
})
export class StoryRenderProcessor
  implements ManagedQueueJobProcessor<StoryRenderQueueJobData>
{
  constructor(private readonly production: StoryProductionService) {}

  async handle(job: ManagedQueueJob<StoryRenderQueueJobData>) {
    await this.production.processRender(job)
  }
}
