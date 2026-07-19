import { Injectable } from '@nestjs/common'
import { PluginJobProcessor, type ManagedQueueJob, type ManagedQueueJobProcessor } from '@xpert-ai/plugin-sdk'
import { CUT_ANALYSIS_QUEUE_NAME, CUT_PLUGIN_NAME, CUT_RENDER_JOB_NAME } from './constants.js'
import { CutRenderService } from './cut-render.service.js'
import type { CutRenderQueueJobData } from './types.js'

@Injectable()
@PluginJobProcessor({
  pluginName: CUT_PLUGIN_NAME,
  queueName: CUT_ANALYSIS_QUEUE_NAME,
  jobName: CUT_RENDER_JOB_NAME,
  concurrency: 2
})
export class CutRenderProcessor implements ManagedQueueJobProcessor<CutRenderQueueJobData> {
  constructor(private readonly renders: CutRenderService) {}

  async handle(job: ManagedQueueJob<CutRenderQueueJobData>) {
    await this.renders.process(job)
  }
}
