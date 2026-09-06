import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, EntityManager, In } from 'typeorm'
import { randomUUID, createHash } from 'node:crypto'
import {
  ProjectAccessRuntimeCapability,
  ProjectProvisioningRuntimeCapability,
  AssistantTaskRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry,
  XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN,
  type AgentMiddlewareRuntimeServiceApi,
} from '@xpert-ai/plugin-sdk'
import { PLUGIN_NAME } from '../artifact-namespace.js'
import { ROLES, roleDefinition } from '../roles.js'
import type {
  ActionReceipt,
  CaseKind,
  DashboardProjection,
  GovernanceCase,
  RoleKey,
} from '../contracts.js'
import { createDemoCase } from '../demo-scenarios.js'
import { canonicalJson } from '../source-snapshot.js'
import { projectFlow, type Profiles } from '../flow-projector.js'
import { applyDomainStep } from '../governance-domain.js'
import { assertEvidence, materialFingerprint } from '../identity-rules.js'
import {
  MaterialCaseEntity,
  MaterialExecutionEntity,
  MaterialMutationEntity,
  MaterialNodeEntity,
  MaterialMockDeliveryEntity,
  MaterialGoldenEntity,
  MaterialAliasEntity,
} from './entities.js'
import { scoped, scopeKey, type RuntimeScope } from './scope.js'
import type { FinalizeInput } from './schemas.js'
const hash = (v: unknown) =>
  createHash('sha256').update(canonicalJson(v)).digest('hex')
export const assertRevision = (
  entity: MaterialCaseEntity,
  revision: number,
) => {
  if (entity.revision !== revision)
    throw new ConflictException({
      errorCode: 'revision_conflict',
      currentRevision: entity.revision,
      message: '案例已更新，请刷新后重试。',
    })
}

