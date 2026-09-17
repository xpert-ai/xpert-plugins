import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { Repository } from 'typeorm'
import {
  MANAGED_QUEUE_SERVICE_TOKEN,
  PluginJobProcessor,
  type ManagedQueueService,
  type ManagedQueueJob,
  type ManagedQueueJobContext,
} from '@xpert-ai/plugin-sdk'
import { StudioRecord } from './entities.js'
import { StudioService, scopeWhere, safeError } from './studio.service.js'
import { PLUGIN } from './constants.js'
import type { StudioScope, Target } from './types.js'
interface JobPayload {
  id: string
  workspaceId: string
  xpertId: string
  kind: 'plan' | 'snapshot'
}
@Injectable()
export class StudioJobs {
  constructor(
    @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly queue: ManagedQueueService,
    @InjectRepository(StudioRecord) private readonly records: Repository<StudioRecord>,
    private readonly service: StudioService
  ) {}
  async schedulePlan(scope: StudioScope, id: string) {
    if (this.service.testReadOnly()) throw new Error('read_only_test_mode')
    const plan = await this.service.record(scope, id)
    if (plan.kind !== 'plan') throw new Error('plan_required')
    const target = plan.payload.target as Target | undefined
    if (target?.sessionId) return this.service.executePlan(scope, id)
    if (['succeeded', 'running', 'pending', 'unknown'].includes(plan.status)) return plan
    if (plan.status !== 'ready' && plan.status !== 'queued') throw new Error('plan_not_ready')
    if (plan.status === 'ready') {
      const claimed = await this.records.update(
        { ...scopeWhere(scope), id, status: 'ready', revision: plan.revision },
        { status: 'queued', revision: plan.revision + 1 }
      )
      if (claimed.affected !== 1) throw new Error('plan_claim_conflict')
    }
    await this.enqueue(scope, id, 'plan')
    return this.service.record(scope, id)
  }
  async snapshot(scope: StudioScope, target: Target, title: string) {
    // Validate the binding before persisting work, then revalidate in the restored worker.
    await this.service.policy(scope, target.dataSourceId)
    const record = await this.records.save(
      this.records.create({
        ...scopeWhere(scope),
        xpertId: scope.xpertId,
        id: randomUUID(),
        kind: 'transfer',
        status: 'queued',
        dataSourceId: target.dataSourceId,
        title,
        payload: { target, operation: 'snapshot' },
        revision: 1,
      })
    )
    await this.enqueue(scope, record.id, 'snapshot')
    return record
  }
  private async enqueue(scope: StudioScope, id: string, kind: JobPayload['kind']) {
    const job = await this.queue.enqueue({
      pluginName: PLUGIN,
      queueName: 'db-studio.operations',
      jobName: 'operate',
      scopeKey: 'system:global',
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      userId: scope.userId,
      jobId: `db-studio-${id}`,
      payload: { id, kind, workspaceId: scope.workspaceId, xpertId: scope.xpertId },
      attempts: 1,
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 604800, count: 1000 },
    })
    await this.records.update({ ...scopeWhere(scope), id }, { queueJobId: job.jobId })
    return job
  }
  async process(job: ManagedQueueJob<JobPayload>, context: ManagedQueueJobContext) {
    if (context.pluginName !== PLUGIN || !context.tenantId || !context.organizationId || !context.userId)
      throw new Error('queue_identity_required')
    const scope: StudioScope = {
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      userId: context.userId,
      workspaceId: job.data.workspaceId,
      xpertId: job.data.xpertId,
    }
    const canonical = await this.service.scope(scope)
    if (canonical.workspaceId !== scope.workspaceId) throw new Error('assistant_workspace_changed')
    if (job.data.kind === 'plan') {
      try {
        await this.service.executePlan(scope, job.data.id)
      } catch (error) {
        await this.records.update({ ...scopeWhere(scope), id: job.data.id, status: 'queued' }, { status: 'failed' })
        throw error
      }
      return
    }
    const task = await this.service.record(scope, job.data.id)
    if (task.kind !== 'transfer' || task.payload.operation !== 'snapshot') throw new Error('snapshot_job_required')
    const claimed = await this.records.update(
      { ...scopeWhere(scope), id: task.id, status: 'queued' },
      { status: 'running' }
    )
    if (claimed.affected !== 1) return
    try {
      const snapshot = await this.service.snapshot(scope, task.payload.target as Target, task.title)
      await this.records.update(
        { ...scopeWhere(scope), id: task.id, status: 'running' },
        { status: 'succeeded', payload: { snapshotId: snapshot.id } }
      )
    } catch (error) {
      await this.records.update(
        { ...scopeWhere(scope), id: task.id, status: 'running' },
        { status: 'failed', payload: { error: safeError(error) } }
      )
      throw error
    }
  }
}
@Injectable()
@PluginJobProcessor({ pluginName: PLUGIN, queueName: 'db-studio.operations', jobName: 'operate', concurrency: 2 })
export class StudioJobProcessor {
  constructor(private readonly jobs: StudioJobs) {}
  handle(job: ManagedQueueJob<JobPayload>, context: ManagedQueueJobContext) {
    return this.jobs.process(job, context)
  }
}
