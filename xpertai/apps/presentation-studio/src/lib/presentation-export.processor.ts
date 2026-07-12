import { Injectable } from '@nestjs/common'
import { PluginJobProcessor, type ManagedQueueJob, type ManagedQueueJobProcessor } from '@xpert-ai/plugin-sdk'
import { PRESENTATION_EXPORT_JOB, PRESENTATION_EXPORT_QUEUE, PRESENTATION_STUDIO_PLUGIN_NAME } from './constants.js'
import { PresentationConfigService } from './presentation-config.service.js'
import { PresentationStudioService } from './presentation-studio.service.js'
import type { PresentationExportJobData } from './types.js'

@Injectable()
@PluginJobProcessor({
  pluginName: PRESENTATION_STUDIO_PLUGIN_NAME,
  queueName: PRESENTATION_EXPORT_QUEUE,
  jobName: PRESENTATION_EXPORT_JOB,
  concurrency: 4
})
export class PresentationExportProcessor implements ManagedQueueJobProcessor<PresentationExportJobData> {
  private active = 0
  private readonly waiters: Array<() => void> = []
  constructor(private readonly service: PresentationStudioService, private readonly config: PresentationConfigService) {}

  async handle(job: ManagedQueueJob<PresentationExportJobData>) {
    await this.acquire()
    try {
      await this.service.processExportJob(job.data)
    } finally {
      this.release()
    }
  }

  private async acquire() {
    if (this.active < this.config.get().exportConcurrency) {
      this.active += 1
      return
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve))
    this.active += 1
  }

  private release() {
    this.active = Math.max(0, this.active - 1)
    this.waiters.shift()?.()
  }
}