@Injectable()
export class MaterialCaseService {
  constructor(
    @InjectDataSource() readonly db: DataSource,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    readonly capabilities: RuntimeCapabilityRegistry,
    @Inject(XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN)
    private readonly middlewareRuntime: Pick<AgentMiddlewareRuntimeServiceApi, 'createScopedApi'>,
  ) {}
  scopedCapabilities(s: RuntimeScope) {
    const capabilities = this.middlewareRuntime.createScopedApi({
      ...s,
      xpertId: s.assistantId,
    }).capabilities
    if (!capabilities) throw new Error('assistant_runtime_unavailable')
    return capabilities
  }
  async readableProjects(s: RuntimeScope) {
    return this.capabilities
      .require(ProjectAccessRuntimeCapability)
      .listReadable({ actor: s })
  }
  async requireCase(
    s: RuntimeScope,
    id: string,
    manager = this.db.manager,
    lock = false,
  ) {
    const entity = await manager
      .getRepository(MaterialCaseEntity)
      .findOne({
        where: { ...scoped(s), id },
        ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
      })
    if (!entity) throw new NotFoundException('case_not_found')
    if (s.assistantVersionIds && !s.assistantVersionIds.some(id =>
      entity.assignedAssistantIds.includes(id) || entity.coordinatorId === id))
      throw new ForbiddenException('profile_case_forbidden')
    if (
      s.actorType === 'agent' &&
      !entity.assignedAssistantIds.includes(s.assistantId)
    )
      throw new ForbiddenException('assistant_not_assigned')
    if (entity.projectStatus === 'ready' || entity.createdById !== s.userId) {
      const access = await this.readableProjects(s)
      if (!access.some((p) => p.projectId === entity.projectId))
        throw new ForbiddenException('case_access_denied')
    }
    return entity
  }
  async assertManage(s: RuntimeScope, e: MaterialCaseEntity) {
    if (s.actorType !== 'user')
      throw new ForbiddenException('human_authority_required')
    if (e.projectStatus !== 'ready' && e.createdById === s.userId) return
    await this.capabilities
      .require(ProjectAccessRuntimeCapability)
      .assertManage({ actor: s, projectId: e.projectId })
  }
  async list(
    s: RuntimeScope,
    query: { page?: number; pageSize?: number; search?: string } = {},
  ) {
    const ids = (await this.readableProjects(s)).map((p) => p.projectId)
    const page = Math.max(1, Math.floor(query.page ?? 1)),
      pageSize = Math.min(50, Math.max(1, Math.floor(query.pageSize ?? 20)))
    const qb = this.db
      .getRepository(MaterialCaseEntity)
      .createQueryBuilder('c')
      .where(
        'c.tenantId = :tenantId AND c.organizationId = :organizationId',
        scoped(s),
      )
      .andWhere(
        ids.length
          ? "((c.projectStatus <> 'ready'  AND c.createdById = :userId) OR c.projectId IN (:...ids))"
          : "(c.projectStatus <> 'ready' AND c.createdById = :userId)",
        { userId: s.userId, ids },
      )
    if (query.search)
      qb.andWhere('(c.title ILIKE :search OR c.caseKey ILIKE :search)', {
        search: `%${query.search.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`,
      })
    const [items, total] = await qb
      .orderBy('c.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount()
    return {
      items: items.map((c) => ({
        id: c.id,
        caseKey: c.caseKey,
        title: c.title,
        kind: c.kind,
        status: c.status,
        revision: c.revision,
        updatedAt: c.updatedAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    }
  }
  async create(
    s: RuntimeScope,
    input: { kind: CaseKind; title?: string; operationId: string },
  ): Promise<ActionReceipt> {
    if (s.actorType !== 'user')
      throw new ForbiddenException('human_case_creation_required')
    // Global operation lock also protects creation before a case row exists.
    const receipt = await this.db.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `${scopeKey(s)}:${input.operationId}`,
      ])
      const prior = await this.duplicate(m, s, input.operationId, input)
      if (prior) return prior
      const id = randomUUID(),
        now = new Date().toISOString()
      const snapshot = createDemoCase(input.kind, id, input.title, now)
      const entity = m
        .getRepository(MaterialCaseEntity)
        .create({
          ...scoped(s),
          scopeKey: scopeKey(s),
          id,
          caseKey: snapshot.caseKey,
          title: snapshot.title,
          kind: input.kind,
          status: snapshot.status,
          revision: 1,
          snapshot,
          createdById: s.userId,
          coordinatorId: s.assistantId,
          projectId: randomUUID(),
          projectStatus: 'pending',
          assignedAssistantIds: [],
          autoRun: false,
          criticalConflict: false,
          exposure: snapshot.materials.reduce(
            (v, x) => v + x.quantity * x.unitCost,
            0,
          ),
        })
      await m.save(entity)
      await this.persistNodes(m, entity)
      const result = {
        success: true,
        code: 'case_created',
        caseId: id,
        revision: 1,
      }
      await this.remember(
        m,
        s,
        input.operationId,
        input,
        result,
        'create_case',
        id,
      )
      return result
    })
    if (receipt.caseId) await this.ensureProject(s, receipt.caseId)
    return receipt
  }
  async ensureProject(s: RuntimeScope, id: string) {
    const e = await this.requireCase(s, id)
    await this.assertManage(s, e)
    if (e.projectStatus === 'ready') return e
    try {
      const result = await this.scopedCapabilities(s)
        .require(ProjectProvisioningRuntimeCapability)
        .ensure({
          projectId: e.projectId,
          xpertId: e.coordinatorId,
          requesterAgentKey: roleDefinition('coordinator').agentKey,
          externalAssistantExpectations: ROLES.filter(
            (r) => r.key !== 'coordinator',
          ).map((r) => ({
            pluginName: PLUGIN_NAME,
            templateKey: r.templateKey,
            agentKey: r.agentKey,
          })),
          name: `${e.caseKey} · ${e.title}`,
          status: 'active',
        })
      await this.db
        .getRepository(MaterialCaseEntity)
        .update(e.id, {
          projectStatus: 'ready',
          assignedAssistantIds: result.xpertIds,
        })
    } catch (error) {
      await this.db
        .getRepository(MaterialCaseEntity)
        .update(e.id, { projectStatus: 'failed' })
      throw new ConflictException({
        errorCode: 'suite_project_not_ready',
        caseId: e.id,
        message:
          '案例已保存，但助理套件或案例项目尚未就绪。请完成应用初始化后重试项目同步。',
      })
    }
    return this.requireCase(s, id)
  }
  async records(s: RuntimeScope, id: string) {
    await this.requireCase(s, id)
    const rows = await this.db
      .getRepository(MaterialExecutionEntity)
      .find({
        where: { ...scoped(s), caseId: id },
        order: { createdAt: 'ASC' },
        take: 200,
      })
    return rows.map((e) => e.record)
  }
  async profiles(s: RuntimeScope, coordinatorId: string): Promise<Profiles> {
    const api = this.scopedCapabilities(s).require(
      AssistantTaskRuntimeCapability,
    )
    const bindings =
      (await api.listExternalAssistantBindings?.({
        requesterXpertId: coordinatorId,
        requesterAgentKey: roleDefinition('coordinator').agentKey,
      })) ?? []
    const profiles: Profiles = {}
    for (const role of ROLES) {
      const b = bindings.find(
        (b) =>
          b.templateSource?.pluginName === PLUGIN_NAME &&
          b.templateSource.templateKey === role.templateKey &&
          b.primaryAgentKey === role.agentKey,
      )
      if (b)
        profiles[role.key] = {
          displayName: b.title,
          templateKey: role.templateKey,
          primaryAgentKey: role.agentKey,
          avatarUrl: b.avatar?.url ?? null,
          avatarEmoji: b.avatar?.emoji?.unified
            ?.split('-')
            .map((v) => String.fromCodePoint(Number.parseInt(v, 16)))
            .join(''),
          available: b.status === 'available',
        }
    }
    return profiles
  }
  async readForRole(
    s: RuntimeScope,
    role: RoleKey,
    input: { caseId?: string; search?: string },
  ) {
    this.assertRole(s, role)
    if (!input.caseId)
      return this.list(s, { search: input.search, pageSize: 10 })
    const e = await this.requireCase(s, input.caseId),
      flow = projectFlow(e.snapshot)
    return {
      caseId: e.id,
      caseKey: e.caseKey,
      revision: e.revision,
      status: e.status,
      roleKey: role,
      case: {
        ...e.snapshot,
        drawings: e.snapshot.drawings.map((d) => ({
          ...d,
          content:
            '[Released SVG drawing; structured annotations and evidence are included in materials/evidence.]',
        })),
      },
      executableNodes: flow.nodes
        .filter(
          (n) => n.executable && (role === 'coordinator' || n.laneKey === role),
        )
        .map((n) => ({
          nodeKey: n.key,
          title: n.title,
          executionMode: n.executionMode,
        })),
      executionId: s.executionId,
      projectStatus: e.projectStatus,
      blocker: flow.blocker,
      simulation: true,
    }
  }
  assertRole(s: RuntimeScope, role: RoleKey) {
    if (s.actorType !== 'agent' || s.agentKey !== roleDefinition(role).agentKey)
      throw new ForbiddenException('role_boundary_violation')
  }
  async finalize(
    s: RuntimeScope,
    role: RoleKey,
    nodeKey: string,
    input: FinalizeInput,
  ): Promise<ActionReceipt> {
    this.assertRole(s, role)
    return this.db.transaction(async (m) => {
      const e = await this.requireCase(s, input.caseId, m, true),
        prior = await this.duplicate(m, s, input.operationId, {
          nodeKey,
          ...input,
        })
      if (prior) return prior
      assertRevision(e, input.expectedRevision)
      assertEvidence(e.snapshot, input.evidenceIds)
      const node = projectFlow(e.snapshot).nodes.find((n) => n.key === nodeKey)
      if (
        !node ||
        !node.executable ||
        node.laneKey !== role ||
        node.executionMode !== 'assistant_task'
      )
        throw new ConflictException('node_not_executable')
      if (nodeKey === 'publish-records')
        await this.publishMock(m, s, e, input.operationId)
      const next = applyDomainStep(e.snapshot, nodeKey, role)
      const artifact = next.artifacts.at(-1)!
      artifact.summary += `\n专业判断：${input.assessment}`
      artifact.evidenceIds = [...input.evidenceIds]
      await this.saveSnapshot(m, e, next)
      let execution = await m
        .getRepository(MaterialExecutionEntity)
        .findOneBy({
          ...scoped(s),
          caseId: e.id,
          operationId: input.operationId,
        })
      if (execution) {
        if (
          execution.roleKey !== role ||
          execution.nodeKey !== nodeKey ||
          execution.inputRevision !== input.expectedRevision ||
          (execution.executorId && execution.executorId !== s.assistantId) ||
          ['failed', 'cancelled', 'interrupted'].includes(execution.status)
        )
          throw new ConflictException('execution_identity_mismatch')
        execution.record = {
          ...execution.record,
          conversationId: s.conversationId ?? execution.record.conversationId,
          threadId: s.threadId ?? execution.record.threadId,
          executionId: s.executionId ?? execution.record.executionId,
          outputRevision: next.revision,
          safeSummary: artifact.summary.slice(0, 1000),
        }
      } else {
        const attempt =
          (await m
            .getRepository(MaterialExecutionEntity)
            .countBy({ ...scoped(s), caseId: e.id, nodeKey })) + 1
        const id = randomUUID()
        execution = m
          .getRepository(MaterialExecutionEntity)
          .create({
            ...scoped(s),
            scopeKey: scopeKey(s),
            id,
            caseId: e.id,
            operationId: input.operationId,
            nodeKey,
            roleKey: role,
            attempt,
            inputRevision: input.expectedRevision,
            status: 'running',
            requestedBy: s.userId,
            executorId: s.assistantId,
            executorVersion: null,
            queueJobId: null,
            record: {
              id,
              caseId: e.id,
              nodeKey,
              roleKey: role,
              attempt,
              sequence: attempt,
              status: 'running',
              taskId: null,
              conversationId: s.conversationId ?? null,
              threadId: s.threadId ?? null,
              executionId: s.executionId ?? null,
              inputRevision: input.expectedRevision,
              outputRevision: next.revision,
              startedAt: new Date().toISOString(),
              finishedAt: null,
              safeSummary: artifact.summary.slice(0, 1000),
              supersededById: null,
            },
          })
      }
      await m.save(execution)
      const result = {
        success: true,
        code: 'artifact_accepted',
        caseId: e.id,
        revision: next.revision,
        recordId: execution.id,
      }
      await this.remember(
        m,
        s,
        input.operationId,
        { nodeKey, ...input },
        result,
        nodeKey,
        e.id,
      )
      return result
    })
  }
  async decide(
    s: RuntimeScope,
    input: {
      caseId: string
      expectedRevision: number
      operationId: string
      decision: 'approved' | 'rejected'
      reason: string
    },
  ): Promise<ActionReceipt> {
    return this.db.transaction(async (m) => {
      const e = await this.requireCase(s, input.caseId, m, true)
      await this.assertManage(s, e)
      const prior = await this.duplicate(m, s, input.operationId, input)
      if (prior) return prior
      assertRevision(e, input.expectedRevision)
      if (e.status !== 'review_required' || !e.snapshot.proposal)
        throw new ConflictException('proposal_not_ready')
      const next = structuredClone(e.snapshot)
      next.approval = {
        proposalRevision: next.proposal!.revision,
        decision: input.decision,
        actor: s.userId,
        reason: input.reason,
        at: new Date().toISOString(),
      }
      next.status = input.decision
      next.revision++
      next.updatedAt = new Date().toISOString()
      e.autoRun = false
      await this.saveSnapshot(m, e, next)
      const result = {
        success: true,
        code: 'decision_recorded',
        caseId: e.id,
        revision: next.revision,
      }
      await this.remember(
        m,
        s,
        input.operationId,
        input,
        result,
        'decide_proposal',
        e.id,
      )
      return result
    })
  }
  async saveSnapshot(
    m: EntityManager,
    e: MaterialCaseEntity,
    snapshot: GovernanceCase,
  ) {
    e.snapshot = snapshot
    e.revision = snapshot.revision
    e.status = snapshot.status
    e.criticalConflict = snapshot.criticalConflict === true
    await m.save(e)
    await this.persistNodes(m, e)
  }
  async persistNodes(m: EntityManager, e: MaterialCaseEntity) {
    const records = await m
      .getRepository(MaterialExecutionEntity)
      .findBy({ ...scoped(e), caseId: e.id })
    const nodes = projectFlow(
      e.snapshot,
      records.map((r) => r.record),
    ).nodes.filter((n) => n.kind === 'task')
    await m.getRepository(MaterialNodeEntity).upsert(
      nodes.map((n) => ({
        ...scoped(e),
        scopeKey: e.scopeKey,
        caseId: e.id,
        nodeKey: n.key,
        roleKey: n.laneKey,
        status: n.status,
      })),
      ['scopeKey', 'caseId', 'nodeKey'],
    )
  }
  async duplicate(
    m: EntityManager,
    s: RuntimeScope,
    operationId: string,
    input: unknown,
  ) {
    const row = await m
      .getRepository(MaterialMutationEntity)
      .findOneBy({ scopeKey: scopeKey(s), operationId })
    if (!row) return null
    if (row.requestHash !== hash(input) || row.actorId !== s.userId)
      throw new ConflictException('idempotency_conflict')
    return row.receipt
  }
  async remember(
    m: EntityManager,
    s: RuntimeScope,
    operationId: string,
    input: unknown,
    receipt: ActionReceipt,
    action: string,
    caseId: string,
  ) {
    await m.save(
      m
        .getRepository(MaterialMutationEntity)
        .create({
          ...scoped(s),
          scopeKey: scopeKey(s),
          caseId,
          operationId,
          requestHash: hash(input),
          receipt,
          actorId: s.userId,
          action,
        }),
    )
  }
  private async publishMock(
    m: EntityManager,
    s: RuntimeScope,
    e: MaterialCaseEntity,
    operationId: string,
  ) {
    const proposal = e.snapshot.proposal,
      approval = e.snapshot.approval
    if (
      !proposal ||
      approval?.decision !== 'approved' ||
      approval.proposalRevision !== proposal.revision
    )
      throw new ConflictException('approval_required')
    await this.capabilities
      .require(ProjectAccessRuntimeCapability)
      .assertManage({
        actor: {
          tenantId: s.tenantId,
          organizationId: s.organizationId,
          userId: approval.actor,
        },
        projectId: e.projectId,
      })
    e.snapshot.publications = []
    for (const system of ['MDM', 'ERP']) {
      const deliveryKey = `${e.id}:${proposal.revision}:${system}`,
        requestHash = hash(proposal)
      let row = await m
        .getRepository(MaterialMockDeliveryEntity)
        .findOneBy({ scopeKey: e.scopeKey, deliveryKey })
      if (row && row.requestHash !== requestHash)
        throw new ConflictException('mock_delivery_payload_changed')
      if (!row) {
        row = m
          .getRepository(MaterialMockDeliveryEntity)
          .create({
            ...scoped(s),
            scopeKey: e.scopeKey,
            caseId: e.id,
            deliveryKey,
            system,
            requestHash,
            payload: proposal,
            externalReference: `MOCK-${system}-${hash(deliveryKey).slice(0, 12)}`,
          })
        await m.save(row)
      }
      e.snapshot.publications.push({
        system,
        operationId,
        status: 'confirmed',
        externalReference: row.externalReference,
        errorCode: null,
        at: row.createdAt.toISOString(),
      })
    }
    for (const mapping of proposal.mappings) {
      const source = e.snapshot.materials.find((v) => v.id === mapping.sourceId)
      if (!source) throw new BadRequestException('mapping_source_missing')
      const fingerprint = materialFingerprint(source),
        existing = await m
          .getRepository(MaterialGoldenEntity)
          .findOneBy({ scopeKey: e.scopeKey, goldenId: mapping.goldenId })
      if (existing && existing.fingerprint !== fingerprint)
        throw new ConflictException('golden_identity_conflict')
      if (!existing)
        await m.save(
          m
            .getRepository(MaterialGoldenEntity)
            .create({
              ...scoped(s),
              scopeKey: e.scopeKey,
              goldenId: mapping.goldenId,
              fingerprint,
              material: source,
            }),
        )
      await m
        .getRepository(MaterialAliasEntity)
        .upsert(
          {
            ...scoped(s),
            scopeKey: e.scopeKey,
            system: source.system,
            plant: source.plant,
            localCode: source.code,
            sourceReference: source.id,
            goldenId: mapping.goldenId,
            relation: mapping.relation,
            approvedCaseId: e.id,
          },
          ['scopeKey', 'system', 'plant', 'localCode', 'sourceReference'],
        )
    }
  }
  async dashboard(s: RuntimeScope): Promise<DashboardProjection> {
    const access = await this.readableProjects(s),
      ids = access.map((p) => p.projectId)
    const base = this.db
      .getRepository(MaterialCaseEntity)
      .createQueryBuilder('c')
      .where(
        'c.tenantId=:tenantId AND c.organizationId=:organizationId',
        scoped(s),
      )
      .andWhere(
        ids.length
          ? "((c.projectStatus <> 'ready'  AND c.createdById=:userId) OR c.projectId IN (:...ids))"
          : "(c.projectStatus <> 'ready' AND c.createdById=:userId)",
        { userId: s.userId, ids },
      )
    const grouped = await base
      .clone()
      .select('c.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(c.exposure)', 'exposure')
      .addSelect(
        'SUM(CASE WHEN c.criticalConflict THEN 1 ELSE 0 END)',
        'conflicts',
      )
      .groupBy('c.status')
      .getRawMany<{
        status: string
        count: string
        exposure: string
        conflicts: string
      }>()
    const categories = await base
      .clone()
      .select('c.kind', 'kind')
      .addSelect('COUNT(*)', 'count')
      .groupBy('c.kind')
      .getRawMany<{ kind: CaseKind; count: string }>()
    const queue = await this.db
      .getRepository(MaterialNodeEntity)
      .createQueryBuilder('n')
      .innerJoin(
        MaterialCaseEntity,
        'c',
        'c.id=n.caseId AND c.scopeKey=n.scopeKey',
      )
      .where(
        'c.tenantId=:tenantId AND c.organizationId=:organizationId',
        scoped(s),
      )
      .andWhere(
        ids.length
          ? "((c.projectStatus <> 'ready'  AND c.createdById=:userId) OR c.projectId IN (:...ids))"
          : "(c.projectStatus <> 'ready' AND c.createdById=:userId)",
        { userId: s.userId, ids },
      )
      .select('n.roleKey', 'roleKey')
      .addSelect('n.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('n.roleKey')
      .addGroupBy('n.status')
      .getRawMany<{ roleKey: RoleKey; status: string; count: string }>()
    const count = (...statuses: string[]) =>
      grouped
        .filter((g) => statuses.includes(g.status))
        .reduce((v, g) => v + Number(g.count), 0)
    return {
      generatedAt: new Date().toISOString(),
      total: grouped.reduce((v, g) => v + Number(g.count), 0),
      active: count('open', 'active', 'blocked', 'approved'),
      completed: count('completed'),
      reviewRequired: count('review_required'),
      conflictCount: grouped.reduce((v, g) => v + Number(g.conflicts), 0),
      exposure: grouped.reduce((v, g) => v + Number(g.exposure), 0),
      categories: await Promise.all(
        (['duplicate_codes', 'code_collision', 'drawing_request'] as const).map(
          async (key) => ({
            key,
            count: Number(categories.find((c) => c.kind === key)?.count ?? 0),
            caseIds: (
              await base
                .clone()
                .andWhere('c.kind=:kind', { kind: key })
                .select('c.id')
                .orderBy('c.createdAt', 'DESC')
                .take(50)
                .getMany()
            ).map((c) => c.id),
          }),
        ),
      ),
      roleQueues: ROLES.filter((r) => r.key !== 'coordinator').map((r) => ({
        roleKey: r.key,
        ready: Number(
          queue.find((q) => q.roleKey === r.key && q.status === 'ready')
            ?.count ?? 0,
        ),
        running: Number(
          queue.find((q) => q.roleKey === r.key && q.status === 'running')
            ?.count ?? 0,
        ),
        completed: Number(
          queue.find((q) => q.roleKey === r.key && q.status === 'completed')
            ?.count ?? 0,
        ),
      })),
    }
  }
}
