import { Inject, Injectable } from '@nestjs/common'
import {
  PluginJobProcessor,
  type ManagedQueueJob,
  type ManagedQueueJobContext,
} from '@xpert-ai/plugin-sdk'
import { PLUGIN_NAME } from '../artifact-namespace.js'
import {
  MaterialTaskService,
  TASK_QUEUE,
  TASK_JOB,
  SUPERVISE_JOB,
  type TaskPayload,
} from './task.service.js'
import { RUNTIME_SCOPE, type InstallationScope } from './config.js'
@Injectable()
@PluginJobProcessor({
  pluginName: PLUGIN_NAME,
  queueName: TASK_QUEUE,
  jobName: TASK_JOB,
  concurrency: 4,
})
@PluginJobProcessor({
  pluginName: PLUGIN_NAME,
  queueName: TASK_QUEUE,
  jobName: SUPERVISE_JOB,
  concurrency: 4,
})
export class MaterialTaskProcessor {
  constructor(
    private readonly tasks: MaterialTaskService,
    @Inject(RUNTIME_SCOPE) private readonly installation: InstallationScope,
  ) {}
  async handle(
    job: ManagedQueueJob<TaskPayload>,
    context: ManagedQueueJobContext,
  ) {
    const p = job.data
    if (
      context.pluginName !== PLUGIN_NAME ||
      context.queueName !== TASK_QUEUE ||
      context.scopeKey !== this.installation.scopeKey ||
      context.tenantId !== p.tenantId ||
      context.organizationId !== p.organizationId ||
      context.userId !== p.userId
    )
      throw new Error('queue_scope_mismatch')
    if (context.jobName === TASK_JOB) await this.tasks.launch(p)
    else if (context.jobName === SUPERVISE_JOB) await this.tasks.supervise(p)
    else throw new Error('unsupported_job')
  }
}
