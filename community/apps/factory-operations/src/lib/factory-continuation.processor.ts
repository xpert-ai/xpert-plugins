import { Injectable } from '@nestjs/common'
import { PluginJobProcessor, type ManagedQueueJob, type ManagedQueueJobContext, type ManagedQueueJobProcessor } from '@xpert-ai/plugin-sdk'
import { FACTORY_PLUGIN_NAME } from './constants.js'
import { FACTORY_CONTINUATION_JOB, FACTORY_CONTINUATION_QUEUE, FactoryContinuationService, type FactoryContinuationJob } from './factory-continuation.service.js'

@Injectable()
@PluginJobProcessor({ pluginName: FACTORY_PLUGIN_NAME, queueName: FACTORY_CONTINUATION_QUEUE, jobName: FACTORY_CONTINUATION_JOB, concurrency: 4 })
export class FactoryContinuationProcessor implements ManagedQueueJobProcessor<FactoryContinuationJob> {
  constructor(private readonly continuations: FactoryContinuationService) {}
  async handle(job: ManagedQueueJob<FactoryContinuationJob>, context: ManagedQueueJobContext) {
    if (context.pluginName !== FACTORY_PLUGIN_NAME || context.queueName !== FACTORY_CONTINUATION_QUEUE || context.jobName !== FACTORY_CONTINUATION_JOB) {
      throw new Error('factory_continuation_queue_mismatch')
    }
    await this.continuations.advance(job.data, context)
  }
}
