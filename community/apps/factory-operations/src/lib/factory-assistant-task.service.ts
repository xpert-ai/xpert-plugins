import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  MANAGED_QUEUE_SERVICE_TOKEN,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type ManagedQueueService,
  type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import { createHash } from 'node:crypto'
import { IsNull, type FindOptionsWhere, type Repository } from 'typeorm'
import {
  AGENT_KEYS,
  FACTORY_ASSISTANT_TASK_JOB,
  FACTORY_ASSISTANT_TASK_QUEUE,
  FACTORY_PLUGIN_NAME
} from './constants.js'
import {
  FACTORY_RUNTIME_SCOPE,
  type FactoryRuntimeScope
} from './config.js'
import { projectFactoryCase } from './domain/flow.js'
import { projectFactoryPipeline } from './domain/pipeline.js'
import type { FactoryScope } from './domain/types.js'
import { FactoryCaseEntity } from './entities/factory-case.entity.js'
import { FactoryExecutionRecordEntity } from './entities/factory-execution-record.entity.js'
import { FACTORY_ROLE_ASSISTANTS } from './factory-assistant-definitions.js'
import { projectFactoryWorkspace } from './factory-case-workspace.js'
import { requireFactoryAssistantTasks } from './factory-runtime-capabilities.js'

export interface FactoryAssistantTaskQueuePayload {
  tenantId: string
  organizationId: string | null
  scopeKey: string
  userId: string
  caseId: string
  nodeKey: string
  expectedRevision: number
  operationId: string
  requesterXpertId: string
  requesterAgentKey: string
}

export interface DispatchFactoryAssistantTaskInput {
  caseId: string
  nodeKey: string
  baseRevision: number
  operationId: string
}

@Injectable()
export class FactoryAssistantTaskService {
  constructor(
    @InjectRepository(FactoryCaseEntity)
    private readonly cases: Repository<FactoryCaseEntity>,
    @InjectRepository(FactoryExecutionRecordEntity)
    private readonly executions: Repository<FactoryExecutionRecordEntity>,
    @Inject(MANAGED_QUEUE_SERVICE_TOKEN)
    private readonly queue: ManagedQueueService,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly capabilities: RuntimeCapabilityRegistry,
    @Inject(FACTORY_RUNTIME_SCOPE)
    private readonly runtimeScope: FactoryRuntimeScope
  ) {}

  async dispatch(scope: FactoryScope, input: DispatchFactoryAssistantTaskInput) {
    const actor = requireRuntimeActor(scope)
    const entity = await this.requireCase(scope, input.caseId)
    assertProjectReady(entity)
    if (entity.revision !== input.baseRevision) {
      throw revisionConflict(entity.revision)
    }
    const target = requireAssistantNode(entity, input.nodeKey)
    const jobId = queueJobId(scope, input.operationId)
    const existing = await this.executions.findOne({
      where: executionWhere(scope, { operationId: input.operationId })
    })
    if (existing) {
      if (
        existing.caseId !== entity.id ||
        existing.nodeKey !== input.nodeKey ||
        existing.inputRevision !== input.baseRevision
      ) {
        throw new ConflictException({
          errorCode: 'factory_operation_payload_conflict',
          message: 'operationId was already used with a different Assistant Task request.'
        })
      }
      return { duplicate: true, executionRecord: existing }
    }

    const sequence = await this.executions.count({
      where: executionWhere(scope, { caseId: entity.id, nodeKey: input.nodeKey })
    }) + 1
    const record = await this.executions.save(this.executions.create({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId ?? null,
      scopeKey: scopeKey(scope),
      caseId: entity.id,
      workspaceProjectId: entity.workspaceProjectId,
      nodeKey: input.nodeKey,
      roleKey: target.role.roleKey,
      roleLabel: target.role.title,
      agentKey: target.role.agentKey,
      operationId: input.operationId,
      sequence,
      attemptNumber: sequence,
      status: 'queued',
      inputRevision: input.baseRevision,
      outputRevision: null,
      safeSummary: 'Assistant Task is queued for governed execution.',
      queueJobId: jobId,
      requesterXpertId: actor.requesterXpertId,
      assistantTaskId: null,
      conversationId: null,
      threadId: null,
      executionId: null,
      executorXpertId: null,
      executorAgentKey: null,
      executorAssistantTemplateKey: null,
      executorAssistantTitle: null,
      executorPublishedVersion: null,
      supersededByRecordId: null,
      startedAt: new Date(),
      finishedAt: null
    }))

    const payload: FactoryAssistantTaskQueuePayload = {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId ?? null,
      scopeKey: scopeKey(scope),
      userId: actor.userId,
      caseId: entity.id,
      nodeKey: input.nodeKey,
      expectedRevision: input.baseRevision,
      operationId: input.operationId,
      requesterXpertId: actor.requesterXpertId,
      requesterAgentKey: AGENT_KEYS.coordinator
    }
    try {
      await this.queue.enqueue({
        pluginName: FACTORY_PLUGIN_NAME,
        queueName: FACTORY_ASSISTANT_TASK_QUEUE,
        jobName: FACTORY_ASSISTANT_TASK_JOB,
        jobId,
        payload,
        tenantId: payload.tenantId,
        organizationId: payload.organizationId,
        // Queue handler routing follows the plugin installation scope. Business
        // isolation remains explicit in the tenant/organization payload fields.
        scopeKey: this.runtimeScope.scopeKey,
        userId: payload.userId,
        attempts: 4,
        backoffMs: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { age: 86_400, count: 2_000 },
        removeOnFail: { age: 604_800, count: 5_000 }
      })
    } catch (error) {
      await this.executions.update(record.id, {
        status: 'failed',
        safeSummary: safeTaskFailure(error),
        finishedAt: new Date()
      })
      throw error
    }
    return { duplicate: false, executionRecord: record }
  }

