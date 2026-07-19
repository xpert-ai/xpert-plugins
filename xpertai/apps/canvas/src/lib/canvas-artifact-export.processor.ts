import { Injectable } from '@nestjs/common'
import {
  PluginJobProcessor,
  type ManagedQueueJob,
  type ManagedQueueJobContext,
  type ManagedQueueJobProcessor
} from '@xpert-ai/plugin-sdk'
import {
  CANVAS_ARTIFACT_EXPORT_JOB,
  CANVAS_ARTIFACT_EXPORT_QUEUE,
  CANVAS_PLUGIN_NAME
} from './constants.js'
import { CanvasArtifactExportService, type CanvasArtifactExportJobData } from './canvas-artifact-export.service.js'

@Injectable()
@PluginJobProcessor({
  pluginName: CANVAS_PLUGIN_NAME,
  queueName: CANVAS_ARTIFACT_EXPORT_QUEUE,
  jobName: CANVAS_ARTIFACT_EXPORT_JOB,
  concurrency: 2
})
export class CanvasArtifactExportProcessor implements ManagedQueueJobProcessor<CanvasArtifactExportJobData> {
  constructor(private readonly service: CanvasArtifactExportService) {}

  async handle(job: ManagedQueueJob<CanvasArtifactExportJobData>, context: ManagedQueueJobContext) {
    await this.service.processExportJob(job.data, context)
  }
}
