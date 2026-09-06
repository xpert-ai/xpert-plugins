import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { In } from 'typeorm'
import {
  AssistantTaskRuntimeCapability,
  MANAGED_QUEUE_SERVICE_TOKEN,
  type ManagedQueueService,
} from '@xpert-ai/plugin-sdk'
import { MaterialCaseService, assertRevision } from './case.service.js'
import { MaterialCaseEntity, MaterialExecutionEntity } from './entities.js'
import { RUNTIME_SCOPE, type InstallationScope } from './config.js'
import { scoped, scopeKey, type RuntimeScope } from './scope.js'
import { roleDefinition } from '../roles.js'
import {
  PLUGIN_NAME,
  ARTIFACT_NAMESPACE,
  artifactKey,
} from '../artifact-namespace.js'
import { projectFlow } from '../flow-projector.js'
import type { ActionReceipt, RoleKey } from '../contracts.js'
import type { DispatchInput } from './schemas.js'
export const TASK_QUEUE = artifactKey('tasks'),
  TASK_JOB = 'execute',
  SUPERVISE_JOB = 'supervise'
export interface TaskPayload {
  tenantId: string
  organizationId: string
  userId: string
  caseId: string
  recordId: string
  coordinatorId: string
  poll: number
}
const payloadScope = (p: TaskPayload): RuntimeScope => ({
  ...p,
  assistantId: p.coordinatorId,
  actorType: 'user',
})