  async process(payload: FactoryAssistantTaskQueuePayload) {
    const scope = payloadScope(payload)
    const record = await this.executions.findOne({
      where: executionWhere(scope, { operationId: payload.operationId })
    })
    if (!record) throw new Error('factory_execution_attempt_missing')
    if (record.status !== 'queued') return
    const entity = await this.requireCase(scope, payload.caseId)
    assertProjectReady(entity)
    if (entity.workspaceProjectId !== record.workspaceProjectId) {
      throw new Error('factory_execution_project_mismatch')
    }
    if (entity.revision !== payload.expectedRevision) {
      await this.failRecord(record.id, 'Factory Case revision changed before task dispatch.')
      return
    }
    const target = requireAssistantNode(entity, payload.nodeKey)
    const claimed = await this.executions.update(
      { id: record.id, status: 'queued' },
      { status: 'running', safeSummary: 'Assistant Task is starting in the Case Project.' }
    )
    if (claimed.affected !== 1) return

    try {
      const summary = projectFactoryCase(entity.snapshot, projectFactoryWorkspace(entity))
      const result = await requireFactoryAssistantTasks(this.capabilities).startTask({
        xpertId: payload.requesterXpertId,
        target: {
          kind: 'external_assistant',
          requesterXpertId: payload.requesterXpertId,
          requesterAgentKey: payload.requesterAgentKey,
          expectation: {
            pluginName: FACTORY_PLUGIN_NAME,
            templateKey: target.role.key,
            agentKey: target.role.agentKey
          }
        },
        projectId: entity.workspaceProjectId,
        clientMessageId: payload.operationId,
        prompt: buildTaskPrompt(summary, target.node.title, payload),
        humanInput: {
          caseId: entity.id,
          caseKey: entity.caseKey,
          nodeKey: payload.nodeKey,
          baseRevision: payload.expectedRevision,
          operationId: payload.operationId,
          workspaceProjectId: entity.workspaceProjectId
        },
        context: {
          factoryCase: summary,
          flowExecution: {
            caseId: entity.id,
            nodeKey: payload.nodeKey,
            baseRevision: payload.expectedRevision,
            operationId: payload.operationId
          }
        },
        correlation: {
          namespace: 'factory_ops',
          operationId: payload.operationId,
          subjectId: entity.id,
          attributes: {
            caseId: entity.id,
            nodeKey: payload.nodeKey,
            baseRevision: payload.expectedRevision,
            workspaceProjectId: entity.workspaceProjectId
          }
        }
      })
      await this.executions.update(record.id, {
        status: result.status === 'failed' || result.status === 'interrupted'
          ? result.status
          : 'running',
        safeSummary: result.status === 'failed'
          ? 'Assistant Task failed before the business finalizer completed.'
          : 'Assistant Task started; waiting for the role finalizer.',
        assistantTaskId: result.taskId ?? null,
        conversationId: result.conversationId ?? null,
        threadId: result.threadId ?? null,
        executionId: result.executionId ?? null,
        executorXpertId: result.executorXpertId ?? null,
        executorAgentKey: result.executorAgentKey ?? null,
        executorAssistantTemplateKey: result.executorAssistantTemplateKey ?? null,
        executorAssistantTitle: result.executorAssistantTitle ?? null,
        executorPublishedVersion: result.executorPublishedVersion ?? null,
        finishedAt: result.status === 'failed' || result.status === 'interrupted'
          ? new Date()
          : null
      })
    } catch (error) {
      throw error
    }
  }

