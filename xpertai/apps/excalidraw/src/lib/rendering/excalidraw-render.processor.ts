import { z } from 'zod/v3'
import { Injectable } from '@nestjs/common'
import { PluginJobProcessor, type ManagedQueueJob, type ManagedQueueJobContext } from '@xpert-ai/plugin-sdk'
import { EXCALIDRAW_PLUGIN_NAME } from '../constants.js'
import { RENDER_QUEUE } from './render-contracts.js'
import { ExcalidrawRenderService } from './excalidraw-render.service.js'
@Injectable()
@PluginJobProcessor({ pluginName: EXCALIDRAW_PLUGIN_NAME, queueName: RENDER_QUEUE, jobName: 'render', concurrency: 1 })
export class ExcalidrawRenderProcessor {
  constructor(private readonly service: ExcalidrawRenderService) {}
  handle(job: ManagedQueueJob<{ jobId: string }>, context: ManagedQueueJobContext) {
    return this.service.process(z.object({ jobId: z.string().uuid() }).strict().parse(job.data).jobId, context)
  }
}