@Injectable()
export class MaterialTaskService {
  constructor(
    readonly cases: MaterialCaseService,
    @Inject(MANAGED_QUEUE_SERVICE_TOKEN)
    private readonly queue: ManagedQueueService,
    @Inject(RUNTIME_SCOPE) private readonly installation: InstallationScope,
  ) {}
  runtime(s: RuntimeScope) {
    return this.cases
      .scopedCapabilities(s)
      .require(AssistantTaskRuntimeCapability)
  }
  async start(
    s: RuntimeScope,
    input: {
      caseId: string
      expectedRevision: number
      operationId: string
      nodeKey?: string
    },
    coordinator = false,
  ): Promise<ActionReceipt> {
    const e = await this.cases.requireCase(s, input.caseId)
    await this.cases.assertManage(s, e)
    if (e.projectStatus !== 'ready')
      throw new ConflictException('case_project_not_ready')
    const record = await this.cases.db.transaction(async (m) => {
      const entity = await this.cases.requireCase(s, e.id, m, true)
      const previous = await m
        .getRepository(MaterialExecutionEntity)
        .findOneBy({ scopeKey: scopeKey(s), operationId: input.operationId })
      if (previous) {
        if (
          previous.caseId !== e.id ||
          previous.inputRevision !== input.expectedRevision ||
          previous.nodeKey !== (coordinator ? 'coordinate' : input.nodeKey) ||
          previous.requestedBy !== s.userId
        )
          throw new ConflictException('idempotency_conflict')
        return previous
      }
      assertRevision(entity, input.expectedRevision)
      const active = await m
        .getRepository(MaterialExecutionEntity)
        .countBy({
          ...scoped(s),
          caseId: e.id,
          status: In(['running', 'queued']),
        })
      if (active) throw new ConflictException('assistant_already_running')
      let role: RoleKey = 'coordinator',
        nodeKey = 'coordinate'
      if (!coordinator) {
        const n = projectFlow(entity.snapshot).nodes.find(
          (n) => n.key === input.nodeKey,
        )
        if (!n || !n.executable || n.executionMode !== 'assistant_task')
          throw new ConflictException('node_not_dispatchable')
        role = n.laneKey
        nodeKey = n.key
      } else if (
        !projectFlow(entity.snapshot).nodes.some(
          (n) => n.executable && n.executionMode === 'assistant_task',
        )
      )
        throw new ConflictException('no_dispatchable_node')
      entity.autoRun = coordinator
      await m.save(entity)
      return this.createRecord(m, s, entity, nodeKey, role, input.operationId)
    })
    await this.enqueueRecord(s, e, record)
    return {
      success: true,
      code: 'assistant_queued',
      caseId: e.id,
      revision: e.revision,
      recordId: record.id,
    }
  }
  private async createRecord(
    m: import('typeorm').EntityManager,
    s: RuntimeScope,
    e: MaterialCaseEntity,
    nodeKey: string,
    role: RoleKey,
    operationId: string,
  ) {
    const previous = await m
      .getRepository(MaterialExecutionEntity)
      .find({
        where: { ...scoped(s), caseId: e.id, nodeKey },
        order: { attempt: 'DESC' },
        take: 1,
      })
    const attempt = (previous[0]?.attempt ?? 0) + 1,
      id = randomUUID()
    const record = m
      .getRepository(MaterialExecutionEntity)
      .create({
        ...scoped(s),
        scopeKey: scopeKey(s),
        id,
        caseId: e.id,
        operationId,
        nodeKey,
        roleKey: role,
        attempt,
        inputRevision: e.revision,
        status: 'queued',
        requestedBy: s.userId,
        executorId: null,
        executorVersion: null,
        queueJobId: null,
        record: {
          id,
          caseId: e.id,
          nodeKey,
          roleKey: role,
          attempt,
          sequence: attempt,
          status: 'queued',
          taskId: null,
          conversationId: null,
          threadId: null,
          executionId: null,
          inputRevision: e.revision,
          outputRevision: null,
          startedAt: new Date().toISOString(),
          finishedAt: null,
          safeSummary: '等待平台 Assistant 执行。',
          supersededById: null,
        },
      })
    await m.save(record)
    const prior = previous[0]
    if (
      prior &&
      ['failed', 'interrupted', 'cancelled'].includes(prior.status)
    ) {
      prior.record = { ...prior.record, supersededById: id }
      await m.save(prior)
    }
    await this.cases.persistNodes(m, e)
    return record
  }
  async dispatchNext(
    s: RuntimeScope,
    input: DispatchInput,
  ): Promise<ActionReceipt> {
    this.cases.assertRole(s, 'coordinator')
    const result = await this.cases.db.transaction(async (m) => {
      const e = await this.cases.requireCase(s, input.caseId, m, true)
      if (e.coordinatorId !== s.assistantId)
        throw new ForbiddenException('coordinator_identity_mismatch')
      const prior = await this.cases.duplicate(m, s, input.operationId, input)
      if (prior) return prior
      assertRevision(e, input.expectedRevision)
      const next = projectFlow(e.snapshot).nodes.find(
        (n) => n.executable && n.executionMode === 'assistant_task',
      )
      if (!next) throw new ConflictException('human_gate_or_no_next_node')
      e.autoRun = true
      await m.save(e)
      let record = await m
        .getRepository(MaterialExecutionEntity)
        .findOneBy({
          ...scoped(s),
          caseId: e.id,
          operationId: input.operationId,
        })
      if (!record)
        record = await this.createRecord(
          m,
          s,
          e,
          'coordinate',
          'coordinator',
          input.operationId,
        )
      if (
        record.roleKey !== 'coordinator' ||
        record.inputRevision !== e.revision
      )
        throw new ConflictException('execution_identity_mismatch')
      record.status = 'running'
      record.executorId = s.assistantId
      record.record = {
        ...record.record,
        status: 'running',
        outputRevision: e.revision,
        conversationId: s.conversationId ?? record.record.conversationId,
        threadId: s.threadId ?? record.record.threadId,
        executionId: s.executionId ?? record.record.executionId,
        safeSummary: `协调者已授权按依赖顺序执行；下一步：${next.title}。人工审批前自动暂停。`,
      }
      await m.save(record)
      const receipt = {
        success: true,
        code: 'pipeline_authorized',
        caseId: e.id,
        revision: e.revision,
        recordId: record.id,
      }
      await this.cases.remember(
        m,
        s,
        input.operationId,
        input,
        receipt,
        'coordinate',
        e.id,
      )
      return receipt
    })
    if (result.recordId)
      await this.superviseStandalone(s, input.caseId, result.recordId)
    return result
  }
  async enqueueRecord(
    s: RuntimeScope,
    e: MaterialCaseEntity,
    r: MaterialExecutionEntity,
  ) {
    if (r.status !== 'queued') return
    const result = await this.queue.enqueue({
      pluginName: PLUGIN_NAME,
      queueName: TASK_QUEUE,
      jobName: TASK_JOB,
      payload: {
        ...scoped(s),
        userId: s.userId,
        caseId: e.id,
        recordId: r.id,
        coordinatorId: e.coordinatorId,
        poll: 0,
      } satisfies TaskPayload,
      ...scoped(s),
      userId: s.userId,
      scopeKey: this.installation.scopeKey,
      jobId: `mig-task-${r.id}`,
      attempts: 2,
      backoffMs: 3000,
    })
    await this.cases.db
      .getRepository(MaterialExecutionEntity)
      .update(r.id, { queueJobId: result.jobId })
  }
  async launch(p: TaskPayload) {
    const s = payloadScope(p),
      e = await this.cases.requireCase(s, p.caseId),
      repo = this.cases.db.getRepository(MaterialExecutionEntity)
    const r = await repo.findOneByOrFail({
      ...scoped(s),
      caseId: e.id,
      id: p.recordId,
    })
    if (r.status === 'running') {
      await this.enqueueSupervision(p)
      return
    }
    if (r.status !== 'queued') return
    if (
      e.revision !== r.inputRevision ||
      e.projectStatus !== 'ready' ||
      e.coordinatorId !== p.coordinatorId
    ) {
      await this.fail(r, '启动前案例版本或助理绑定发生变化。')
      return
    }
    const claimed = await repo.update(
      { id: r.id, status: 'queued' },
      { status: 'running', record: { ...r.record, status: 'running' } },
    )
    if (!claimed.affected) return
    const role = roleDefinition(r.roleKey)
    const request = {
      xpertId: e.coordinatorId,
      agentKey: role.agentKey,
      ...(r.roleKey === 'coordinator'
        ? {}
        : {
            target: {
              kind: 'external_assistant' as const,
              requesterXpertId: e.coordinatorId,
              requesterAgentKey: roleDefinition('coordinator').agentKey,
              expectation: {
                pluginName: PLUGIN_NAME,
                templateKey: role.templateKey,
                agentKey: role.agentKey,
              },
            },
          }),
      projectId: e.projectId,
      clientMessageId: r.operationId,
      prompt: [
        `请执行物料主数据治理任务 ${r.nodeKey}。`,
        `caseId=${e.id}`,
        `expectedRevision=${r.inputRevision}`,
        `operationId=${r.operationId}`,
        `nodeKey=${r.nodeKey}`,
        '先用本角色读取工具获取当前证据，再调用本节点工具一次。不得替他人审批。完成工具写入后结束回复。',
      ].join('\n'),
      humanInput: {
        caseId: e.id,
        nodeKey: r.nodeKey,
        expectedRevision: r.inputRevision,
        operationId: r.operationId,
      },
      context: {
        materialIdentity: {
          caseId: e.id,
          caseKey: e.caseKey,
          nodeKey: r.nodeKey,
          revision: r.inputRevision,
        },
      },
      correlation: {
        namespace: ARTIFACT_NAMESPACE,
        operationId: r.operationId,
        subjectId: e.id,
        attributes: {
          nodeKey: r.nodeKey,
          roleKey: r.roleKey,
          inputRevision: r.inputRevision,
        },
      },
    }
    try {
      const result = await this.runtime(s).startTask(request)
      // A quick finalizer may have committed outputRevision before the runtime returns handles.
      await this.cases.db.transaction(async (m) => {
        const current = await m
          .getRepository(MaterialExecutionEntity)
          .findOneOrFail({
            where: { id: r.id, ...scoped(s) },
            lock: { mode: 'pessimistic_write' },
          })
        current.executorId = result.executorXpertId ?? e.coordinatorId
        current.executorVersion = result.executorPublishedVersion ?? null
        current.record = {
          ...current.record,
          taskId: result.taskId ?? current.record.taskId,
          conversationId:
            result.conversationId ?? current.record.conversationId,
          threadId: result.threadId ?? current.record.threadId,
          executionId: result.executionId ?? current.record.executionId,
        }
        await m.save(current)
      })
      await this.enqueueSupervision(p)
    } catch (error) {
      await this.fail(
        await repo.findOneByOrFail({ id: r.id, ...scoped(s) }),
        '平台未能启动助理任务；请检查发布状态、主模型和角色绑定。',
      )
      throw error
    }
  }
  async superviseStandalone(s: RuntimeScope, caseId: string, recordId: string) {
    const e = await this.cases.requireCase(s, caseId)
    await this.enqueueSupervision({
      ...scoped(s),
      userId: s.userId,
      caseId,
      recordId,
      coordinatorId: e.coordinatorId,
      poll: 0,
    })
  }
  private async enqueueSupervision(p: TaskPayload) {
    await this.queue.enqueue({
      pluginName: PLUGIN_NAME,
      queueName: TASK_QUEUE,
      jobName: SUPERVISE_JOB,
      payload: { ...p, poll: p.poll + 1 },
      ...scoped(p),
      userId: p.userId,
      scopeKey: this.installation.scopeKey,
      jobId: `mig-watch-${p.recordId}-${p.poll + 1}`,
      delayMs: 3000,
      attempts: 2,
      backoffMs: 3000,
    })
  }
  async supervise(p: TaskPayload) {
    const s = payloadScope(p)
    let r = await this.cases.db
      .getRepository(MaterialExecutionEntity)
      .findOneBy({ id: p.recordId, ...scoped(s), caseId: p.caseId })
    if (!r) return
    if (r.status === 'succeeded') {
      await this.advance(s, p.caseId)
      return
    }
    if (['failed', 'cancelled', 'interrupted'].includes(r.status)) return
    const status = await this.runtime(s).getTaskStatus?.({
      taskId: r.record.taskId ?? undefined,
      executionId: r.record.executionId ?? undefined,
      conversationId: r.record.conversationId ?? undefined,
      threadId: r.record.threadId ?? undefined,
      xpertId: r.executorId ?? undefined,
      clientMessageId: r.operationId,
    })
    r = await this.cases.db
      .getRepository(MaterialExecutionEntity)
      .findOneBy({ id: p.recordId, ...scoped(s), caseId: p.caseId })
    if (!r) return
    if (
      ['failed', 'cancelled', 'interrupted', 'succeeded'].includes(r.status)
    ) {
      if (r.status === 'succeeded') await this.advance(s, p.caseId)
      return
    }
    if (status) {
      r.executorId = status.executorXpertId ?? r.executorId
      r.record = {
        ...r.record,
        taskId: status.taskId ?? r.record.taskId,
        executionId: status.executionId ?? r.record.executionId,
        conversationId: status.conversationId ?? r.record.conversationId,
        threadId: status.threadId ?? r.record.threadId,
      }
    }
    if (status?.status === 'succeeded') {
      if (r.record.outputRevision === null) {
        await this.fail(
          r,
          '助理已结束，但未提交必需的带证据业务成果。请检查执行规划后重试。',
        )
        return
      }
      r.status = 'succeeded'
      r.record = {
        ...r.record,
        status: 'succeeded',
        finishedAt: new Date().toISOString(),
      }
      await this.cases.db.getRepository(MaterialExecutionEntity).save(r)
      const e = await this.cases.requireCase(s, p.caseId)
      await this.cases.persistNodes(this.cases.db.manager, e)
      await this.advance(s, p.caseId)
      return
    }
    if (status?.status === 'failed' || status?.status === 'interrupted') {
      await this.fail(
        r,
        '助理运行中断；已保留本次记录，可检查原因后创建新尝试。',
      )
      return
    }
    if (p.poll >= 100) {
      const cancelled = await this.runtime(s).cancelTask?.({
        taskId: r.record.taskId ?? undefined,
        executionId: r.record.executionId ?? undefined,
        conversationId: r.record.conversationId ?? undefined,
        threadId: r.record.threadId ?? undefined,
        xpertId: r.executorId ?? undefined,
      })
      await this.fail(
        r,
        cancelled?.canceledExecutionIds.length
          ? '助理超过五分钟时限，平台已确认取消。'
          : '助理状态超过监督时限，已暂停流水线；请核查平台执行状态。',
      )
      return
    }
    await this.enqueueSupervision(p)
  }
  async advance(s: RuntimeScope, caseId: string) {
    const result = await this.cases.db.transaction(async (m) => {
      const e = await this.cases.requireCase(s, caseId, m, true)
      if (!e.autoRun) return null
      const active = await m
        .getRepository(MaterialExecutionEntity)
        .countBy({ ...scoped(s), caseId, status: In(['running', 'queued']) })
      if (active) return null
      const next = projectFlow(e.snapshot).nodes.find(
        (n) => n.executable && n.executionMode === 'assistant_task',
      )
      if (!next) {
        e.autoRun = false
        await m.save(e)
        return null
      }
      const record = await this.createRecord(
        m,
        s,
        e,
        next.key,
        next.laneKey,
        `pipeline-${randomUUID()}`,
      )
      return { e, record }
    })
    if (result) await this.enqueueRecord(s, result.e, result.record)
  }
  async fail(r: MaterialExecutionEntity, summary: string) {
    if (r.status === 'succeeded') return
    r.status = 'failed'
    r.record = {
      ...r.record,
      status: 'failed',
      finishedAt: new Date().toISOString(),
      safeSummary: summary,
    }
    await this.cases.db.transaction(async (m) => {
      await m.save(r)
      await m
        .getRepository(MaterialCaseEntity)
        .update({ id: r.caseId, ...scoped(r) }, { autoRun: false })
      const e = await m
        .getRepository(MaterialCaseEntity)
        .findOneByOrFail({ id: r.caseId, ...scoped(r) })
      await this.cases.persistNodes(m, e)
    })
  }
}