  async recordQueueFailure(
    payload: FactoryAssistantTaskQueuePayload,
    error: unknown,
    terminal: boolean
  ) {
    const scope = payloadScope(payload)
    const record = await this.executions.findOne({
      where: executionWhere(scope, { operationId: payload.operationId })
    })
    if (!record || record.status === 'succeeded' || record.status === 'cancelled') return
    await this.executions.update(record.id, {
      status: terminal ? 'failed' : 'queued',
      safeSummary: terminal
        ? safeTaskFailure(error)
        : 'Assistant Task dispatch will be retried by the managed queue.',
      finishedAt: terminal ? new Date() : null
    })
  }

  async cancel(scope: FactoryScope, executionRecordId: string) {
    requireRuntimeActor(scope)
    const record = await this.executions.findOne({
      where: executionWhere(scope, { id: executionRecordId })
    })
    if (!record) throw new NotFoundException('Assistant Task execution record was not found.')
    if (record.status === 'cancelled') return record
    if (record.status === 'queued' && record.queueJobId) {
      const result = await this.queue.cancel({ jobId: record.queueJobId })
      if (result.success) {
        await this.executions.update(record.id, {
          status: 'cancelled',
          safeSummary: 'Queued Assistant Task was cancelled.',
          finishedAt: new Date()
        })
        return this.executions.findOneByOrFail({ id: record.id })
      }
    }
    const tasks = requireFactoryAssistantTasks(this.capabilities)
    if (!tasks.cancelTask) throw new Error('assistant_task_cancel_unavailable')
    const result = await tasks.cancelTask({
      taskId: record.assistantTaskId ?? undefined,
      executionId: record.executionId ?? undefined,
      conversationId: record.conversationId ?? undefined,
      threadId: record.threadId ?? undefined,
      xpertId: record.executorXpertId ?? undefined
    })
    if (!result.canceledExecutionIds.length) throw new Error('assistant_task_cancel_not_confirmed')
    await this.executions.update(record.id, {
      status: 'cancelled',
      safeSummary: 'Started Assistant Task cancellation was confirmed.',
      finishedAt: new Date()
    })
    return this.executions.findOneByOrFail({ id: record.id })
  }

  async reconcile(scope: FactoryScope, caseId: string) {
    const tasks = requireFactoryAssistantTasks(this.capabilities)
    if (!tasks.getTaskStatus) return
    const records = await this.executions.find({
      where: [
        executionWhere(scope, { caseId, status: 'running' }),
        executionWhere(scope, { caseId, status: 'queued' })
      ],
      take: 32
    })
    for (const record of records) {
      if (
        record.status === 'queued' &&
        record.queueJobId &&
        !record.assistantTaskId &&
        !record.executionId &&
        !record.conversationId
      ) {
        const queuedJob = await this.queue.getJob({ jobId: record.queueJobId })
        if (queuedJob?.state === 'failed') {
          await this.executions.update(record.id, {
            status: 'failed',
            safeSummary: 'Managed Queue could not start the Assistant Task; retry is allowed.',
            finishedAt: new Date()
          })
        } else if (queuedJob?.state === 'completed') {
          await this.executions.update(record.id, {
            status: 'interrupted',
            safeSummary: 'Managed Queue completed without recording an Assistant Task; retry is allowed.',
            finishedAt: new Date()
          })
        }
        continue
      }
      if (!record.assistantTaskId && !record.executionId && !record.conversationId) continue
      const status = await tasks.getTaskStatus({
        taskId: record.assistantTaskId ?? undefined,
        executionId: record.executionId ?? undefined,
        conversationId: record.conversationId ?? undefined,
        threadId: record.threadId ?? undefined,
        xpertId: record.executorXpertId ?? undefined
      })
      if (!status || status.status === 'unknown') continue
      if (status.status === 'succeeded') {
        await this.executions.update(record.id, {
          status: 'interrupted',
          safeSummary: 'Assistant finished without the required business finalizer; retry is allowed.',
          finishedAt: new Date()
        })
      } else if (status.status === 'failed' || status.status === 'interrupted') {
        await this.executions.update(record.id, {
          status: status.status,
          safeSummary: 'Assistant Task ended before the business finalizer completed.',
          finishedAt: new Date()
        })
      }
    }
  }

