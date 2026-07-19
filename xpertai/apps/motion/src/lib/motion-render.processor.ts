import { Injectable } from '@nestjs/common'
import { PluginJobProcessor, type ManagedQueueJob, type ManagedQueueJobProcessor } from '@xpert-ai/plugin-sdk'
import { MOTION_PLUGIN_NAME, MOTION_RENDER_JOB, MOTION_RENDER_QUEUE } from './constants.js'
import { MotionService } from './motion.service.js'
import type { MotionRenderQueueJobData } from './types.js'

@Injectable()
@PluginJobProcessor({
  pluginName: MOTION_PLUGIN_NAME,
  queueName: MOTION_RENDER_QUEUE,
  jobName: MOTION_RENDER_JOB,
  concurrency: 2
})
export class MotionRenderProcessor implements ManagedQueueJobProcessor<MotionRenderQueueJobData> {
  constructor(private readonly service: MotionService) {}

  async handle(job: ManagedQueueJob<MotionRenderQueueJobData>): Promise<void> {
    await this.service.processProductionRender(job)
  }
}
