import { Injectable } from '@nestjs/common'
import { PluginJobProcessor, type ManagedQueueJob, type ManagedQueueJobContext } from '@xpert-ai/plugin-sdk'
import { PPTX_PLUGIN } from './constants.js'
import { PptxPreview, PPTX_COVER_QUEUE, type CoverJob } from './preview.js'

@Injectable()
@PluginJobProcessor({ pluginName: PPTX_PLUGIN, queueName: PPTX_COVER_QUEUE, jobName: 'render', concurrency: 1 })
export class PptxPreviewProcessor {
  constructor(private readonly previews: PptxPreview) {}
  async handle(job: ManagedQueueJob<CoverJob>, context: ManagedQueueJobContext) {
    await this.previews.process(job.data, context)
  }
}
