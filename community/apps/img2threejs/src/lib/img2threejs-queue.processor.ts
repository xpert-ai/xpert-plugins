import { Injectable } from '@nestjs/common'
import {
  PluginJobProcessor,
  type ManagedQueueJob
} from '@xpert-ai/plugin-sdk'
import {
  IMG2THREEJS_PLUGIN_NAME,
  IMG2THREEJS_QUEUE_NAME,
  IMG2THREEJS_RENDER_JOB_NAME,
  IMG2THREEJS_STAGE_JOB_NAME
} from './constants.js'
import {
  Img2ThreeJsService,
  type QueueStagePayload
} from './img2threejs.service.js'
import { scopeFromRequestContext } from './img2threejs.service-support.js'
import {
  Img2ThreeJsRenderService,
  type QueueRenderPayload
} from './img2threejs-render.service.js'

@PluginJobProcessor({
  pluginName: IMG2THREEJS_PLUGIN_NAME,
  queueName: IMG2THREEJS_QUEUE_NAME,
  jobName: IMG2THREEJS_STAGE_JOB_NAME,
  concurrency: 1
})
@Injectable()
export class Img2ThreeJsQueueProcessor {
  constructor(private readonly service: Img2ThreeJsService) {}

  async handle(job: ManagedQueueJob<QueueStagePayload>): Promise<void> {
    const scope = scopeFromRequestContext()
    try {
      await this.service.processStage(scope, job.data)
    } catch (error) {
      const attempts = Number(job.opts?.attempts ?? 1)
      if (job.attemptsMade + 1 >= attempts) {
        await this.service.recordStageProcessingFailure(scope, job.data, error)
      }
      throw error
    }
  }
}

@PluginJobProcessor({
  pluginName: IMG2THREEJS_PLUGIN_NAME,
  queueName: IMG2THREEJS_QUEUE_NAME,
  jobName: IMG2THREEJS_RENDER_JOB_NAME,
  concurrency: 2
})
@Injectable()
export class Img2ThreeJsRenderQueueProcessor {
  constructor(private readonly render: Img2ThreeJsRenderService) {}

  async handle(job: ManagedQueueJob<QueueRenderPayload>, context: {
    tenantId?: string | null
    organizationId?: string | null
    userId?: string | null
  }): Promise<void> {
    if (!context.tenantId) throw new Error('QUEUE_TENANT_SCOPE_REQUIRED')
    await this.render.processRender(job, {
      tenantId: context.tenantId,
      organizationId: context.organizationId ?? null,
      userId: context.userId ?? null
    })
  }
}