  private async requireCase(scope: FactoryScope, caseId: string) {
    const entity = await this.cases.findOne({ where: caseWhere(scope, { id: caseId }) })
    if (!entity) throw new NotFoundException('Factory Case was not found.')
    return entity
  }

  private async failRecord(id: string, summary: string) {
    await this.executions.update(id, {
      status: 'failed',
      safeSummary: summary.slice(0, 500),
      finishedAt: new Date()
    })
  }
}

function requireRuntimeActor(scope: FactoryScope) {
  const userId = scope.userId?.trim()
  const requesterXpertId = scope.assistantId?.trim()
  if (!userId || !requesterXpertId) {
    throw new BadRequestException({
      errorCode: 'factory_assistant_task_actor_required',
      message: 'Authenticated user and Orchestrator identities are required.'
    })
  }
  return { userId, requesterXpertId }
}

function assertProjectReady(entity: FactoryCaseEntity) {
  if (entity.workspaceProjectSyncStatus !== 'ready') {
    throw new ConflictException({
      errorCode: 'factory_case_project_not_ready',
      message: 'Factory Case Project must be ready before Assistant Tasks can start.'
    })
  }
}

function requireAssistantNode(entity: FactoryCaseEntity, nodeKey: string) {
  const projection = projectFactoryPipeline(entity.snapshot, [])
  const node = projection.nodes.find((candidate) => candidate.key === nodeKey)
  if (!node || node.executionMode !== 'assistant_task' || node.status !== 'ready' || !node.accountableRoleKey) {
    throw new ConflictException({
      errorCode: 'factory_node_not_dispatchable',
      message: 'The selected pipeline node is not ready for Assistant Task dispatch.'
    })
  }
  const role = FACTORY_ROLE_ASSISTANTS.find((candidate) => candidate.roleKey === node.accountableRoleKey)
  if (!role) throw new Error('factory_node_assistant_definition_missing')
  return { node, role }
}

function buildTaskPrompt(
  summary: ReturnType<typeof projectFactoryCase>,
  nodeTitle: string,
  payload: FactoryAssistantTaskQueuePayload
) {
  return [
    `Execute Factory Case pipeline task: ${nodeTitle}.`,
    `caseId=${payload.caseId}`,
    `nodeKey=${payload.nodeKey}`,
    `baseRevision=${payload.expectedRevision}`,
    `operationId=${payload.operationId}`,
    'Use the structured Factory Case context below and invoke the role finalizer exactly once.',
    JSON.stringify(summary)
  ].join('\n')
}

function queueJobId(scope: FactoryScope, operationId: string) {
  return `factory-task-${createHash('sha256')
    .update(`${scopeKey(scope)}\u0000${operationId}`)
    .digest('hex')}`
}

function safeTaskFailure(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  const code = message.includes('ambiguous')
    ? 'assistant_binding_ambiguous'
    : message.includes('unpublished')
      ? 'assistant_unpublished'
      : message.includes('missing')
        ? 'assistant_binding_missing'
        : 'assistant_task_failed'
  return `Assistant Task failed: ${code}`
}

function payloadScope(payload: FactoryAssistantTaskQueuePayload): FactoryScope {
  return {
    tenantId: payload.tenantId,
    organizationId: payload.organizationId,
    userId: payload.userId,
    assistantId: payload.requesterXpertId,
    actorType: 'user'
  }
}

function caseWhere(
  scope: FactoryScope,
  extra: FindOptionsWhere<FactoryCaseEntity> = {}
): FindOptionsWhere<FactoryCaseEntity> {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? IsNull(),
    ...extra
  }
}

function executionWhere(
  scope: FactoryScope,
  extra: FindOptionsWhere<FactoryExecutionRecordEntity> = {}
): FindOptionsWhere<FactoryExecutionRecordEntity> {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? IsNull(),
    ...extra
  }
}

function scopeKey(scope: FactoryScope) {
  return `${scope.tenantId}:${scope.organizationId ?? 'tenant'}`
}

function revisionConflict(currentRevision: number) {
  return new ConflictException({
    errorCode: 'factory_revision_conflict',
    message: 'Factory Case changed. Refresh and retry.',
    currentRevision
  })
}
