import { Inject, Injectable } from '@nestjs/common'
import {
  PluginJobProcessor,
  type ManagedQueueJob,
  type ManagedQueueJobContext,
  type ManagedQueueJobProcessor
} from '@xpert-ai/plugin-sdk'
import {
  FACTORY_ASSISTANT_TASK_JOB,
  FACTORY_ASSISTANT_TASK_QUEUE,
  FACTORY_PLUGIN_NAME
} from './constants.js'
import {
  FACTORY_RUNTIME_SCOPE,
  type FactoryRuntimeScope
} from './config.js'
import {
  FactoryAssistantTaskService,
  type FactoryAssistantTaskQueuePayload
} from './factory-assistant-task.service.js'

@Injectable()
@PluginJobProcessor({
  pluginName: FACTORY_PLUGIN_NAME,
  queueName: FACTORY_ASSISTANT_TASK_QUEUE,
  jobName: FACTORY_ASSISTANT_TASK_JOB,
  concurrency: 4
})
export class FactoryAssistantTaskProcessor
  implements ManagedQueueJobProcessor<FactoryAssistantTaskQueuePayload>
{
  constructor(
    private readonly tasks: FactoryAssistantTaskService,
    @Inject(FACTORY_RUNTIME_SCOPE)
    private readonly runtimeScope: FactoryRuntimeScope
  ) {}

  async handle(
    job: ManagedQueueJob<FactoryAssistantTaskQueuePayload>,
    context: ManagedQueueJobContext
  ) {
    const payload = job.data
    if (
      context.pluginName !== FACTORY_PLUGIN_NAME ||
      context.queueName !== FACTORY_ASSISTANT_TASK_QUEUE ||
      context.jobName !== FACTORY_ASSISTANT_TASK_JOB ||
      context.tenantId !== payload.tenantId ||
      (context.organizationId ?? null) !== payload.organizationId ||
      context.scopeKey !== this.runtimeScope.scopeKey ||
      context.userId !== payload.userId
    ) {
      throw new Error('factory_queue_scope_mismatch')
    }
    try {
      await this.tasks.process(payload)
    } catch (error) {
      const configuredAttempts = readPositiveInteger(job.opts?.['attempts']) ?? 1
      const terminal = job.attemptsMade + 1 >= configuredAttempts
      await this.tasks.recordQueueFailure(payload, error, terminal)
      throw error
    }
  }
}

function readPositiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : undefined
}
