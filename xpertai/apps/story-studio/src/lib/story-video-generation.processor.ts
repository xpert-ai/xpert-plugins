import { Injectable } from '@nestjs/common'
import {
  PluginJobProcessor,
  type ManagedQueueJob,
  type ManagedQueueJobProcessor
} from '@xpert-ai/plugin-sdk'
import {
  STORY_STUDIO_PLUGIN_NAME,
  STORY_VIDEO_GENERATION_POLL_JOB,
  STORY_VIDEO_GENERATION_QUEUE,
  STORY_VIDEO_GENERATION_SUBMIT_JOB
} from './constants.js'
import {
  StoryVideoGenerationService,
  type StoryVideoGenerationQueuePayload
} from './story-video-generation.service.js'

@Injectable()
@PluginJobProcessor({
  pluginName: STORY_STUDIO_PLUGIN_NAME,
  queueName: STORY_VIDEO_GENERATION_QUEUE,
  jobName: STORY_VIDEO_GENERATION_SUBMIT_JOB,
  concurrency: 4
})
export class StoryVideoGenerationSubmitProcessor
  implements ManagedQueueJobProcessor<StoryVideoGenerationQueuePayload>
{
  constructor(private readonly service: StoryVideoGenerationService) {}

  async handle(job: ManagedQueueJob<StoryVideoGenerationQueuePayload>) {
    await this.service.processSubmit(job.data.taskId)
  }
}

@Injectable()
@PluginJobProcessor({
  pluginName: STORY_STUDIO_PLUGIN_NAME,
  queueName: STORY_VIDEO_GENERATION_QUEUE,
  jobName: STORY_VIDEO_GENERATION_POLL_JOB,
  concurrency: 8
})
export class StoryVideoGenerationPollProcessor
  implements ManagedQueueJobProcessor<StoryVideoGenerationQueuePayload>
{
  constructor(private readonly service: StoryVideoGenerationService) {}

  async handle(job: ManagedQueueJob<StoryVideoGenerationQueuePayload>) {
    await this.service.processPoll(job.data.taskId)
  }
}
